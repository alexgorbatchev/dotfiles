package registry

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

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
	if r == nil || r.db == nil {
		return nil, nil
	}
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
			return nil, fmt.Errorf("scanning tool installation record: %w", err)
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

// RecordToolUsage increments or inserts a binary usage counter.
func (r *Registry) RecordToolUsage(ctx context.Context, tx *sql.Tx, record *ToolUsageRecord) error {
	if tx == nil {
		return ErrTransactionRequired
	}

	query := `
	INSERT INTO tool_usage (
		tool_name, binary_name, usage_count, last_used_at
	) VALUES (?, ?, ?, ?)
	ON CONFLICT(tool_name, binary_name) DO UPDATE SET
		usage_count = tool_usage.usage_count + EXCLUDED.usage_count,
		last_used_at = EXCLUDED.last_used_at;`

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

// GetToolUsage retrieves the usage record for a specific tool binary.
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

// GetToolUsagesForTool fetches all usage records for a specific tool.
func (r *Registry) GetToolUsagesForTool(ctx context.Context, toolName string) ([]*ToolUsageRecord, error) {
	query := `
	SELECT tool_name, binary_name, usage_count, last_used_at
	FROM tool_usage WHERE tool_name = ? ORDER BY binary_name ASC;`

	rows, err := r.db.QueryContext(ctx, query, toolName)
	if err != nil {
		return nil, fmt.Errorf("querying tool usages for %s: %w", toolName, err)
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
			return nil, fmt.Errorf("scanning tool usage record: %w", err)
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

// GetToolUsages fetches all recorded binary usage records across all tools.
func (r *Registry) GetToolUsages(ctx context.Context) ([]*ToolUsageRecord, error) {
	query := `
	SELECT tool_name, binary_name, usage_count, last_used_at
	FROM tool_usage ORDER BY tool_name ASC, binary_name ASC;`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying all tool usages: %w", err)
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
			return nil, fmt.Errorf("scanning tool usage record: %w", err)
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}
