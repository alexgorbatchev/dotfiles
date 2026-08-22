package registry

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

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

	uHome, _ := os.UserHomeDir()

	fileStates := make(map[string]*FileState)
	for i := len(ops) - 1; i >= 0; i-- {
		op := ops[i]
		keyPath := op.FilePath
		if uHome != "" && strings.HasPrefix(keyPath, "~") {
			keyPath = filepath.Join(uHome, keyPath[1:])
		}

		if op.OperationType == "rm" {
			delete(fileStates, keyPath)
			delete(fileStates, op.FilePath)
		} else {
			state, exists := fileStates[keyPath]
			if !exists {
				state = &FileState{FilePath: keyPath}
				fileStates[keyPath] = state
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

	if ops[0].OperationType == "rm" {
		return nil, nil
	}

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
