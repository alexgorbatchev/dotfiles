package db

import (
	"context"
	"database/sql"
	"fmt"
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
