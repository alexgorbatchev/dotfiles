package registry

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

// ErrTransactionRequired is returned when a write operation is attempted without a transaction.
var ErrTransactionRequired = fmt.Errorf("transaction is required for database writes")

type FileOperationRecord struct {
	ID            int64   `db:"id"`
	ToolName      string  `db:"tool_name"`
	OperationType string  `db:"operation_type"` // e.g., "symlink", "shim", "write"
	FilePath      string  `db:"file_path"`
	TargetPath    *string `db:"target_path"`
	FileType      string  `db:"file_type"`
	Metadata      *string `db:"metadata"`
	SizeBytes     *int64  `db:"size_bytes"`
	Permissions   *string `db:"permissions"`
	CreatedAt     int64   `db:"created_at"` // Unix millisecond epoch
	OperationID   string  `db:"operation_id"`
}

type ToolInstallationRecord struct {
	ID                int64   `db:"id"`
	ToolName          string  `db:"tool_name"`
	Version           string  `db:"version"`
	InstallPath       string  `db:"install_path"`
	Timestamp         string  `db:"timestamp"`
	InstalledAt       int64   `db:"installed_at"` // Unix millisecond epoch
	BinaryPaths       string  `db:"binary_paths"` // JSON array string
	DownloadURL       *string `db:"download_url"`
	AssetName         *string `db:"asset_name"`
	ConfiguredVersion *string `db:"configured_version"`
	OriginalTag       *string `db:"original_tag"`
	InstallMethod     *string `db:"install_method"`
}

type ToolUsageRecord struct {
	ToolName   string `db:"tool_name" json:"toolName"`
	BinaryName string `db:"binary_name" json:"binaryName"`
	UsageCount int    `db:"usage_count" json:"usageCount"`
	LastUsedAt int64  `db:"last_used_at" json:"lastUsedAt"`
}

type FileState struct {
	FilePath      string  `json:"filePath"`
	ToolName      string  `json:"toolName"`
	FileType      string  `json:"fileType"`
	LastOperation string  `json:"lastOperation"`
	TargetPath    *string `json:"targetPath"`
	LastModified  int64   `json:"lastModified"`
	Metadata      *string `json:"metadata"`
	SizeBytes     *int64  `json:"sizeBytes"`
	Permissions   *string `json:"permissions"`
}

type Stats struct {
	TotalOperations int64 `json:"totalOperations"`
	TotalFiles      int64 `json:"totalFiles"`
	TotalTools      int64 `json:"totalTools"`
	OldestOperation int64 `json:"oldestOperation"`
	NewestOperation int64 `json:"newestOperation"`
}

type FileOperationFilter struct {
	ToolName      string
	OperationType string
	FileType      string
	FilePath      string
	CreatedAfter  int64
	CreatedBefore int64
	OperationID   string
}

// Registry manages database query operations for tracking records.
type Registry struct {
	db *sql.DB
}

// NewRegistry instantiates a new Registry manager with an active database connection.
func NewRegistry(db *sql.DB) *Registry {
	return &Registry{db: db}
}

// Begin starts a database transaction.
func (r *Registry) Begin(ctx context.Context) (*sql.Tx, error) {
	return r.db.BeginTx(ctx, nil)
}

// WithTx runs a function within a transactional block.
func (r *Registry) WithTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := r.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit()
}

// GetFileOperations queries file operations filtering by provided parameters.
func (r *Registry) GetFileOperations(ctx context.Context, filter FileOperationFilter) ([]*FileOperationRecord, error) {
	query := "SELECT id, tool_name, operation_type, file_path, target_path, file_type, metadata, size_bytes, permissions, created_at, operation_id FROM file_operations WHERE 1=1"
	var args []any

	if filter.ToolName != "" {
		query += " AND tool_name = ?"
		args = append(args, filter.ToolName)
	}
	if filter.OperationType != "" {
		query += " AND operation_type = ?"
		args = append(args, filter.OperationType)
	}
	if filter.FileType != "" {
		query += " AND file_type = ?"
		args = append(args, filter.FileType)
	}
	if filter.FilePath != "" {
		query += " AND file_path = ?"
		args = append(args, filter.FilePath)
	}
	if filter.CreatedAfter != 0 {
		query += " AND created_at > ?"
		args = append(args, filter.CreatedAfter)
	}
	if filter.CreatedBefore != 0 {
		query += " AND created_at < ?"
		args = append(args, filter.CreatedBefore)
	}
	if filter.OperationID != "" {
		query += " AND operation_id = ?"
		args = append(args, filter.OperationID)
	}

	query += " ORDER BY created_at DESC, id DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("querying file operations: %w", err)
	}
	defer rows.Close()

	var records []*FileOperationRecord
	for rows.Next() {
		var rec FileOperationRecord
		err := rows.Scan(
			&rec.ID,
			&rec.ToolName,
			&rec.OperationType,
			&rec.FilePath,
			&rec.TargetPath,
			&rec.FileType,
			&rec.Metadata,
			&rec.SizeBytes,
			&rec.Permissions,
			&rec.CreatedAt,
			&rec.OperationID,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning file operation record: %w", err)
		}
		if rec.Permissions != nil {
			octalStr := DecimalToOctalPerm(*rec.Permissions)
			rec.Permissions = &octalStr
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

// GetFileStatesForTool computes active file states for a given tool name, returned in stable alphabetical order.
func (r *Registry) GetFileStatesForTool(ctx context.Context, toolName string) ([]*FileState, error) {
	ops, err := r.GetFileOperations(ctx, FileOperationFilter{ToolName: toolName})
	if err != nil {
		return nil, err
	}

	// We ordered by created_at DESC, id DESC in GetFileOperations.
	// To process chronologically (oldest first), we iterate from back to front of the slice.
	fileStates := make(map[string]*FileState)
	for i := len(ops) - 1; i >= 0; i-- {
		op := ops[i]
		if op.OperationType == "rm" {
			delete(fileStates, op.FilePath)
		} else {
			fileStates[op.FilePath] = &FileState{
				FilePath:      op.FilePath,
				ToolName:      op.ToolName,
				FileType:      op.FileType,
				LastOperation: op.OperationType,
				TargetPath:    op.TargetPath,
				LastModified:  op.CreatedAt,
				Metadata:      op.Metadata,
				SizeBytes:     op.SizeBytes,
				Permissions:   op.Permissions,
			}
		}
	}

	states := make([]*FileState, 0, len(fileStates))
	for _, s := range fileStates {
		states = append(states, s)
	}

	// Sort states alphabetically by FilePath to ensure deterministic stability
	sort.Slice(states, func(i, j int) bool {
		return states[i].FilePath < states[j].FilePath
	})

	return states, nil
}

// GetFileState returns active file state for a specific file path.
func (r *Registry) GetFileState(ctx context.Context, filePath string) (*FileState, error) {
	ops, err := r.GetFileOperations(ctx, FileOperationFilter{FilePath: filePath})
	if err != nil {
		return nil, err
	}

	if len(ops) == 0 {
		return nil, nil
	}

	newest := ops[0]
	if newest.OperationType == "rm" {
		return nil, nil
	}

	return &FileState{
		FilePath:      newest.FilePath,
		ToolName:      newest.ToolName,
		FileType:      newest.FileType,
		LastOperation: newest.OperationType,
		TargetPath:    newest.TargetPath,
		LastModified:  newest.CreatedAt,
		Metadata:      newest.Metadata,
		SizeBytes:     newest.SizeBytes,
		Permissions:   newest.Permissions,
	}, nil
}

// GetRegisteredTools queries distinct tool names registered in the file operations.
func (r *Registry) GetRegisteredTools(ctx context.Context) ([]string, error) {
	query := "SELECT DISTINCT tool_name FROM file_operations ORDER BY tool_name ASC"
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("getting registered tools: %w", err)
	}
	defer rows.Close()

	var tools []string
	for rows.Next() {
		var tool string
		if err := rows.Scan(&tool); err != nil {
			return nil, err
		}
		tools = append(tools, tool)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return tools, nil
}

// GetStats returns summary database operation statistics.
func (r *Registry) GetStats(ctx context.Context) (*Stats, error) {
	stats := &Stats{}

	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM file_operations").Scan(&stats.TotalOperations)
	if err != nil {
		return nil, fmt.Errorf("getting total operations count: %w", err)
	}

	err = r.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT file_path) FROM file_operations").Scan(&stats.TotalFiles)
	if err != nil {
		return nil, fmt.Errorf("getting total distinct files count: %w", err)
	}

	err = r.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT tool_name) FROM file_operations").Scan(&stats.TotalTools)
	if err != nil {
		return nil, fmt.Errorf("getting total distinct tools count: %w", err)
	}

	var oldest, newest sql.NullInt64
	err = r.db.QueryRowContext(ctx, "SELECT MIN(created_at), MAX(created_at) FROM file_operations").Scan(&oldest, &newest)
	if err != nil {
		return nil, fmt.Errorf("getting oldest/newest timestamps: %w", err)
	}

	if oldest.Valid {
		stats.OldestOperation = oldest.Int64
	}
	if newest.Valid {
		stats.NewestOperation = newest.Int64
	}

	return stats, nil
}

// RecordFileOperation writes a file operation record in a transaction block.
func (r *Registry) RecordFileOperation(ctx context.Context, tx *sql.Tx, record *FileOperationRecord) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	query := `
	INSERT INTO file_operations (
		tool_name, operation_type, file_path, target_path, file_type, metadata, size_bytes, permissions, created_at, operation_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`

	var dbPerm *string
	if record.Permissions != nil {
		dbPermStr := OctalToDecimalPerm(*record.Permissions)
		dbPerm = &dbPermStr
	}

	res, err := tx.ExecContext(ctx, query,
		record.ToolName,
		record.OperationType,
		record.FilePath,
		record.TargetPath,
		record.FileType,
		record.Metadata,
		record.SizeBytes,
		dbPerm,
		record.CreatedAt,
		record.OperationID,
	)
	if err != nil {
		return fmt.Errorf("inserting file operation record: %w", err)
	}

	id, err := res.LastInsertId()
	if err == nil {
		record.ID = id
	}

	return nil
}

// RemoveFileOperationsByTool purges file operation logs for a specific tool.
func (r *Registry) RemoveFileOperationsByTool(ctx context.Context, tx *sql.Tx, toolName string) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	query := "DELETE FROM file_operations WHERE tool_name = ?"
	_, err := tx.ExecContext(ctx, query, toolName)
	if err != nil {
		return fmt.Errorf("deleting file operations for tool: %w", err)
	}

	return nil
}

// RecordToolInstallation persists a tool installation record.
func (r *Registry) RecordToolInstallation(ctx context.Context, tx *sql.Tx, record *ToolInstallationRecord) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	query := `
	INSERT OR REPLACE INTO tool_installations (
		tool_name, version, install_path, timestamp, installed_at, binary_paths, download_url, asset_name, configured_version, original_tag, install_method
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`

	res, err := tx.ExecContext(ctx, query,
		record.ToolName,
		record.Version,
		record.InstallPath,
		record.Timestamp,
		record.InstalledAt,
		record.BinaryPaths,
		record.DownloadURL,
		record.AssetName,
		record.ConfiguredVersion,
		record.OriginalTag,
		record.InstallMethod,
	)
	if err != nil {
		return fmt.Errorf("recording tool installation: %w", err)
	}

	id, err := res.LastInsertId()
	if err == nil {
		record.ID = id
	}

	return nil
}

// RemoveToolInstallation removes a tool installation registry entry.
func (r *Registry) RemoveToolInstallation(ctx context.Context, tx *sql.Tx, toolName string) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	query := "DELETE FROM tool_installations WHERE tool_name = ?"
	_, err := tx.ExecContext(ctx, query, toolName)
	if err != nil {
		return fmt.Errorf("deleting tool installation record: %w", err)
	}

	return nil
}

// GetToolInstallation retrieves a tool installation by its name.
func (r *Registry) GetToolInstallation(ctx context.Context, toolName string) (*ToolInstallationRecord, error) {
	query := `
	SELECT id, tool_name, version, install_path, timestamp, installed_at, binary_paths, download_url, asset_name, configured_version, original_tag, install_method
	FROM tool_installations WHERE tool_name = ?;`

	row := r.db.QueryRowContext(ctx, query, toolName)

	var rec ToolInstallationRecord
	err := row.Scan(
		&rec.ID,
		&rec.ToolName,
		&rec.Version,
		&rec.InstallPath,
		&rec.Timestamp,
		&rec.InstalledAt,
		&rec.BinaryPaths,
		&rec.DownloadURL,
		&rec.AssetName,
		&rec.ConfiguredVersion,
		&rec.OriginalTag,
		&rec.InstallMethod,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scanning tool installation record: %w", err)
	}

	return &rec, nil
}

// GetAllToolInstallations fetches all recorded tool installations.
func (r *Registry) GetAllToolInstallations(ctx context.Context) ([]*ToolInstallationRecord, error) {
	query := `
	SELECT id, tool_name, version, install_path, timestamp, installed_at, binary_paths, download_url, asset_name, configured_version, original_tag, install_method
	FROM tool_installations ORDER BY tool_name ASC;`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying all tool installations: %w", err)
	}
	defer rows.Close()

	var records []*ToolInstallationRecord
	for rows.Next() {
		var rec ToolInstallationRecord
		err := rows.Scan(
			&rec.ID,
			&rec.ToolName,
			&rec.Version,
			&rec.InstallPath,
			&rec.Timestamp,
			&rec.InstalledAt,
			&rec.BinaryPaths,
			&rec.DownloadURL,
			&rec.AssetName,
			&rec.ConfiguredVersion,
			&rec.OriginalTag,
			&rec.InstallMethod,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning tool installation record list: %w", err)
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

// RecordToolUsage persists a tool usage record.
func (r *Registry) RecordToolUsage(ctx context.Context, tx *sql.Tx, record *ToolUsageRecord) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	query := `
	INSERT INTO tool_usage (
		tool_name, binary_name, usage_count, last_used_at
	) VALUES (?, ?, ?, ?)
	ON CONFLICT(tool_name, binary_name) DO UPDATE SET
		usage_count = tool_usage.usage_count + excluded.usage_count,
		last_used_at = excluded.last_used_at;`

	_, err := tx.ExecContext(ctx, query,
		record.ToolName,
		record.BinaryName,
		record.UsageCount,
		record.LastUsedAt,
	)
	if err != nil {
		return fmt.Errorf("recording tool usage: %w", err)
	}

	return nil
}

// GetToolUsage retrieves a tool usage record by name and binary.
func (r *Registry) GetToolUsage(ctx context.Context, toolName, binaryName string) (*ToolUsageRecord, error) {
	query := `
	SELECT tool_name, binary_name, usage_count, last_used_at
	FROM tool_usage WHERE tool_name = ? AND binary_name = ?;`

	row := r.db.QueryRowContext(ctx, query, toolName, binaryName)

	var rec ToolUsageRecord
	err := row.Scan(
		&rec.ToolName,
		&rec.BinaryName,
		&rec.UsageCount,
		&rec.LastUsedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scanning tool usage record: %w", err)
	}

	return &rec, nil
}

// GetToolUsagesForTool retrieves all usage records for a specific tool.
func (r *Registry) GetToolUsagesForTool(ctx context.Context, toolName string) ([]*ToolUsageRecord, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT tool_name, binary_name, usage_count, last_used_at 
		FROM tool_usage 
		WHERE tool_name = ? 
		ORDER BY binary_name
	`, toolName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*ToolUsageRecord
	for rows.Next() {
		var u ToolUsageRecord
		if err := rows.Scan(&u.ToolName, &u.BinaryName, &u.UsageCount, &u.LastUsedAt); err != nil {
			return nil, err
		}
		results = append(results, &u)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

// GetToolUsages retrieves all usage records in the database.
func (r *Registry) GetToolUsages(ctx context.Context) ([]*ToolUsageRecord, error) {
	query := `
	SELECT tool_name, binary_name, usage_count, last_used_at
	FROM tool_usage ORDER BY tool_name ASC, binary_name ASC;`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying tool usages: %w", err)
	}
	defer rows.Close()

	var records []*ToolUsageRecord
	for rows.Next() {
		var rec ToolUsageRecord
		err := rows.Scan(
			&rec.ToolName,
			&rec.BinaryName,
			&rec.UsageCount,
			&rec.LastUsedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning tool usage record list: %w", err)
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

// OctalToDecimalPerm converts an octal permission string (e.g., "0755", "755", "0644")
// to a decimal string (e.g., "493", "420").
func OctalToDecimalPerm(s string) string {
	if s == "" {
		return ""
	}
	sClean := s
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		sClean = sClean[2:]
	}
	// Parse as octal
	val, err := strconv.ParseUint(sClean, 8, 32)
	if err != nil {
		// If it fails to parse as octal, maybe it's already decimal
		_, errDec := strconv.ParseUint(sClean, 10, 32)
		if errDec == nil {
			return sClean
		}
		return s
	}
	return strconv.FormatUint(val, 10)
}

// DecimalToOctalPerm converts a decimal permission string (e.g., "493", "420")
// to an octal string with leading zero (e.g., "0755", "0644").
func DecimalToOctalPerm(s string) string {
	if s == "" {
		return ""
	}
	// Parse as decimal
	val, err := strconv.ParseUint(s, 10, 32)
	if err != nil {
		// If it fails to parse as decimal, maybe it is already octal
		_, errOct := strconv.ParseUint(s, 8, 32)
		if errOct == nil {
			if !strings.HasPrefix(s, "0") {
				return "0" + s
			}
			return s
		}
		return s
	}
	return fmt.Sprintf("0%o", val)
}

// FileModeToDecimalString converts an os.FileMode to its decimal base-10 string representation.
func FileModeToDecimalString(mode os.FileMode) string {
	perm := uint32(mode & os.ModePerm)
	return strconv.FormatUint(uint64(perm), 10)
}

// DecimalStringToMode converts a decimal base-10 string representation back to os.FileMode.
func DecimalStringToMode(s string) (os.FileMode, error) {
	val, err := strconv.ParseUint(s, 10, 32)
	if err != nil {
		return 0, err
	}
	return os.FileMode(val), nil
}
