package db

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNewSnapshot(t *testing.T) {
	for _, journal := range []string{"DELETE", "WAL"} {
		t.Run(journal, func(t *testing.T) {
			ctx := context.Background()
			path := filepath.Join(t.TempDir(), "registry #1%.db")
			source := url.URL{Scheme: "file", Path: "/" + strings.TrimPrefix(filepath.ToSlash(path), "/")}
			live, err := NewConnection(ctx, source.String())
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { live.Close() })
			for _, query := range []string{
				"PRAGMA journal_mode=" + journal,
				"PRAGMA wal_autocheckpoint=0",
				"CREATE TABLE snapshot_test (value TEXT)",
				"INSERT INTO snapshot_test VALUES ('installed')",
			} {
				if _, err := live.ExecContext(ctx, query); err != nil {
					t.Fatal(err)
				}
			}
			before, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := NewSnapshot(ctx, path)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { snapshot.Close() })
			var value string
			if err := snapshot.QueryRowContext(ctx, "SELECT value FROM snapshot_test").Scan(&value); err != nil || value != "installed" {
				t.Fatalf("snapshot value = %q, err = %v", value, err)
			}
			if _, err := snapshot.ExecContext(ctx, "UPDATE snapshot_test SET value='simulated'"); err != nil {
				t.Fatal(err)
			}
			// Hold one connection to force the pool to open another, which must
			// see the same writable snapshot rather than an empty database.
			held, err := snapshot.Conn(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer held.Close()
			if err := snapshot.QueryRowContext(ctx, "SELECT value FROM snapshot_test").Scan(&value); err != nil || value != "simulated" {
				t.Fatalf("pooled snapshot value = %q, err = %v", value, err)
			}
			if err := live.QueryRowContext(ctx, "SELECT value FROM snapshot_test").Scan(&value); err != nil || value != "installed" {
				t.Fatalf("live value = %q, err = %v", value, err)
			}
			after, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(before, after) {
				t.Fatalf("snapshot changed live database bytes: %v", err)
			}
		})
	}
}

func TestNewSnapshotMissingAndInvalid(t *testing.T) {
	for _, invalid := range []bool{false, true} {
		t.Run(fmt.Sprint(invalid), func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "registry.db")
			if invalid {
				if err := os.WriteFile(path, []byte("not sqlite"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			snapshot, err := NewSnapshot(context.Background(), path)
			if invalid {
				if err == nil {
					snapshot.Close()
					t.Fatal("invalid registry must fail")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			defer snapshot.Close()
			var count int
			if err := snapshot.QueryRow("SELECT count(*) FROM tool_installations").Scan(&count); err != nil || count != 0 {
				t.Fatalf("missing registry snapshot count=%d: %v", count, err)
			}
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Fatalf("missing source was created: %v", err)
			}
		})
	}
}

func TestNewSnapshotMigratesOnlyTheCopy(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "registry.db")
	live, err := NewConnection(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := live.ExecContext(ctx, "ALTER TABLE tool_installations DROP COLUMN app_bundle_path"); err != nil {
		live.Close()
		t.Fatal(err)
	}
	if err := live.Close(); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := NewSnapshot(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	if _, err := snapshot.ExecContext(ctx, "SELECT app_bundle_path FROM tool_installations"); err != nil {
		t.Fatalf("snapshot not migrated: %v", err)
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatalf("source migrated: %v", err)
	}
}

func TestNewSnapshotErrors(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(file, []byte("file"), 0600); err != nil {
		t.Fatal(err)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	for _, tt := range []struct {
		name string
		path string
		ctx  context.Context
	}{
		{"stat failure", filepath.Join(file, "registry.db"), context.Background()},
		{"directory", root, context.Background()},
		{"canceled", filepath.Join(root, "missing.db"), canceled},
	} {
		t.Run(tt.name, func(t *testing.T) {
			conn, err := NewSnapshot(tt.ctx, tt.path)
			if conn != nil {
				conn.Close()
				t.Fatal("failed snapshot returned a database")
			}
			if err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

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
		t.Error("expected InitializeSchema to fail the tool_installations migration on a view")
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

	// 6. file_operations table creation fails
	db6, err := sql.Open("sqlite", fmt.Sprintf("file:%s_fo_fail?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db6.Close()

	_, _ = db6.ExecContext(ctx, "CREATE TABLE dummy (id INT);")
	_, _ = db6.ExecContext(ctx, "CREATE INDEX file_operations ON dummy(id);")

	if err := InitializeSchema(ctx, db6); err == nil {
		t.Error("expected InitializeSchema to fail on file_operations table creation")
	}

	// 7. tool_usage index creation fails (name occupied by a table)
	db7, err := sql.Open("sqlite", fmt.Sprintf("file:%s_tu_idx_fail?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db7.Close()

	_, _ = db7.ExecContext(ctx, "CREATE TABLE file_operations (id INTEGER PRIMARY KEY, tool_name TEXT, operation_type TEXT, file_path TEXT, target_path TEXT, file_type TEXT, metadata TEXT, size_bytes INTEGER, permissions TEXT, created_at INTEGER, operation_id TEXT);")
	_, _ = db7.ExecContext(ctx, "CREATE TABLE tool_installations (id INTEGER PRIMARY KEY, tool_name TEXT UNIQUE, version TEXT, install_path TEXT, timestamp TEXT, installed_at INTEGER, binary_paths TEXT, install_method TEXT);")
	_, _ = db7.ExecContext(ctx, "CREATE TABLE idx_tool_usage_tool_name (id INT);")

	if err := InitializeSchema(ctx, db7); err == nil {
		t.Error("expected InitializeSchema to fail on tool_usage index creation")
	}

	// 8. file_operations drift columns migration fails (table exists as a view)
	db8, err := sql.Open("sqlite", fmt.Sprintf("file:%s_fo_view?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db8.Close()

	_, _ = db8.ExecContext(ctx, "CREATE VIEW file_operations AS SELECT 1 AS id;")
	if err := InitializeSchema(ctx, db8); err == nil {
		t.Error("expected InitializeSchema to fail on file_operations drift migration")
	}
}

func TestNewConnectionErrors(t *testing.T) {
	t.Run("directory creation fails", func(t *testing.T) {
		ctx := context.Background()
		// /dev/null cannot be a directory
		_, err := NewConnection(ctx, "/dev/null/sub/dotfiles.db")
		if err == nil {
			t.Fatal("expected directory creation error, got nil")
		}
	})

	t.Run("schema initialization fails in NewConnection", func(t *testing.T) {
		ctx := context.Background()
		dbPath := filepath.Join(t.TempDir(), "failing_schema.db")
		// Pre-populate with conflicting table
		db, err := sql.Open("sqlite", dbPath)
		if err != nil {
			t.Fatalf("failed to open sqlite: %v", err)
		}
		_, err = db.ExecContext(ctx, "CREATE TABLE idx_tool_usage_tool_name (id INT);")
		if err != nil {
			t.Fatalf("failed to create dummy table: %v", err)
		}
		db.Close()

		_, err = NewConnection(ctx, dbPath)
		if err == nil {
			t.Fatal("expected NewConnection to fail when schema initialization fails, got nil")
		}
	})
}

func TestEnsureColumnsErrors(t *testing.T) {
	ctx := context.Background()

	// 1. ensureColumns on closed database
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s_closed?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	_ = db.Close()

	if err := ensureColumns(ctx, db, "file_operations", driftColumns); err == nil {
		t.Error("expected ensureColumns to fail on closed database")
	}

	// 2. ensureColumns with invalid alter statement
	db2, err := sql.Open("sqlite", fmt.Sprintf("file:%s_alter_fail?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db2.Close()

	_, _ = db2.ExecContext(ctx, "CREATE TABLE test_tab (id INT);")
	badCols := []column{{name: "bad", definition: "INVALID SYNTAX DEFINITION (("}}
	if err := ensureColumns(ctx, db2, "test_tab", badCols); err == nil {
		t.Error("expected ensureColumns to fail on invalid column definition ALTER")
	}
}

// Every connection SQLite opens to a plain ":memory:" DSN gets its own private,
// empty database. Pooled, that means the schema exists only on whichever
// connection created it, and a statement served by any other fails with "no such
// table" — which is how `generate` came to fail on a dry run depending on how the
// pool happened to hand out connections. An in-memory database has to be one
// database shared by the pool, the way a file-backed one is.
func TestInMemoryDatabaseIsSharedAcrossPooledConnections(t *testing.T) {
	ctx := context.Background()

	sqlDB, err := NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening in-memory database: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	// Two distinct pooled connections, neither holding a transaction.
	first, err := sqlDB.Conn(ctx)
	if err != nil {
		t.Fatalf("taking first connection: %v", err)
	}
	defer func() { _ = first.Close() }()
	second, err := sqlDB.Conn(ctx)
	if err != nil {
		t.Fatalf("taking second connection: %v", err)
	}
	defer func() { _ = second.Close() }()

	insert := `INSERT INTO file_operations (tool_name, operation_type, file_path, file_type, created_at, operation_id) VALUES (?, ?, ?, ?, ?, ?)`
	if _, err := first.ExecContext(ctx, insert, "tool-a", "create", "/a", "shim", 1, "op-a"); err != nil {
		t.Fatalf("insert on the first connection: %v", err)
	}
	if _, err := second.ExecContext(ctx, insert, "tool-b", "create", "/b", "shim", 1, "op-b"); err != nil {
		t.Fatalf("insert on a second pooled connection: %v", err)
	}

	// Both writes landed in the same database.
	var count int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM file_operations`).Scan(&count); err != nil {
		t.Fatalf("counting rows: %v", err)
	}
	if count != 2 {
		t.Errorf("file_operations has %d rows, want 2: the connections wrote to different databases", count)
	}
}

// Separate in-memory databases must not see each other's data, or two commands in
// one process would share a registry.
func TestInMemoryDatabasesAreIsolatedFromEachOther(t *testing.T) {
	ctx := context.Background()

	one, err := NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening first in-memory database: %v", err)
	}
	defer func() { _ = one.Close() }()
	two, err := NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening second in-memory database: %v", err)
	}
	defer func() { _ = two.Close() }()

	if _, err := one.ExecContext(ctx, `INSERT INTO file_operations (tool_name, operation_type, file_path, file_type, created_at, operation_id) VALUES (?, ?, ?, ?, ?, ?)`, "tool-a", "create", "/a", "shim", 1, "op-a"); err != nil {
		t.Fatalf("insert into the first database: %v", err)
	}

	var count int
	if err := two.QueryRowContext(ctx, `SELECT COUNT(*) FROM file_operations`).Scan(&count); err != nil {
		t.Fatalf("counting rows in the second database: %v", err)
	}
	if count != 0 {
		t.Errorf("the second in-memory database sees %d rows from the first", count)
	}
}
