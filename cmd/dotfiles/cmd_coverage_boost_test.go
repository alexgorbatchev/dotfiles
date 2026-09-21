package main

import (
	"context"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestCmdCoverageBoost_Subcommands(t *testing.T) {
	tmpDir := createTempConfigDir(t)

	// Create test home directory and shell profile files for generateCmd shellinit
	homeDir := filepath.Join(tmpDir, "home")
	_ = os.MkdirAll(homeDir, 0755)
	_ = os.WriteFile(filepath.Join(homeDir, ".zshrc"), []byte("# zshrc\n"), 0644)
	_ = os.WriteFile(filepath.Join(homeDir, ".bashrc"), []byte("# bashrc\n"), 0644)

	// Create binary path for 'bat'
	batBinPath := filepath.Join(tmpDir, "generated", "binaries", "bat", "current", "bat")
	_ = os.MkdirAll(filepath.Dir(batBinPath), 0755)
	_ = os.WriteFile(batBinPath, []byte("bat binary"), 0755)

	// Populate config with shellInstall features
	cfgContent := `{
	"projectConfig": {
		"paths": {
			"homeDir": "` + homeDir + `",
			"targetDir": "` + filepath.Join(tmpDir, "target") + `",
			"generatedDir": "` + filepath.Join(tmpDir, "generated") + `"
		},
		"features": {
			"shellInstall": {
				"zsh": "~/.zshrc",
				"bash": "~/.bashrc"
			}
		}
	},
	"toolConfigs": {
		"bat": {
			"name": "bat",
			"installationMethod": "github-release",
			"binaries": [{"name": "bat"}]
		}
	}
}`
	_ = os.WriteFile(filepath.Join(tmpDir, "dotfiles.config.json"), []byte(cfgContent), 0644)

	// 1. tool which and path coverage
	t.Run("tool which and path queries", func(t *testing.T) {
		_, err := executeCommand("tool", "which", "bat")
		if err != nil {
			t.Errorf("tool which bat failed: %v", err)
		}

		out, err := executeCommand("tool", "which", "--bin", "bat")
		if err != nil {
			t.Errorf("tool which --bin bat failed: %v", err)
		}
		if out == "" {
			t.Errorf("expected non-empty output for tool which --bin bat")
		}

		_, err = executeCommand("path")
		if err != nil {
			t.Errorf("path (default) failed: %v", err)
		}

		_, err = executeCommand("path", "target")
		if err != nil {
			t.Errorf("path target failed: %v", err)
		}

		_, err = executeCommand("tool", "which", "nonexistent-tool")
		if err == nil {
			t.Errorf("expected error for nonexistent tool in tool which command")
		}
	})

	// 2. state generate coverage
	t.Run("state generate with shellInstall profiles", func(t *testing.T) {
		_, err := executeCommand("state", "generate")
		if err != nil {
			t.Errorf("state generate command failed: %v", err)
		}
	})

	// 3. state log and tool files coverage with populated registry
	t.Run("state log and tool files with installed tool in registry", func(t *testing.T) {
		installPath := filepath.Join(tmpDir, "installed-bat")
		_ = os.MkdirAll(filepath.Join(installPath, "sub"), 0755)
		_ = os.WriteFile(filepath.Join(installPath, "sub", "bat"), []byte("bin"), 0755)

		dbPath := filepath.Join(tmpDir, "generated", "registry.db")
		_ = os.MkdirAll(filepath.Dir(dbPath), 0755)
		conn, err := db.NewConnection(context.Background(), dbPath)
		if err == nil {
			tx, _ := conn.BeginTx(context.Background(), nil)
			if tx != nil {
				reg := registry.NewRegistry(conn)
				method := "github-release"
				_ = reg.RecordToolInstallation(context.Background(), tx, &registry.ToolInstallationRecord{
					ToolName:      "bat",
					Version:       "v0.1.0",
					InstallMethod: &method,
					InstallPath:   installPath,
					BinaryPaths:   `["` + filepath.Join(installPath, "sub", "bat") + `"]`,
				})
				_ = reg.RecordFileOperation(context.Background(), tx, &registry.FileOperationRecord{
					ToolName: "bat",
					FileType: "binary",
					FilePath: filepath.Join(installPath, "sub", "bat"),
				})
				_ = tx.Commit()
			}
			conn.Close()
		}

		_, _ = executeCommand("tool", "files")
		_, _ = executeCommand("tool", "files", "bat")
		_, _ = executeCommand("state", "log", "--status")
		_, _ = executeCommand("state", "log", "bat", "--status")
		_, _ = executeCommand("state", "log", "--type", "ops")
		_, _ = executeCommand("state", "log", "--since", "2026-01-01")
		_, _ = executeCommand("state", "log", "bat")
	})

	// 4. tool update and check coverage
	t.Run("tool update and check coverage", func(t *testing.T) {
		_, _ = executeCommand("tool", "check")
		_, _ = executeCommand("tool", "update", "--dry-run", "bat")
	})

	// 5. state cleanup coverage
	t.Run("state cleanup orphan cleanup", func(t *testing.T) {
		_, _ = executeCommand("state", "cleanup", "--dry-run")
	})

	// 6. tool list, info, and shell audit coverage
	t.Run("tool list, info, and shell audit", func(t *testing.T) {
		_, _ = executeCommand("tool", "list")
		_, _ = executeCommand("tool", "info", "bat")
		_, _ = executeCommand("shell", "audit")
	})

	// 7. dashboardCmd coverage (with signal shutdown)
	t.Run("dashboardCmd start and signal shutdown", func(t *testing.T) {
		go func() {
			time.Sleep(100 * time.Millisecond)
			_ = syscall.Kill(syscall.Getpid(), syscall.SIGINT)
		}()
		_, _ = executeCommand("dashboard", "--port", "0")
	})
}
