package registry

import "fmt"

// ErrTransactionRequired is returned when a write operation is attempted without a transaction.
var ErrTransactionRequired = fmt.Errorf("transaction is required for database writes")

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
