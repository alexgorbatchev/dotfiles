package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// e2eProject is a self-contained project inside a temp dir for tests that need the
// commands to read and write real state. With DOTFILES_E2E_TEST set, BootstrapServices
// uses the real filesystem and an on-disk registry under GeneratedDir instead of the
// in-memory pair it otherwise gives tests, so what one command (or seedRegistry)
// writes is what the next command execution sees. Installers stay mocked.
type e2eProject struct {
	Root         string
	HomeDir      string
	TargetDir    string
	GeneratedDir string
	ConfigPath   string
}

func newE2EProject(t *testing.T, tools tsTools) e2eProject {
	t.Helper()
	t.Setenv("DOTFILES_E2E_TEST", "true")
	root := t.TempDir()
	p := e2eProject{
		Root:         root,
		HomeDir:      filepath.Join(root, "home"),
		TargetDir:    filepath.Join(root, "target"),
		GeneratedDir: filepath.Join(root, "generated"),
	}
	for _, dir := range []string{p.HomeDir, p.TargetDir, p.GeneratedDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
	}
	p.ConfigPath = p.writeConfig(t, tools, "", "")
	return p
}

// writeConfig (re)writes the project's dotfiles.config.ts and tool files and returns
// the configuration's path. extraPaths is appended inside "paths" and extraProject
// after it, both as members of a TypeScript object literal (or empty).
func (p e2eProject) writeConfig(t *testing.T, tools tsTools, extraPaths, extraProject string) string {
	t.Helper()
	paths := projectPathsTS(p.Root)
	if extraPaths != "" {
		paths += ", " + extraPaths
	}
	project := fmt.Sprintf(`"paths": {%s}`, paths)
	if extraProject != "" {
		project += ", " + extraProject
	}
	return writeTSProject(t, p.Root, project, tools)
}

// run executes a command line against the project's configuration.
func (p e2eProject) run(args ...string) (commandOutput, error) {
	return runCommand(append([]string{"-c", p.ConfigPath}, args...)...)
}

// seedRegistry opens the project's on-disk registry and runs fn in one transaction.
func (p e2eProject) seedRegistry(t *testing.T, fn func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error) {
	t.Helper()
	ctx := context.Background()
	conn, err := db.NewConnection(ctx, filepath.Join(p.GeneratedDir, "registry.db"))
	if err != nil {
		t.Fatalf("opening registry: %v", err)
	}
	defer conn.Close()
	reg := registry.NewRegistry(conn)
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error { return fn(ctx, reg, tx) }); err != nil {
		t.Fatalf("seeding registry: %v", err)
	}
}

// installation returns the project's installation record for toolName, or nil.
func (p e2eProject) installation(t *testing.T, toolName string) *registry.ToolInstallationRecord {
	t.Helper()
	ctx := context.Background()
	conn, err := db.NewConnection(ctx, filepath.Join(p.GeneratedDir, "registry.db"))
	if err != nil {
		t.Fatalf("opening registry: %v", err)
	}
	defer conn.Close()
	rec, err := registry.NewRegistry(conn).GetToolInstallation(ctx, toolName)
	if err != nil {
		t.Fatalf("reading installation of %s: %v", toolName, err)
	}
	return rec
}

// seedInstallation records toolName as installed at version with installPath.
func (p e2eProject) seedInstallation(t *testing.T, toolName, version, installPath string) {
	t.Helper()
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		method := "manual"
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:      toolName,
			Version:       version,
			InstallPath:   installPath,
			InstallMethod: &method,
			BinaryPaths:   "[]",
		})
	})
}

// unreadableInstallationCause is part of the error reading the record
// seedUnreadableInstallation leaves.
const unreadableInstallationCause = `name "version": converting NULL to string is unsupported`

// seedUnreadableInstallation leaves an installation record for toolName that the
// registry cannot read. A record whose version is NULL cannot be scanned, so the schema
// is recreated without the NOT NULL constraint that keeps such a record out.
func (p e2eProject) seedUnreadableInstallation(t *testing.T, toolName string) {
	t.Helper()
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		for _, stmt := range []string{
			"DROP TABLE tool_installations",
			"CREATE TABLE tool_installations (id INTEGER PRIMARY KEY AUTOINCREMENT, tool_name TEXT NOT NULL UNIQUE, version TEXT, install_path TEXT NOT NULL, timestamp TEXT NOT NULL, installed_at INTEGER NOT NULL, binary_paths TEXT NOT NULL, download_url TEXT, asset_name TEXT, configured_version TEXT, original_tag TEXT, install_method TEXT)",
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return fmt.Errorf("%s: %w", stmt, err)
			}
		}
		const insert = "INSERT INTO tool_installations (tool_name, version, install_path, timestamp, installed_at, binary_paths) VALUES (?, NULL, '/x', 't', 0, '[]')"
		if _, err := tx.ExecContext(ctx, insert, toolName); err != nil {
			return fmt.Errorf("%s: %w", insert, err)
		}
		return nil
	})
}
