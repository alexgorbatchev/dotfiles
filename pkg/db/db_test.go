package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestNewConnectionInMemory(t *testing.T) {
	ctx := context.Background()
	// Use isolated, named in-memory database to prevent test pollution
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to open connection to in-memory database: %v", err)
	}
	defer db.Close()

	// Verify schemas exist by checking we can insert and select from them
	var count int
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM file_operations").Scan(&count)
	if err != nil {
		t.Errorf("file_operations table query failed: %v", err)
	}

	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tool_installations").Scan(&count)
	if err != nil {
		t.Errorf("tool_installations table query failed: %v", err)
	}
}

func TestNewConnectionInvalidDSN(t *testing.T) {
	ctx := context.Background()
	// "/dev/null/db.sqlite" should fail because "/dev/null" is not a directory
	_, err := NewConnection(ctx, "/dev/null/db.sqlite")
	if err == nil {
		t.Error("Expected connection to fail on invalid file path, but it succeeded")
	}
}

func TestNewConnectionFileDSNDirectoryCreation(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "subDir", "test.db")
	dsn := "file:" + dbPath

	db, err := NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to open connection with file: prefix in non-existent directory: %v", err)
	}
	defer db.Close()

	if _, err := os.Stat(filepath.Join(tmpDir, "subDir")); os.IsNotExist(err) {
		t.Errorf("Expected subDir to be created, but it was not")
	}
}

func TestInitializeSchemaIdempotency(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("Failed to open raw sqlite connection: %v", err)
	}
	defer db.Close()

	// Run multiple times to assert idempotency
	if err := InitializeSchema(ctx, db); err != nil {
		t.Fatalf("First schema initialization failed: %v", err)
	}

	if err := InitializeSchema(ctx, db); err != nil {
		t.Fatalf("Second schema initialization failed: %v", err)
	}
}

func TestMigrateAddInstallMethod(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("Failed to open connection: %v", err)
	}
	defer db.Close()

	// Create tool_installations without the install_method column first to simulate legacy schema
	_, err = db.ExecContext(ctx, `
	CREATE TABLE tool_installations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		tool_name TEXT NOT NULL UNIQUE,
		version TEXT NOT NULL,
		install_path TEXT NOT NULL,
		timestamp TEXT NOT NULL,
		installed_at INTEGER NOT NULL,
		binary_paths TEXT NOT NULL
	);`)
	if err != nil {
		t.Fatalf("Failed to create legacy table: %v", err)
	}

	// Verify column install_method is not yet present
	rows, err := db.QueryContext(ctx, "PRAGMA table_info(tool_installations)")
	if err != nil {
		t.Fatalf("Failed to query table info: %v", err)
	}
	hasCol := false
	for rows.Next() {
		var cid int
		var name string
		var ctype string
		var notnull int
		var dfltValue any
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		if name == "install_method" {
			hasCol = true
		}
	}
	rows.Close()
	if hasCol {
		t.Fatal("Legacy table already has install_method column")
	}

	// Run migration
	if err := migrateAddInstallMethod(ctx, db); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Verify column is now present
	rows2, err := db.QueryContext(ctx, "PRAGMA table_info(tool_installations)")
	if err != nil {
		t.Fatalf("Failed to query table info: %v", err)
	}
	hasCol2 := false
	for rows2.Next() {
		var cid int
		var name string
		var ctype string
		var notnull int
		var dfltValue any
		var pk int
		if err := rows2.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			rows2.Close()
			t.Fatal(err)
		}
		if name == "install_method" {
			hasCol2 = true
		}
	}
	rows2.Close()
	if !hasCol2 {
		t.Fatal("Migration failed to add install_method column")
	}

	// Running migration again should be safe and do nothing
	if err := migrateAddInstallMethod(ctx, db); err != nil {
		t.Fatalf("Subsequent migration call failed: %v", err)
	}
}

func TestNewConnectionPragmasAndConcurrency(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to open connection: %v", err)
	}
	defer db.Close()

	// 1. Verify synchronous pragma is NORMAL (1)
	var syncMode int
	err = db.QueryRowContext(ctx, "PRAGMA synchronous").Scan(&syncMode)
	if err != nil {
		t.Fatalf("failed to query synchronous pragma: %v", err)
	}
	if syncMode != 1 {
		t.Errorf("expected synchronous mode to be 1 (NORMAL), got %d", syncMode)
	}

	// 2. Verify busy timeout is set (5000 milliseconds)
	var busyTimeout int
	err = db.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&busyTimeout)
	if err != nil {
		t.Fatalf("failed to query busy_timeout pragma: %v", err)
	}
	if busyTimeout != 5000 {
		t.Errorf("expected busy_timeout to be 5000, got %d", busyTimeout)
	}

	// 3. Verify concurrent writes succeed without locks/crashes
	const goroutinesCount = 10
	var wg sync.WaitGroup
	wg.Add(goroutinesCount)

	for i := 0; i < goroutinesCount; i++ {
		go func(id int) {
			defer wg.Done()
			toolName := fmt.Sprintf("tool-%d", id)
			_, err := db.ExecContext(ctx, `
				INSERT OR REPLACE INTO tool_usage (tool_name, binary_name, usage_count, last_used_at)
				VALUES (?, 'bin', 1, ?)`, toolName, time.Now().Unix())
			if err != nil {
				t.Errorf("concurrent insert failed: %v", err)
			}
		}(i)
	}

	wg.Wait()

	// Verify all records were written
	var count int
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tool_usage").Scan(&count)
	if err != nil {
		t.Fatalf("failed to query tool_usage count: %v", err)
	}
	if count != goroutinesCount {
		t.Errorf("expected %d tool_usage records, got %d", goroutinesCount, count)
	}
}

func TestNewConnectionContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	_, err := NewConnection(ctx, dsn)
	if err == nil {
		t.Error("expected error when context is cancelled, got nil")
	}

	// Context with past deadline
	pastCtx, pastCancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Hour))
	defer pastCancel()
	_, err = NewConnection(pastCtx, dsn)
	if err == nil {
		t.Error("expected error when context is past deadline, got nil")
	}
}

func TestInitializeSchemaContextCancelled(t *testing.T) {
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("failed to open raw sqlite: %v", err)
	}
	defer db.Close()

	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := InitializeSchema(canceledCtx, db); err == nil {
		t.Error("expected InitializeSchema to fail on cancelled context")
	}
}

func TestNewConnectionMkdirAllError(t *testing.T) {
	ctx := context.Background()
	// /dev/null is a character device file, so MkdirAll under /dev/null/subdir will fail
	_, err := NewConnection(ctx, "file:/dev/null/subdir/test.db")
	if err == nil {
		t.Error("expected error when MkdirAll fails")
	}
}

func TestMigrateAddInstallMethodErrors(t *testing.T) {
	ctx := context.Background()

	// 1. QueryContext fails on closed DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("failed to open raw sqlite: %v", err)
	}
	db.Close() // Close immediately

	if err := migrateAddInstallMethod(ctx, db); err == nil {
		t.Error("expected migrateAddInstallMethod to fail on closed db")
	}

	// 2. ALTER TABLE fails on view
	db2, err := sql.Open("sqlite", fmt.Sprintf("file:%s_view?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db2.Close()

	_, err = db2.ExecContext(ctx, "CREATE TABLE base (id INT); CREATE VIEW tool_installations AS SELECT id FROM base;")
	if err != nil {
		t.Fatalf("failed to create view: %v", err)
	}

	if err := migrateAddInstallMethod(ctx, db2); err == nil {
		t.Error("expected migrateAddInstallMethod to fail ALTER TABLE on view")
	}
}

func TestInitializeSchemaErrors(t *testing.T) {
	ctx := context.Background()

	// 1. file_operations created as view without tool_name column -> index creation fails
	db1, err := sql.Open("sqlite", fmt.Sprintf("file:%s_fo?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db1.Close()

	_, err = db1.ExecContext(ctx, "CREATE TABLE file_operations (dummy INT);")
	if err != nil {
		t.Fatalf("failed to create dummy table: %v", err)
	}

	if err := InitializeSchema(ctx, db1); err == nil {
		t.Error("expected InitializeSchema to fail index creation on file_operations")
	}

	// 2. tool_installations created as invalid schema
	db2, err := sql.Open("sqlite", fmt.Sprintf("file:%s_ti?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db2.Close()

	_, err = db2.ExecContext(ctx, "CREATE TABLE file_operations (id INT PRIMARY KEY, tool_name TEXT, operation_type TEXT, file_path TEXT, target_path TEXT, file_type TEXT, metadata TEXT, size_bytes INT, permissions TEXT, created_at INT, operation_id TEXT);")
	if err != nil {
		t.Fatalf("failed to create file_operations table: %v", err)
	}
	_, err = db2.ExecContext(ctx, "CREATE VIEW tool_installations AS SELECT 1;")
	if err != nil {
		t.Fatalf("failed to create tool_installations view: %v", err)
	}

	if err := InitializeSchema(ctx, db2); err == nil {
		t.Error("expected InitializeSchema to fail migrateAddInstallMethod on view")
	}

	// 3. tool_usage created as invalid table
	db3, err := sql.Open("sqlite", fmt.Sprintf("file:%s_tu?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db3.Close()

	_, err = db3.ExecContext(ctx, "CREATE TABLE file_operations (id INT PRIMARY KEY, tool_name TEXT, operation_type TEXT, file_path TEXT, target_path TEXT, file_type TEXT, metadata TEXT, size_bytes INT, permissions TEXT, created_at INT, operation_id TEXT);")
	if err != nil {
		t.Fatalf("failed to create file_operations: %v", err)
	}
	_, err = db3.ExecContext(ctx, "CREATE TABLE tool_installations (id INT PRIMARY KEY, tool_name TEXT UNIQUE, version TEXT, install_path TEXT, timestamp TEXT, installed_at INT, binary_paths TEXT, install_method TEXT);")
	if err != nil {
		t.Fatalf("failed to create tool_installations: %v", err)
	}
	_, err = db3.ExecContext(ctx, "CREATE TABLE tool_usage (id INT);")
	if err != nil {
		t.Fatalf("failed to create dummy tool_usage: %v", err)
	}

	// 4. tool_installations table creation fails
	db4, err := sql.Open("sqlite", fmt.Sprintf("file:%s_ti_fail?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db4.Close()

	// Create file_operations validly
	_, _ = db4.ExecContext(ctx, "CREATE TABLE file_operations (id INTEGER PRIMARY KEY, tool_name TEXT, operation_type TEXT, file_path TEXT, target_path TEXT, file_type TEXT, metadata TEXT, size_bytes INTEGER, permissions TEXT, created_at INTEGER, operation_id TEXT);")
	// Create an index named tool_installations so CREATE TABLE tool_installations fails
	_, _ = db4.ExecContext(ctx, "CREATE INDEX tool_installations ON file_operations(file_path);")

	if err := InitializeSchema(ctx, db4); err == nil {
		t.Error("expected InitializeSchema to fail on tool_installations table creation")
	}

	// 5. tool_usage table creation fails
	db5, err := sql.Open("sqlite", fmt.Sprintf("file:%s_tu_fail?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db5.Close()

	_, _ = db5.ExecContext(ctx, "CREATE TABLE file_operations (id INTEGER PRIMARY KEY, tool_name TEXT, operation_type TEXT, file_path TEXT, target_path TEXT, file_type TEXT, metadata TEXT, size_bytes INTEGER, permissions TEXT, created_at INTEGER, operation_id TEXT);")
	_, _ = db5.ExecContext(ctx, "CREATE TABLE tool_installations (id INTEGER PRIMARY KEY, tool_name TEXT UNIQUE, version TEXT, install_path TEXT, timestamp TEXT, installed_at INTEGER, binary_paths TEXT, install_method TEXT);")
	_, _ = db5.ExecContext(ctx, "CREATE INDEX tool_usage ON file_operations(file_path);")

	if err := InitializeSchema(ctx, db5); err == nil {
		t.Error("expected InitializeSchema to fail on tool_usage table creation")
	}
}
