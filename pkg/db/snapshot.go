package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"modernc.org/sqlite"
)

// NewSnapshot opens an isolated, writable in-memory copy of path. A missing
// registry starts empty; an unreadable registry fails instead of losing state.
// Only the copy is migrated. SQLite's backup API includes committed WAL data.
func NewSnapshot(ctx context.Context, path string) (*sql.DB, error) {
	_, err := os.Stat(path)
	missing := errors.Is(err, os.ErrNotExist)
	if err != nil && !missing {
		return nil, fmt.Errorf("inspecting registry for snapshot: %w", err)
	}

	db, err := NewConnection(ctx, ":memory:")
	if err != nil {
		return nil, err
	}
	if missing {
		return db, nil
	}
	if err := restoreSnapshot(ctx, db, path); err != nil {
		db.Close() // Failed snapshots are never returned to the caller.
		return nil, fmt.Errorf("snapshotting registry: %w", err)
	}
	if err := InitializeSchema(ctx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("initializing registry snapshot: %w", err)
	}
	return db, nil
}

func restoreSnapshot(ctx context.Context, db *sql.DB, path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	// A URI escapes filename characters such as '?' and '#' and mode=ro
	// prevents creating or migrating the source, including after a stat race.
	source := url.URL{Scheme: "file", Path: "/" + strings.TrimPrefix(filepath.ToSlash(abs), "/"), RawQuery: "mode=ro"}
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	return conn.Raw(func(raw any) error {
		// modernc's connection type is private; Raw exposes its backup API.
		restorer := raw.(interface {
			NewRestore(string) (*sqlite.Backup, error)
		})
		backup, err := restorer.NewRestore(source.String())
		if err != nil {
			return err
		}
		for {
			if err := ctx.Err(); err != nil {
				return errors.Join(err, backup.Finish())
			}
			more, err := backup.Step(128)
			if err != nil || !more {
				return errors.Join(err, backup.Finish())
			}
		}
	})
}
