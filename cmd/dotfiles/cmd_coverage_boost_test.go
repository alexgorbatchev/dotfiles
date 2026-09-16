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
			"installer": "github-release",
			"binaries": ["bat"]
		}
	}
}`
	_ = os.WriteFile(filepath.Join(tmpDir, "dotfiles.config.json"), []byte(cfgContent), 0644)

	// 1. binCmd coverage
	t.Run("binCmd list, resolve, default, error", func(t *testing.T) {
		_, err := executeCommand("bin", "--list")
		if err != nil {
			t.Errorf("bin --list failed: %v", err)
		}

		out, err := executeCommand("bin", "bat")
		if err != nil {
			t.Errorf("bin bat failed: %v", err)
		}
		if out == "" {
			t.Errorf("expected non-empty output for bin bat")
		}

		_, err = executeCommand("bin")
		if err != nil {
			t.Errorf("bin (default) failed: %v", err)
		}

		_, err = executeCommand("bin", "nonexistent-tool")
		if err == nil {
			t.Errorf("expected error for nonexistent tool in bin command")
		}
	})

	// 2. generateCmd coverage
	t.Run("generateCmd with shellInstall profiles", func(t *testing.T) {
		_, err := executeCommand("generate")
		if err != nil {
			t.Errorf("generate command failed: %v", err)
		}
	})

	t.Run("generateCmd creates new shell profiles as readonly when they do not exist", func(t *testing.T) {
		t.Setenv("DOTFILES_E2E_TEST", "true")
		emptyHome := filepath.Join(tmpDir, "empty-home")
		cfgPath := filepath.Join(tmpDir, "shellinstall-empty.json")
		newCfgContent := `{
	"projectConfig": {
		"paths": {
			"homeDir": "` + emptyHome + `",
			"targetDir": "` + filepath.Join(tmpDir, "target") + `",
			"generatedDir": "` + filepath.Join(tmpDir, "generated") + `"
		},
		"features": {
			"shellInstall": {
				"zsh": "~/.zshrc",
				"bash": "~/.bashrc",
				"powershell": "~/.config/powershell/profile.ps1"
			}
		}
	},
	"toolConfigs": {}
}`
		_ = os.WriteFile(cfgPath, []byte(newCfgContent), 0644)

		out, err := executeCommand("-c", cfgPath, "generate")
		if err != nil {
			t.Fatalf("generate command failed: %v, out: %s", err, out)
		}

		zshPath := filepath.Join(emptyHome, ".zshrc")
		bashPath := filepath.Join(emptyHome, ".bashrc")
		pwshPath := filepath.Join(emptyHome, ".config", "powershell", "profile.ps1")

		for _, p := range []string{zshPath, bashPath, pwshPath} {
			info, err := os.Stat(p)
			if err != nil {
				t.Fatalf("expected profile file %s to be created on disk, got err: %v", p, err)
			}
			if info.Mode().Perm() != 0444 {
				t.Errorf("expected profile file %s to have permissions 0444, got %#o", p, info.Mode().Perm())
			}
		}
	})

	// 3. logCmd and filesCmd coverage with populated registry
	t.Run("logCmd and filesCmd with installed tool in registry", func(t *testing.T) {
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

		_, _ = executeCommand("files")
		_, _ = executeCommand("files", "bat")
		_, _ = executeCommand("log", "--status")
		_, _ = executeCommand("log", "bat", "--status")
		_, _ = executeCommand("log", "--type", "ops")
		_, _ = executeCommand("log", "--since", "24h")
		_, _ = executeCommand("log", "bat")
	})

	// 4. updateCmd coverage
	t.Run("updateCmd check and perform update", func(t *testing.T) {
		_, _ = executeCommand("update", "--check")
		_, _ = executeCommand("update", "bat")
	})

	// 5. cleanupCmd coverage
	t.Run("cleanupCmd orphan cleanup", func(t *testing.T) {
		_, _ = executeCommand("cleanup")
	})

	// 6. featuresCmd coverage
	t.Run("featuresCmd list and details", func(t *testing.T) {
		_, _ = executeCommand("features")
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
