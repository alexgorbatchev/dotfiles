package db

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
)

// legacyFileOperationsSchema is file_operations as it was before drift tracking, the
// shape a database created by an earlier release of dotfiles still has on disk.
const legacyFileOperationsSchema = `
	CREATE TABLE file_operations (
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

// columnNames reports the columns a table currently has.
func columnNames(ctx context.Context, t *testing.T, db *sql.DB, table string) map[string]bool {
	t.Helper()
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		t.Fatalf("querying table_info(%s): %v", table, err)
	}
	defer rows.Close()

	names := map[string]bool{}
	for rows.Next() {
		var cid, notnull, pk int
		var name, ctype string
		var dflt any
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			t.Fatalf("scanning table_info row: %v", err)
		}
		names[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating table_info rows: %v", err)
	}
	return names
}

// TestInitializeSchemaCreatesDriftColumns pins the columns the drift engine reads.
// Without them a run cannot tell an upstream change from a local edit, so their
// absence is a silent loss of the distinction rather than a visible error.
func TestInitializeSchemaCreatesDriftColumns(t *testing.T) {
	ctx := context.Background()
	db, err := NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	defer db.Close()

	got := columnNames(ctx, t, db, "file_operations")
	for _, want := range []string{"content_hash", "block_id", "target_mode"} {
		if !got[want] {
			t.Errorf("file_operations is missing column %q", want)
		}
	}
}

// TestInitializeSchemaMigratesLegacyTables covers the upgrade path: a database
// written by an earlier release has the old table, and opening it has to add the new
// columns rather than fail or silently leave them out.
func TestInitializeSchemaMigratesLegacyTables(t *testing.T) {
	tests := []struct {
		name    string
		legacy  string
		table   string
		columns []string
	}{
		{
			name:    "file_operations gains the drift columns",
			legacy:  legacyFileOperationsSchema,
			table:   "file_operations",
			columns: []string{"content_hash", "block_id", "target_mode"},
		},
		{
			name: "tool_installations gains install_method",
			legacy: `
			CREATE TABLE tool_installations (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				tool_name TEXT NOT NULL UNIQUE,
				version TEXT NOT NULL,
				install_path TEXT NOT NULL,
				timestamp TEXT NOT NULL,
				installed_at INTEGER NOT NULL,
				binary_paths TEXT NOT NULL
			);`,
			table:   "tool_installations",
			columns: []string{"install_method"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
			if err != nil {
				t.Fatalf("opening database: %v", err)
			}
			defer db.Close()

			if _, err := db.ExecContext(ctx, tt.legacy); err != nil {
				t.Fatalf("creating legacy table: %v", err)
			}
			for _, column := range tt.columns {
				if columnNames(ctx, t, db, tt.table)[column] {
					t.Fatalf("legacy table already has %q, so the test proves nothing", column)
				}
			}

			if err := InitializeSchema(ctx, db); err != nil {
				t.Fatalf("initializing schema over the legacy table: %v", err)
			}

			got := columnNames(ctx, t, db, tt.table)
			for _, column := range tt.columns {
				if !got[column] {
					t.Errorf("%s is still missing column %q after migration", tt.table, column)
				}
			}

			// Opening an already-migrated database must not try to add them twice.
			if err := InitializeSchema(ctx, db); err != nil {
				t.Fatalf("re-initializing schema: %v", err)
			}
		})
	}
}

// TestEnsureColumnsReportsFailures checks that a migration that cannot run is
// reported rather than swallowed, leaving the caller to write into columns that do
// not exist.
func TestEnsureColumnsReportsFailures(t *testing.T) {
	ctx := context.Background()

	t.Run("closed database", func(t *testing.T) {
		db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
		if err != nil {
			t.Fatalf("opening database: %v", err)
		}
		db.Close()

		if err := ensureColumns(ctx, db, "file_operations", driftColumns); err == nil {
			t.Error("expected ensureColumns to fail against a closed database")
		}
	})

	t.Run("table that cannot be altered", func(t *testing.T) {
		db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
		if err != nil {
			t.Fatalf("opening database: %v", err)
		}
		defer db.Close()

		if _, err := db.ExecContext(ctx, "CREATE TABLE base (id INT); CREATE VIEW file_operations AS SELECT id FROM base;"); err != nil {
			t.Fatalf("creating view: %v", err)
		}

		if err := ensureColumns(ctx, db, "file_operations", driftColumns); err == nil {
			t.Error("expected ensureColumns to fail when ALTER TABLE cannot run")
		}
	})
}
