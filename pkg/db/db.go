package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// NewConnection opens a database connection using modernc.org/sqlite,
// configures a connection pool, runs WAL & busy timeout PRAGMAs,
// and initializes the database schema. It respects context cancellation.
// For dry-runs, swap the dsn to ":memory:" (Option A) to execute queries
// natively in memory without mutating physical disk state.
func NewConnection(ctx context.Context, dsn string) (*sql.DB, error) {
	// If it's not an in-memory database, ensure the parent directory exists
	if !strings.HasPrefix(dsn, "file:") && dsn != ":memory:" && dsn != "" {
		dir := filepath.Dir(dsn)
		if dir != "." && dir != "/" {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return nil, fmt.Errorf("failed to create database directory: %w", err)
			}
		}
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Configure connection pool with reasonable connection limits
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	// Run performance PRAGMAs
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode=WAL;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA busy_timeout=5000;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}

	// Initialize database schemas
	if err := InitializeSchema(ctx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return db, nil
}

// InitializeSchema sets up the required tables and indexes.
func InitializeSchema(ctx context.Context, db *sql.DB) error {
	// 1. Create file_operations table
	fileOpsSchema := `
	CREATE TABLE IF NOT EXISTS file_operations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		tool_name TEXT NOT NULL,
		operation_type TEXT NOT NULL,
		file_path TEXT NOT NULL,
		target_path TEXT,
		file_type TEXT NOT NULL,
		metadata TEXT,
		size_bytes INTEGER,
		permissions TEXT,
		created_at INTEGER NOT NULL,
		operation_id TEXT NOT NULL
	);`

	if _, err := db.ExecContext(ctx, fileOpsSchema); err != nil {
		return fmt.Errorf("failed to create file_operations table: %w", err)
	}

	// Create indices for file_operations
	fileOpsIndexes := []string{
		"CREATE INDEX IF NOT EXISTS idx_tool_name ON file_operations(tool_name);",
		"CREATE INDEX IF NOT EXISTS idx_file_path ON file_operations(file_path);",
		"CREATE INDEX IF NOT EXISTS idx_operation_type ON file_operations(operation_type);",
		"CREATE INDEX IF NOT EXISTS idx_created_at ON file_operations(created_at);",
		"CREATE INDEX IF NOT EXISTS idx_operation_id ON file_operations(operation_id);",
	}

	for _, query := range fileOpsIndexes {
		if _, err := db.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to create index for file_operations: %w", err)
		}
	}

	// 2. Create tool_installations table (removed redundant UNIQUE(tool_name) constraint)
	toolInstsSchema := `
	CREATE TABLE IF NOT EXISTS tool_installations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		tool_name TEXT NOT NULL UNIQUE,
		version TEXT NOT NULL,
		install_path TEXT NOT NULL,
		timestamp TEXT NOT NULL,
		installed_at INTEGER NOT NULL,
		binary_paths TEXT NOT NULL,
		download_url TEXT,
		asset_name TEXT,
		configured_version TEXT,
		original_tag TEXT,
		install_method TEXT
	);`

	if _, err := db.ExecContext(ctx, toolInstsSchema); err != nil {
		return fmt.Errorf("failed to create tool_installations table: %w", err)
	}

	// Run migration to add install_method if not present
	if err := migrateAddInstallMethod(ctx, db); err != nil {
		return fmt.Errorf("failed to migrate install_method column: %w", err)
	}

	return nil
}

// migrateAddInstallMethod checks if install_method column exists, and if not, adds it.
func migrateAddInstallMethod(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, "PRAGMA table_info(tool_installations)")
	if err != nil {
		return fmt.Errorf("querying table_info for tool_installations: %w", err)
	}
	defer rows.Close()

	hasInstallMethod := false
	for rows.Next() {
		var cid int
		var name string
		var ctype string
		var notnull int
		var dfltValue any
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return fmt.Errorf("scanning table_info row: %w", err)
		}
		if name == "install_method" {
			hasInstallMethod = true
			break
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterating table_info rows: %w", err)
	}

	if !hasInstallMethod {
		if _, err := db.ExecContext(ctx, "ALTER TABLE tool_installations ADD COLUMN install_method TEXT"); err != nil {
			return fmt.Errorf("adding install_method column to tool_installations: %w", err)
		}
	}

	return nil
}
