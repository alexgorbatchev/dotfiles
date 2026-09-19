package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite"
)

// maxOpenConns bounds the registry connection pool.
const maxOpenConns = 10

// NewConnection opens a database connection using modernc.org/sqlite,
// configures a connection pool, runs WAL & busy timeout PRAGMAs,
// and initializes the database schema. It respects context cancellation.
// For dry-runs, swap the dsn to ":memory:" (Option A) to execute queries
// natively in memory without mutating physical disk state.
func NewConnection(ctx context.Context, dsn string) (*sql.DB, error) {
	// Ensure the parent directory exists for file-backed databases
	cleanPath := dsn
	if strings.HasPrefix(cleanPath, "file:") {
		cleanPath = strings.TrimPrefix(cleanPath, "file:")
		if idx := strings.IndexByte(cleanPath, '?'); idx != -1 {
			cleanPath = cleanPath[:idx]
		}
	}
	if cleanPath != ":memory:" && cleanPath != "" && !strings.Contains(dsn, "mode=memory") {
		dir := filepath.Dir(cleanPath)
		if dir != "." && dir != "/" && dir != "" {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return nil, fmt.Errorf("failed to create database directory: %w", err)
			}
		}
	}

	inMemory := isInMemoryDSN(dsn, cleanPath)
	if inMemory {
		dsn = newSharedMemoryDSN()
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Configure connection pool with reasonable connection limits
	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if inMemory {
		// A shared-cache in-memory database lives only as long as a connection to it
		// is open, so the pool must not be allowed to retire the last one and take
		// the schema and every row with it.
		db.SetConnMaxLifetime(0)
		db.SetConnMaxIdleTime(0)
		db.SetMaxIdleConns(maxOpenConns)
	}

	// Run performance PRAGMAs
	pragmas := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA synchronous=NORMAL;",
		"PRAGMA busy_timeout=5000;",
	}
	for _, pragma := range pragmas {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to execute pragma %q: %w", pragma, err)
		}
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
		operation_id TEXT NOT NULL,
		content_hash TEXT,
		block_id TEXT,
		target_mode TEXT
	);`

	if _, err := db.ExecContext(ctx, fileOpsSchema); err != nil {
		return fmt.Errorf("failed to create file_operations table: %w", err)
	}

	// A database written before drift tracking existed already has the table, so
	// CREATE TABLE IF NOT EXISTS leaves it at the old shape and the columns have to
	// be added separately.
	if err := ensureColumns(ctx, db, "file_operations", driftColumns); err != nil {
		return fmt.Errorf("failed to migrate file_operations drift columns: %w", err)
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
	if err := ensureColumns(ctx, db, "tool_installations", installMethodColumns); err != nil {
		return fmt.Errorf("failed to migrate install_method column: %w", err)
	}

	// 3. Create tool_usage table
	toolUsageSchema := `
	CREATE TABLE IF NOT EXISTS tool_usage (
		tool_name TEXT NOT NULL,
		binary_name TEXT NOT NULL,
		usage_count INTEGER NOT NULL DEFAULT 0,
		last_used_at INTEGER NOT NULL,
		PRIMARY KEY (tool_name, binary_name)
	);`

	if _, err := db.ExecContext(ctx, toolUsageSchema); err != nil {
		return fmt.Errorf("failed to create tool_usage table: %w", err)
	}

	if _, err := db.ExecContext(ctx, "CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_name ON tool_usage(tool_name);"); err != nil {
		return fmt.Errorf("failed to create index for tool_usage: %w", err)
	}

	return nil
}

// column is one column a table is expected to have. SQLite can only add a column to
// an existing table, never change or drop one, so a column listed here must be
// nullable or carry a default: rows written before it existed keep whatever the
// declaration gives them.
type column struct {
	name       string
	definition string
}

// driftColumns are what file_operations gained when drift tracking arrived.
//
// content_hash is the SHA-256 of exactly what dotfiles wrote, which is the base
// version a later run compares the file on disk against. block_id names the managed
// block a partial-file operation owns, and is empty for an operation that owns the
// whole file. target_mode is the permission the author declared, which is not the
// same thing as the existing permissions column: that one records the mode a file was
// actually written with, so comparing the two is how a mode drifting away from its
// declaration is noticed.
var driftColumns = []column{
	{name: "content_hash", definition: "TEXT"},
	{name: "block_id", definition: "TEXT"},
	{name: "target_mode", definition: "TEXT"},
}

// installMethodColumns is the older migration, kept in the same form as the rest.
var installMethodColumns = []column{
	{name: "install_method", definition: "TEXT"},
}

// ensureColumns adds every column the table is missing, and leaves the ones it
// already has alone so that opening an up-to-date database is a no-op.
func ensureColumns(ctx context.Context, db *sql.DB, table string, columns []column) error {
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return fmt.Errorf("querying table_info for %s: %w", table, err)
	}

	existing := make(map[string]bool)
	for rows.Next() {
		var cid, notnull, pk int
		var name, ctype string
		var dfltValue any
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			rows.Close()
			return fmt.Errorf("scanning table_info row for %s: %w", table, err)
		}
		existing[name] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("iterating table_info rows for %s: %w", table, err)
	}
	// Closed before the ALTERs rather than deferred: SQLite will not change a table
	// while a statement is still reading it.
	rows.Close()

	for _, col := range columns {
		if existing[col.name] {
			continue
		}
		alter := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, col.name, col.definition)
		if _, err := db.ExecContext(ctx, alter); err != nil {
			return fmt.Errorf("adding %s column to %s: %w", col.name, table, err)
		}
	}

	return nil
}

// isInMemoryDSN reports whether a DSN names a database that lives only in the
// process's memory, in either of the two spellings SQLite accepts for one.
func isInMemoryDSN(dsn, cleanPath string) bool {
	return cleanPath == ":memory:" || strings.Contains(dsn, "mode=memory")
}

// memoryDBSequence names each in-memory database opened by this process.
var memoryDBSequence atomic.Uint64

// newSharedMemoryDSN returns a DSN for an in-memory database that every
// connection in one pool opens the same copy of, which is what makes it behave
// like the file-backed database it stands in for. Bare ":memory:" does the
// opposite: it gives each connection a private, empty database. The name is
// unique per call so that two databases opened in the same process, such as two
// commands run by one test binary, stay isolated from each other.
func newSharedMemoryDSN() string {
	return fmt.Sprintf("file:dotfiles-memory-%d-%d?mode=memory&cache=shared", os.Getpid(), memoryDBSequence.Add(1))
}
