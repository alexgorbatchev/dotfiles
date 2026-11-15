package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestSubcommands(t *testing.T) {
	tmpDir := createTempConfigDir(t)

	tests := []struct {
		name           string
		args           []string
		expectedOutput []string
		expectedErr    bool
	}{
		{
			name:           "generate command default",
			args:           []string{"state", "generate"},
			expectedOutput: []string{"Starting generation", "DONE"},
			expectedErr:    false,
		},
		{
			name:           "generate command dry-run",
			args:           []string{"state", "generate", "--dry-run"},
			expectedOutput: []string{"Starting generation", "DONE"},
			expectedErr:    false,
		},
		{
			name:           "install all tools",
			args:           []string{"tool", "install"},
			expectedOutput: []string{"Installing all configured tools"},
			expectedErr:    false,
		},
		{
			name:           "install single tool",
			args:           []string{"tool", "install", "bat"},
			expectedOutput: []string{"[bat] Installing..."},
			expectedErr:    false,
		},
		{
			name:           "uninstall all tools",
			args:           []string{"tool", "uninstall"},
			expectedOutput: []string{"Uninstalling all configured tools"},
			expectedErr:    false,
		},
		{
			name:           "uninstall single tool",
			args:           []string{"tool", "uninstall", "bat"},
			expectedOutput: []string{"[bat] Uninstalling..."},
			expectedErr:    false,
		},
		{
			name:           "update command",
			args:           []string{"tool", "update"},
			expectedOutput: []string{"Evaluating versions and checking for updates"},
			expectedErr:    false,
		},
		{
			name:           "env command",
			args:           []string{"shell", "init"},
			expectedOutput: []string{"export PATH="},
			expectedErr:    false,
		},
		{
			name:           "env create and delete flow",
			args:           []string{"venv", "create", "myenv"},
			expectedOutput: []string{"Virtual environment created at:"},
			expectedErr:    false,
		},
		{
			name:           "files command default",
			args:           []string{"tool", "files"},
			expectedOutput: []string{"No files currently managed"},
			expectedErr:    false,
		},
		{
			name:           "bin command target dir",
			args:           []string{"path"},
			expectedOutput: []string{filepath.Join(tmpDir, "target")},
			expectedErr:    false,
		},
		{
			name:           "bin command list flag",
			args:           []string{"tool", "list"},
			expectedOutput: []string{"bat"},
			expectedErr:    false,
		},
		{
			name:           "cleanup command",
			args:           []string{"state", "cleanup"},
			expectedOutput: []string{"Starting cleanup of orphaned tools and stale artifacts"},
			expectedErr:    false,
		},
		{
			name:           "check-updates command",
			args:           []string{"tool", "check"},
			expectedOutput: []string{"Checking for updates across configured tools"},
			expectedErr:    false,
		},
		{
			name:           "log command",
			args:           []string{"state", "log"},
			expectedOutput: []string{"No log entries found."},
			expectedErr:    false,
		},
		{
			name:           "skill command",
			args:           []string{"skill"},
			expectedOutput: []string{"---\nname:"},
			expectedErr:    false,
		},
		{
			name:           "global flags platform arch libc",
			args:           []string{"--platform=linux", "--arch=amd64", "--libc=gnu", "shell", "init"},
			expectedOutput: []string{"export PATH="},
			expectedErr:    false,
		},
		{
			name:           "global flags verbose and quiet",
			args:           []string{"-v", "shell", "init"},
			expectedOutput: []string{"export PATH="},
			expectedErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			output, err := executeCommand(tt.args...)
			if (err != nil) != tt.expectedErr {
				t.Fatalf("expected error: %v, got: %v, output: %s", tt.expectedErr, err, output)
			}

			for _, expectedStr := range tt.expectedOutput {
				if !strings.Contains(output, expectedStr) {
					t.Errorf("expected output to contain %q, but got:\n%s", expectedStr, output)
				}
			}
		})
	}
}

// TestAdditionalCmdCoverage exercises each subcommand against the verification
// fixture and asserts what it produced. It previously discarded every result
// (`_, _ = executeCommand(...)`), which meant it could only fail by hanging: it
// was driving two flags that do not exist (`files --tree` and `log --lines`) and
// silently swallowing a `generate` that failed outright.
func TestAdditionalCmdCoverage(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")
	tmpDir := createTempConfigDir(t)
	tempConfig := filepath.Join(tmpDir, "dotfiles.config.ts")

	// The cases run in order: generate has to precede the commands that read what
	// it produced.
	tests := []struct {
		name     string
		args     []string
		wantErr  string
		contains []string
	}{
		{name: "files", args: []string{"-c", absConfig, "tool", "files"}, contains: []string{"files currently managed"}},
		{name: "files json", args: []string{"-c", absConfig, "tool", "files", "--json"}, contains: []string{"["}},
		{name: "files from a second project", args: []string{"-c", tempConfig, "tool", "files"}, contains: []string{"files currently managed"}},
		{name: "generate overwrite", args: []string{"-c", absConfig, "state", "generate", "--overwrite"}},
		{name: "generate", args: []string{"-c", absConfig, "state", "generate"}},
		{name: "install one", args: []string{"-c", absConfig, "--dry-run", "tool", "install", "bat"}},
		{name: "install all", args: []string{"-c", absConfig, "--dry-run", "tool", "install"}},
		{name: "uninstall one", args: []string{"-c", absConfig, "--dry-run", "tool", "uninstall", "bat"}},
		{name: "uninstall all", args: []string{"-c", absConfig, "--dry-run", "tool", "uninstall"}},
		{name: "update uninstalled tool", args: []string{"-c", absConfig, "--dry-run", "tool", "update", "bat"}, wantErr: `tool "bat" is not installed`},
		// Every named tool that is not installed is reported, not only a lone one.
		{name: "update uninstalled tools", args: []string{"-c", absConfig, "--dry-run", "tool", "update", "bat", "fd"}, wantErr: `tool "fd" is not installed`},
		{name: "update all", args: []string{"-c", absConfig, "--dry-run", "tool", "update"}},
		{name: "log", args: []string{"-c", absConfig, "state", "log"}},
		{name: "log tail", args: []string{"-c", absConfig, "state", "log", "--tail", "10"}},
		{name: "log json", args: []string{"-c", absConfig, "state", "log", "--json"}},
		{name: "bin", args: []string{"-c", absConfig, "path"}},
		{name: "bin list", args: []string{"-c", absConfig, "tool", "list"}, contains: []string{"brew"}},
		// Nothing in the fixture is installed, so every tool is reported as not installed (#151).
		{name: "check-updates", args: []string{"-c", absConfig, "tool", "check"}, contains: []string{"github-release--bat: not installed"}},
		{name: "tool info", args: []string{"-c", absConfig, "tool", "info", "github-release--bat"}, contains: []string{"github-release"}},
		{name: "detect-conflicts", args: []string{"-c", tempConfig, "shell", "audit"}, contains: []string{"conflicts"}},
		{name: "env", args: []string{"-c", absConfig, "shell", "init"}, contains: []string{"export PATH="}},
		{name: "cleanup", args: []string{"-c", absConfig, "state", "cleanup"}},
		{name: "validate", args: []string{"-c", absConfig, "tool", "validate"}},
		{name: "skill", args: []string{"-c", absConfig, "skill"}, contains: []string{"---\nname:"}},
		{name: "dashboard help", args: []string{"dashboard", "--help"}, contains: []string{"Usage:"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand(tt.args...)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error %q, got none (output %q)", tt.wantErr, out.Combined)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want it to contain %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v\noutput: %s", err, out.Combined)
			}
			for _, want := range tt.contains {
				if !strings.Contains(out.Stdout, want) {
					t.Errorf("stdout does not contain %q:\n%s", want, out.Stdout)
				}
			}
		})
	}
}

func TestNewHierarchySubcommandsCoverage(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	tmpDir := t.TempDir()
	toolsDir := filepath.Join(tmpDir, "tools")
	configPath := writeTSProject(t, tmpDir, fmt.Sprintf(`"paths": {
		"homeDir": %q,
		"targetDir": %q,
		"generatedDir": %q,
		"binariesDir": %q,
		"dotfilesDir": %q,
		"shellScriptsDir": %q,
		"toolConfigsDir": %q,
	}`, filepath.ToSlash(tmpDir), filepath.ToSlash(filepath.Join(tmpDir, "bin")), filepath.ToSlash(filepath.Join(tmpDir, ".generated")), filepath.ToSlash(filepath.Join(tmpDir, ".generated", "binaries")), filepath.ToSlash(tmpDir), filepath.ToSlash(filepath.Join(tmpDir, ".generated", "shell-scripts")), filepath.ToSlash(toolsDir)),
		tsTools{"bat": `install("github-release", { repo: "sharkdp/bat" }).bin("bat")`})

	t.Run("venv list coverage", func(t *testing.T) {
		oldWd, _ := os.Getwd()
		_ = os.Chdir(tmpDir)
		defer func() { _ = os.Chdir(oldWd) }()

		// 1. Empty venv list
		out, err := executeCommand("venv", "list")
		if err != nil {
			t.Fatalf("venv list empty: %v", err)
		}
		if !strings.Contains(out, "No virtual environments detected") {
			t.Errorf("expected no venvs detected, got: %s", out)
		}

		// Agent mode empty
		t.Setenv("AGENT", "1")
		outAgent, _ := executeCommand("venv", "list")
		if !strings.Contains(outAgent, "no virtual environments detected") {
			t.Errorf("expected compact empty output, got: %s", outAgent)
		}
		t.Setenv("AGENT", "0")

		// 2. Create an environment
		_, err = executeCommand("venv", "create", "env1")
		if err != nil {
			t.Fatalf("venv create env1: %v", err)
		}

		// 3. List with detected environment
		out, err = executeCommand("venv", "list")
		if err != nil {
			t.Fatalf("venv list with env: %v", err)
		}
		if !strings.Contains(out, "env1") {
			t.Errorf("expected env1 in list, got: %s", out)
		}

		// Agent mode with env
		t.Setenv("AGENT", "1")
		outAgent, _ = executeCommand("venv", "list")
		if !strings.Contains(outAgent, "name:env1") {
			t.Errorf("expected compact agent output with name:env1, got: %s", outAgent)
		}
		t.Setenv("AGENT", "0")

		// JSON mode
		outJSON, err := executeCommand("venv", "list", "--json")
		if err != nil {
			t.Fatalf("venv list --json: %v", err)
		}
		if !strings.Contains(outJSON, `"name": "env1"`) {
			t.Errorf("expected JSON output with env1, got: %s", outJSON)
		}

		// Active environment outside cwd
		t.Setenv("DOTFILES_ENV_DIR", filepath.Join(tmpDir, "external-env"))
		t.Setenv("DOTFILES_ENV_NAME", "external-env")
		outActive, _ := executeCommand("venv", "list")
		if !strings.Contains(outActive, "external-env") {
			t.Errorf("expected external-env in list, got: %s", outActive)
		}
		t.Setenv("DOTFILES_ENV_DIR", "")
		t.Setenv("DOTFILES_ENV_NAME", "")

		// Delete environment
		_, _ = executeCommand("venv", "delete", "env1", "--force")
	})

	t.Run("tool scaffold with name", func(t *testing.T) {
		// Single tool creation
		out, err := executeCommand("-c", configPath, "tool", "scaffold", "customtool")
		if err != nil {
			t.Fatalf("tool scaffold customtool: %v", err)
		}
		createdPath := filepath.Join(toolsDir, "customtool.tool.ts")
		if _, err := os.Stat(createdPath); err != nil {
			t.Fatalf("expected %s to exist: %v", createdPath, err)
		}

		// Skip existing without --force
		out, _ = executeCommand("-c", configPath, "tool", "scaffold", "customtool")
		if !strings.Contains(out, "already exists, skipping") {
			t.Errorf("expected skip message, got: %s", out)
		}

		// Overwrite with --force
		out, err = executeCommand("-c", configPath, "tool", "scaffold", "--force", "customtool")
		if err != nil {
			t.Fatalf("tool scaffold --force customtool: %v", err)
		}

		// Dry run single tool
		out, err = executeCommand("-c", configPath, "--dry-run", "tool", "scaffold", "drytool")
		if err != nil {
			t.Fatalf("tool scaffold --dry-run: %v", err)
		}
		if !strings.Contains(out, "Would create") {
			t.Errorf("expected dry-run would create message, got: %s", out)
		}
	})

	t.Run("tool info details", func(t *testing.T) {
		// Human output
		out, err := executeCommand("-c", configPath, "tool", "info", "bat")
		if err != nil {
			t.Fatalf("tool info bat: %v", err)
		}
		if !strings.Contains(out, "Tool: bat") || !strings.Contains(out, "github-release") {
			t.Errorf("expected tool info output, got: %s", out)
		}

		// Agent mode
		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", configPath, "tool", "info", "bat")
		if err != nil {
			t.Fatalf("tool info bat in agent mode: %v", err)
		}
		if !strings.Contains(outAgent, "tool:bat") {
			t.Errorf("expected agent mode format, got: %s", outAgent)
		}
		t.Setenv("AGENT", "0")

		// JSON mode
		outJSON, err := executeCommand("-c", configPath, "tool", "info", "bat", "--json")
		if err != nil {
			t.Fatalf("tool info bat --json: %v", err)
		}
		if !strings.Contains(outJSON, `"name": "bat"`) {
			t.Errorf("expected JSON format, got: %s", outJSON)
		}

		// Tool not found
		_, err = executeCommand("-c", configPath, "tool", "info", "missing-tool")
		if err == nil {
			t.Fatalf("expected error for missing tool")
		}
	})

	t.Run("shell init varieties", func(t *testing.T) {
		for _, sh := range []string{"zsh", "bash", "powershell", "fish", ""} {
			args := []string{"-c", configPath, "shell", "init"}
			if sh != "" {
				args = append(args, sh)
			}
			out, err := executeCommand(args...)
			if err != nil {
				t.Fatalf("shell init %s failed: %v", sh, err)
			}
			if out == "" {
				t.Errorf("expected non-empty output for shell init %s", sh)
			}
		}
	})

	t.Run("path queries and get/list", func(t *testing.T) {
		for _, name := range []string{"target", "binaries", "cache", "dotfiles", "generated", "toolConfigs", "shellScripts", "home"} {
			out, err := executeCommand("-c", configPath, "path", "get", name)
			if err != nil {
				t.Fatalf("path get %s failed: %v", name, err)
			}
			if strings.TrimSpace(out) == "" {
				t.Errorf("expected non-empty path for %s", name)
			}
		}

		// Path list text & JSON
		outList, err := executeCommand("-c", configPath, "path", "list")
		if err != nil {
			t.Fatalf("path list failed: %v", err)
		}
		if !strings.Contains(outList, "target:") {
			t.Errorf("expected target: in path list, got: %s", outList)
		}

		// Agent mode path list
		t.Setenv("AGENT", "1")
		outListAgent, _ := executeCommand("-c", configPath, "path", "list")
		if !strings.Contains(outListAgent, "target:") {
			t.Errorf("expected target: in agent mode path list, got: %s", outListAgent)
		}
		t.Setenv("AGENT", "0")

		// Path get JSON
		outGetJSON, err := executeCommand("-c", configPath, "path", "get", "target", "--json")
		if err != nil {
			t.Fatalf("path get target --json: %v", err)
		}
		if !strings.Contains(outGetJSON, `"path":`) {
			t.Errorf("expected path key in JSON, got: %s", outGetJSON)
		}

		// Invalid path name
		_, err = executeCommand("-c", configPath, "path", "get", "nonexistent-dir")
		if err == nil {
			t.Fatalf("expected error for nonexistent path name")
		}
	})

	t.Run("skill copy command", func(t *testing.T) {
		destDir := t.TempDir()
		_, err := executeCommand("skill", "copy", destDir)
		if err != nil {
			t.Fatalf("skill copy: %v", err)
		}
		if _, err := os.Stat(filepath.Join(destDir, "dotfiles", "SKILL.md")); err != nil {
			t.Fatalf("expected copied SKILL.md to exist: %v", err)
		}
	})

	t.Run("dashboard start command with shutdown", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go func() {
			time.Sleep(100 * time.Millisecond)
			cancel()
		}()
		_, _ = executeCommandContext(ctx, "-c", configPath, "dashboard", "start", "--port", "0")
	})
}

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
	writeTSProject(t, tmpDir,
		`"paths": {`+projectPathsTS(tmpDir)+`}, "features": {"shellInstall": {"zsh": "~/.zshrc", "bash": "~/.bashrc"}}`,
		tsTools{"bat": `install("github-release", { repo: "sharkdp/bat" }).bin("bat")`})

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
				batBin := filepath.ToSlash(filepath.Join(installPath, "sub", "bat"))
				_ = reg.RecordToolInstallation(context.Background(), tx, &registry.ToolInstallationRecord{
					ToolName:      "bat",
					Version:       "v0.1.0",
					InstallMethod: &method,
					InstallPath:   installPath,
					BinaryPaths:   fmt.Sprintf("[%s]", strconv.Quote(batBin)),
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

	// 7. dashboardCmd coverage (with context cancellation shutdown)
	t.Run("dashboardCmd start and shutdown", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go func() {
			time.Sleep(100 * time.Millisecond)
			cancel()
		}()
		_, _ = executeCommandContext(ctx, "dashboard", "--port", "0")
	})
}
