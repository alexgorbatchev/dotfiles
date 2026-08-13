package registry

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

// ErrTransactionRequired is returned when a write operation is attempted without a transaction.
var ErrTransactionRequired = fmt.Errorf("transaction is required for database writes")

// Permission represents a filesystem permission string, serialized to JSON as a base-10 decimal number.
type Permission string

func (p Permission) MarshalJSON() ([]byte, error) {
	s := string(p)
	if s == "" {
		return []byte("0"), nil
	}
	sClean := s
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		sClean = sClean[2:]
	}
	val, err := strconv.ParseUint(sClean, 8, 32)
	if err != nil {
		// Try parsing as decimal if it fails
		valDec, errDec := strconv.ParseUint(sClean, 10, 32)
		if errDec == nil {
			return []byte(strconv.FormatUint(valDec, 10)), nil
		}
		return nil, fmt.Errorf("invalid octal permission %q: %w", s, err)
	}
	return []byte(strconv.FormatUint(val, 10)), nil
}

func (p *Permission) UnmarshalJSON(b []byte) error {
	s := string(b)
	if s == "null" || s == "" {
		*p = ""
		return nil
	}
	// Trim quotes just in case the input is represented as a quoted string
	sClean := strings.Trim(s, `"`)
	val, err := strconv.ParseUint(sClean, 10, 32)
	if err != nil {
		return fmt.Errorf("invalid json number for permission %q: %w", s, err)
	}
	*p = Permission(fmt.Sprintf("0%o", val))
	return nil
}

func (p *Permission) Scan(value interface{}) error {
	if value == nil {
		*p = ""
		return nil
	}
	var s string
	switch v := value.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("unsupported type for Permission Scan: %T", value)
	}
	*p = Permission(DecimalToOctalPerm(s))
	return nil
}

func (p Permission) Value() (driver.Value, error) {
	if p == "" {
		return nil, nil
	}
	return OctalToDecimalPerm(string(p)), nil
}

type FileOperationRecord struct {
	ID            int64       `db:"id"`
	ToolName      string      `db:"tool_name"`
	OperationType string      `db:"operation_type"` // e.g., "symlink", "shim", "write"
	FilePath      string      `db:"file_path"`
	TargetPath    *string     `db:"target_path"`
	FileType      string      `db:"file_type"`
	Metadata      *string     `db:"metadata"`
	SizeBytes     *int64      `db:"size_bytes"`
	Permissions   *Permission `db:"permissions" json:"permissions"`
	CreatedAt     int64       `db:"created_at"` // Unix millisecond epoch
	OperationID   string      `db:"operation_id"`
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
	FilePath      string      `json:"filePath"`
	ToolName      string      `json:"toolName"`
	FileType      string      `json:"fileType"`
	LastOperation string      `json:"lastOperation"`
	TargetPath    *string     `json:"targetPath"`
	LastModified  int64       `json:"lastModified"`
	Metadata      *string     `json:"metadata"`
	SizeBytes     *int64      `json:"sizeBytes"`
	Permissions   *Permission `json:"permissions" db:"permissions"`
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
			state, exists := fileStates[op.FilePath]
			if !exists {
				state = &FileState{FilePath: op.FilePath}
				fileStates[op.FilePath] = state
			}
			state.LastOperation = op.OperationType
			state.LastModified = op.CreatedAt
			if op.ToolName != "" {
				state.ToolName = op.ToolName
			}
			if op.FileType != "" {
				state.FileType = op.FileType
			}
			if op.TargetPath != nil {
				state.TargetPath = op.TargetPath
			}
			if op.Metadata != nil {
				state.Metadata = op.Metadata
			}
			if op.SizeBytes != nil {
				state.SizeBytes = op.SizeBytes
			}
			if op.Permissions != nil {
				state.Permissions = op.Permissions
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

	// If newest operation is "rm", file does not exist
	if ops[0].OperationType == "rm" {
		return nil, nil
	}

	// Accumulate state chronologically from oldest operation to newest
	var state *FileState
	for i := len(ops) - 1; i >= 0; i-- {
		op := ops[i]
		if op.OperationType == "rm" {
			state = nil
		} else {
			if state == nil {
				state = &FileState{FilePath: filePath}
			}
			state.LastOperation = op.OperationType
			state.LastModified = op.CreatedAt
			if op.ToolName != "" {
				state.ToolName = op.ToolName
			}
			if op.FileType != "" {
				state.FileType = op.FileType
			}
			if op.TargetPath != nil {
				state.TargetPath = op.TargetPath
			}
			if op.Metadata != nil {
				state.Metadata = op.Metadata
			}
			if op.SizeBytes != nil {
				state.SizeBytes = op.SizeBytes
			}
			if op.Permissions != nil {
				state.Permissions = op.Permissions
			}
		}
	}

	return state, nil
}

// GetRegisteredTools queries distinct tool names registered in active (non-deleted) file operations.
func (r *Registry) GetRegisteredTools(ctx context.Context) ([]string, error) {
	ops, err := r.GetFileOperations(ctx, FileOperationFilter{})
	if err != nil {
		return nil, fmt.Errorf("getting registered tools: %w", err)
	}

	latestOperationByFilePath := make(map[string]*FileOperationRecord)
	for _, op := range ops {
		if _, exists := latestOperationByFilePath[op.FilePath]; !exists {
			latestOperationByFilePath[op.FilePath] = op
		}
	}

	toolSet := make(map[string]bool)
	for _, op := range latestOperationByFilePath {
		if op.OperationType != "rm" {
			toolSet[op.ToolName] = true
		}
	}

	var tools []string
	for t := range toolSet {
		tools = append(tools, t)
	}
	sort.Strings(tools)
	return tools, nil
}

type ValidationResult struct {
	Valid    bool     `json:"valid"`
	Issues   []string `json:"issues"`
	Repaired []string `json:"repaired"`
}

// Compact removes redundant file operation records for files that were ultimately deleted.
func (r *Registry) Compact(ctx context.Context, tx *sql.Tx) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	deletedOps, err := r.GetFileOperations(ctx, FileOperationFilter{OperationType: "rm"})
	if err != nil {
		return fmt.Errorf("getting deleted operations for compact: %w", err)
	}

	for _, deleteOp := range deletedOps {
		finalState, err := r.GetFileState(ctx, deleteOp.FilePath)
		if err != nil {
			return fmt.Errorf("checking file state for compact: %w", err)
		}
		if finalState == nil {
			_, err := tx.ExecContext(ctx, "DELETE FROM file_operations WHERE file_path = ?", deleteOp.FilePath)
			if err != nil {
				return fmt.Errorf("deleting compacted file operations for path %s: %w", deleteOp.FilePath, err)
			}
		}
	}
	return nil
}

// Validate checks file operation registry integrity.
func (r *Registry) Validate(ctx context.Context) (*ValidationResult, error) {
	var issues []string
	repaired := []string{}

	rows, err := r.db.QueryContext(ctx, `
		SELECT operation_id, COUNT(*) as count 
		FROM file_operations 
		GROUP BY operation_id 
		HAVING count > 1
	`)
	if err != nil {
		return nil, fmt.Errorf("querying duplicate operation IDs: %w", err)
	}
	defer rows.Close()

	dupCount := 0
	for rows.Next() {
		dupCount++
	}
	if dupCount > 0 {
		issues = append(issues, fmt.Sprintf("Found %d duplicate operation IDs", dupCount))
	}

	symlinks, err := r.GetFileOperations(ctx, FileOperationFilter{OperationType: "symlink"})
	if err != nil {
		return nil, fmt.Errorf("getting symlink operations: %w", err)
	}
	for _, symlink := range symlinks {
		if symlink.TargetPath != nil && *symlink.TargetPath != "" {
			targetState, err := r.GetFileState(ctx, *symlink.TargetPath)
			if err != nil {
				return nil, fmt.Errorf("getting target state for symlink %s: %w", symlink.FilePath, err)
			}
			if targetState == nil {
				issues = append(issues, fmt.Sprintf("Symlink %s points to missing target %s", symlink.FilePath, *symlink.TargetPath))
			}
		}
	}

	return &ValidationResult{
		Valid:    len(issues) == 0,
		Issues:   issues,
		Repaired: repaired,
	}, nil
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

	res, err := tx.ExecContext(ctx, query,
		record.ToolName,
		record.OperationType,
		record.FilePath,
		record.TargetPath,
		record.FileType,
		record.Metadata,
		record.SizeBytes,
		record.Permissions,
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

// IsToolInstalled checks if a tool (and optionally a specific version) is recorded as installed.
func (r *Registry) IsToolInstalled(ctx context.Context, toolName string, version string) (bool, error) {
	var query string
	var args []interface{}
	if version != "" {
		query = "SELECT 1 FROM tool_installations WHERE tool_name = ? AND version = ?"
		args = []interface{}{toolName, version}
	} else {
		query = "SELECT 1 FROM tool_installations WHERE tool_name = ?"
		args = []interface{}{toolName}
	}

	var dummy int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("checking tool installation: %w", err)
	}
	return true, nil
}

// ToolInstallationUpdate specifies fields to update on an existing tool installation record.
type ToolInstallationUpdate struct {
	Version           *string
	InstallPath       *string
	Timestamp         *string
	BinaryPaths       *string
	DownloadURL       *string
	AssetName         *string
	ConfiguredVersion *string
	OriginalTag       *string
	InstallMethod     *string
}

// UpdateToolInstallation performs a partial update on a tool installation record.
func (r *Registry) UpdateToolInstallation(ctx context.Context, tx *sql.Tx, toolName string, updates ToolInstallationUpdate) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	var fields []string
	var args []interface{}

	if updates.Version != nil {
		fields = append(fields, "version = ?")
		args = append(args, *updates.Version)
	}
	if updates.InstallPath != nil {
		fields = append(fields, "install_path = ?")
		args = append(args, *updates.InstallPath)
	}
	if updates.Timestamp != nil {
		fields = append(fields, "timestamp = ?")
		args = append(args, *updates.Timestamp)
	}
	if updates.BinaryPaths != nil {
		fields = append(fields, "binary_paths = ?")
		args = append(args, *updates.BinaryPaths)
	}
	if updates.DownloadURL != nil {
		fields = append(fields, "download_url = ?")
		args = append(args, *updates.DownloadURL)
	}
	if updates.AssetName != nil {
		fields = append(fields, "asset_name = ?")
		args = append(args, *updates.AssetName)
	}
	if updates.ConfiguredVersion != nil {
		fields = append(fields, "configured_version = ?")
		args = append(args, *updates.ConfiguredVersion)
	}
	if updates.OriginalTag != nil {
		fields = append(fields, "original_tag = ?")
		args = append(args, *updates.OriginalTag)
	}
	if updates.InstallMethod != nil {
		fields = append(fields, "install_method = ?")
		args = append(args, *updates.InstallMethod)
	}

	if len(fields) == 0 {
		return nil
	}

	args = append(args, toolName)
	query := fmt.Sprintf("UPDATE tool_installations SET %s WHERE tool_name = ?", strings.Join(fields, ", "))

	_, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("updating tool installation for %s: %w", toolName, err)
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
	sClean := strings.TrimSpace(s)
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		sClean = sClean[2:]
		val, err := strconv.ParseUint(sClean, 8, 32)
		if err == nil {
			return strconv.FormatUint(val, 10)
		}
		return s
	}
	if strings.HasPrefix(sClean, "0") && len(sClean) > 1 {
		val, err := strconv.ParseUint(sClean[1:], 8, 32)
		if err == nil {
			return strconv.FormatUint(val, 10)
		}
		return s
	}
	valDec, errDec := strconv.ParseUint(sClean, 10, 32)
	if errDec != nil {
		valOct, errOct := strconv.ParseUint(sClean, 8, 32)
		if errOct == nil {
			return strconv.FormatUint(valOct, 10)
		}
		return s
	}
	if valDec > 511 {
		valOct, errOct := strconv.ParseUint(sClean, 8, 32)
		if errOct == nil {
			return strconv.FormatUint(valOct, 10)
		}
		return sClean
	}
	return sClean
}

// DecimalToOctalPerm converts a decimal permission string (e.g., "493", "420")
// to an octal string with leading zero (e.g., "0755", "0644").
func DecimalToOctalPerm(s string) string {
	if s == "" {
		return ""
	}
	sClean := strings.TrimSpace(s)
	if strings.HasPrefix(sClean, "0o") || strings.HasPrefix(sClean, "0O") {
		return "0" + sClean[2:]
	}
	if strings.HasPrefix(sClean, "0") && len(sClean) > 1 {
		return sClean
	}
	val, err := strconv.ParseUint(sClean, 10, 32)
	if err != nil {
		_, errOct := strconv.ParseUint(sClean, 8, 32)
		if errOct == nil {
			return "0" + sClean
		}
		return s
	}
	if val > 511 {
		return "0" + sClean
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
