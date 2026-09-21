package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

func resetFlags(cmd *cobra.Command) {
	cmd.Flags().VisitAll(func(f *pflag.Flag) {
		_ = f.Value.Set(f.DefValue)
		f.Changed = false
	})
	for _, sub := range cmd.Commands() {
		resetFlags(sub)
	}
}

// commandOutput is what one rootCmd execution wrote. Stdout and Stderr are kept
// apart because the package convention keeps stdout clean for pipeline data and
// sends diagnostics to stderr; Combined interleaves both in write order for tests
// that only need to know a message appeared somewhere.
type commandOutput struct {
	Stdout   string
	Stderr   string
	Combined string
}

// runCommand executes rootCmd with args on a clean flag state and captures each
// stream separately.
func runCommand(args ...string) (commandOutput, error) {
	// Reset global persistent flags before each execution
	cfgFile = ""
	dryRun = false
	trace = false
	logLevel = "default"
	platform = ""
	arch = ""
	libc = ""
	verbose = false
	quiet = false

	// Reset subcommand flags
	dashboardHost = "127.0.0.1"
	dashboardPort = 8080
	logTailLines = 50
	skillDir = ""

	resetFlags(rootCmd)

	var stdout, stderr, combined bytes.Buffer
	if rootCmd.InOrStdin() == os.Stdin {
		rootCmd.SetIn(strings.NewReader(""))
		defer rootCmd.SetIn(nil)
	}
	rootCmd.SetOut(io.MultiWriter(&stdout, &combined))
	rootCmd.SetErr(io.MultiWriter(&stderr, &combined))
	rootCmd.SetArgs(args)

	err := rootCmd.Execute()
	return commandOutput{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		Combined: combined.String(),
	}, err
}

// executeCommand runs rootCmd and returns stdout and stderr interleaved. Use
// runCommand when a test must assert on one stream alone.
func executeCommand(args ...string) (string, error) {
	out, err := runCommand(args...)
	return out.Combined, err
}

// enterTempDir creates a temporary directory, makes it the working directory for
// the rest of the test, and returns it.
func enterTempDir(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed getting current dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(origDir)
	})
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("failed changing dir: %v", err)
	}
	return tmpDir
}

// projectPathsJSON renders the three required "paths" members rooted under root,
// so fixtures never point at directories outside the test's temp dir.
func projectPathsJSON(root string) string {
	return fmt.Sprintf(`"homeDir": %q, "targetDir": %q, "generatedDir": %q`,
		filepath.Join(root, "home"), filepath.Join(root, "target"), filepath.Join(root, "generated"))
}

func createTempConfigDir(t *testing.T) string {
	t.Helper()
	tmpDir := enterTempDir(t)

	configContent := `{
	"projectConfig": {
		"paths": {` + projectPathsJSON(tmpDir) + `}
	},
	"toolConfigs": {
		"bat": {
			"name": "bat",
			"installationMethod": "github-release",
			"installParams": {"repo": "sharkdp/bat"}
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed writing test config: %v", err)
	}
	return tmpDir
}

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
			args:           []string{"skill", "--dir", filepath.Join(tmpDir, "empty-skills")},
			expectedOutput: []string{"No AI skills found."},
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

func TestBootstrapAndExecutionSideEffects(t *testing.T) {
	t.Setenv("DOTFILES_DRY_RUN", "true")
	ctx := context.Background()
	// Force dryRun = true for in-memory DB and MemFS simulation, and put it back so
	// later direct BootstrapServices calls do not silently run in memory.
	previousDryRun := dryRun
	dryRun = true
	t.Cleanup(func() { dryRun = previousDryRun })
	services, err := BootstrapServices(ctx, "test-project/dotfiles.config.ts")
	if err != nil {
		t.Fatalf("bootstrap failed: %v", err)
	}
	defer services.DB.Close()

	if services.ProjectConfig.Paths.HomeDir == "" {
		t.Errorf("expected loaded config, got empty HomeDir")
	}

	if len(services.ToolConfigs) != 18 {
		t.Errorf("expected exactly 18 tool configurations to be successfully loaded natively, but got %d", len(services.ToolConfigs))
	}

	// Run install tools on orchestrator
	err = services.Orchestrator.InstallTools(ctx, services.ToolConfigs, services.ProjectConfig)
	if err != nil {
		t.Fatalf("orchestrator install failed: %v", err)
	}

	// Assert database mutations occurred!
	ops, err := services.Registry.GetFileOperations(ctx, registry.FileOperationFilter{})
	if err != nil {
		t.Fatalf("failed to query registry operations: %v", err)
	}
	if len(ops) == 0 {
		t.Errorf("expected registry database mutations (file operations recorded), got 0")
	}

	// Assert filesystem side-effects in MemFS!
	exists, err := services.FS.Exists(filepath.Join(services.ProjectConfig.Paths.TargetDir, "bat"))
	if err != nil {
		t.Fatalf("FS check failed: %v", err)
	}
	if !exists {
		t.Errorf("expected target shim 'bat' to be created in MemFS, but it is missing")
	}
}

func TestObjectBasedBinaryMatching(t *testing.T) {
	// Test tool config with object binary representation
	tool := &config.ToolConfig{
		Name: "my-tool",
		Binaries: []any{
			map[string]any{
				"name": "my-bin",
			},
		},
		Dependencies: []string{"fnm"},
	}

	// We have dependency "fnm", which should resolve to "curl-script--fnm" since curl-script--fnm provides fnm
	toolConfigs := []*config.ToolConfig{
		tool,
		{
			Name: "curl-script--fnm",
			Binaries: []any{
				map[string]any{
					"name": "fnm",
				},
			},
		},
	}

	// Map binary dependencies to fully-qualified tool names
	for _, tc := range toolConfigs {
		for idx, dep := range tc.Dependencies {
			foundProvider := false
			for _, provider := range toolConfigs {
				if provider.Name == dep || strings.HasSuffix(provider.Name, "--"+dep) {
					tc.Dependencies[idx] = provider.Name
					foundProvider = true
					break
				}
				for _, b := range provider.Binaries {
					switch val := b.(type) {
					case string:
						if val == dep {
							tc.Dependencies[idx] = provider.Name
							foundProvider = true
							break
						}
					case map[string]interface{}:
						if bName, ok := val["name"].(string); ok && bName == dep {
							tc.Dependencies[idx] = provider.Name
							foundProvider = true
							break
						}
					}
				}
				if foundProvider {
					break
				}
			}
		}
	}

	if tool.Dependencies[0] != "curl-script--fnm" {
		t.Errorf("expected dependency 'fnm' to be resolved to 'curl-script--fnm', got %q", tool.Dependencies[0])
	}
}

func TestDefaultConfigResolution(t *testing.T) {
	createTempConfigDir(t)

	ctx := context.Background()
	services, err := BootstrapServices(ctx, "")
	if err != nil {
		t.Fatalf("expected BootstrapServices with empty configPath to resolve default config, got error: %v", err)
	}
	defer services.DB.Close()

	if services.ProjectConfig == nil {
		t.Fatalf("expected non-nil ProjectConfig")
	}
}

func TestCandidateFallbackSearch(t *testing.T) {
	candidates := []string{
		"dotfiles.config.ts",
		".dotfiles.config.ts",
		"dotfiles.config.js",
		".dotfiles.config.js",
		"dotfiles.config.json",
		".dotfiles.config.json",
	}

	for _, candName := range candidates {
		t.Run("finds "+candName, func(t *testing.T) {
			tmpDir := t.TempDir()
			origDir, _ := os.Getwd()
			_ = os.Chdir(tmpDir)
			defer os.Chdir(origDir)

			filePath := filepath.Join(tmpDir, candName)
			content := `{
	"projectConfig": {"paths": {` + projectPathsJSON(tmpDir) + `}},
	"toolConfigs": {}
}`
			if strings.HasSuffix(candName, ".ts") || strings.HasSuffix(candName, ".js") {
				content = `export default { paths: { ` + projectPathsJSON(tmpDir) + ` } };`
			}
			_ = os.WriteFile(filePath, []byte(content), 0644)

			ctx := context.Background()
			services, err := BootstrapServices(ctx, "")
			if err != nil {
				t.Fatalf("failed resolving default config for %s: %v", candName, err)
			}
			services.DB.Close()
			if services.ProjectConfig == nil {
				t.Errorf("expected non-nil ProjectConfig for %s", candName)
			}
		})
	}
}

func TestEnvCreateAndDelete(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	createTempConfigDir(t)

	out1, err := executeCommand("venv", "create", "testenv")
	if err != nil || !strings.Contains(out1, "Virtual environment created at:") {
		t.Fatalf("venv create failed: %v, out: %s", err, out1)
	}

	out2, err := executeCommand("venv", "delete", "testenv", "--force")
	if err != nil || !strings.Contains(out2, "Deleted virtual environment at") {
		t.Fatalf("venv delete failed: %v, out: %s", err, out2)
	}
}

func TestRelativeConfigPathResolution(t *testing.T) {
	tmpDir := t.TempDir()
	origDir, _ := os.Getwd()
	_ = os.Chdir(tmpDir)
	defer os.Chdir(origDir)

	subDir := filepath.Join(tmpDir, "sub")
	_ = os.MkdirAll(subDir, 0755)

	cfgPath := filepath.Join(subDir, "custom.config.json")
	content := `{
	"projectConfig": {"paths": {` + projectPathsJSON(tmpDir) + `}},
	"toolConfigs": {}
}`
	_ = os.WriteFile(cfgPath, []byte(content), 0644)

	ctx := context.Background()
	// Pass relative path "sub/custom.config.json"
	services, err := BootstrapServices(ctx, "sub/custom.config.json")
	if err != nil {
		t.Fatalf("failed resolving relative path from cwd: %v", err)
	}
	services.DB.Close()
	if services.ProjectConfig == nil {
		t.Errorf("expected non-nil ProjectConfig")
	}
}

func TestDashboardCommandFlags(t *testing.T) {
	out, err := executeCommand("dashboard", "--help")
	if err != nil {
		t.Fatalf("dashboard --help failed: %v", err)
	}
	if !strings.Contains(out, "--host") || !strings.Contains(out, "-H") {
		t.Errorf("expected dashboard --help to show --host and -H flags, got:\n%s", out)
	}
}

func TestInstallCommand_ShimModeQuietOutput(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	createTempConfigDir(t)

	out, err := executeCommand("tool", "install", "--shim-mode", "bat")
	if err != nil {
		t.Fatalf("tool install bat in shim mode failed: %v", err)
	}
	if out != "" {
		t.Errorf("expected no output in shim mode, got: %q", out)
	}
}

func TestUpdateCommand_HelpAndUninstalled(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	_, err := executeCommand("-c", configPath, "tool", "update", "non-existent-tool")
	if err == nil {
		t.Errorf("expected tool update non-existent-tool to return an error")
	}

	out, err := executeCommand("tool", "update", "--help")
	if err != nil {
		t.Fatalf("tool update --help failed: %v", err)
	}
	if !strings.Contains(out, "When run without arguments, checks all installed tools") || !strings.Contains(out, "dotfiles tool update ripgrep") {
		t.Errorf("expected tool update --help to contain usage details, got:\n%s", out)
	}
	if !strings.Contains(out, "--force") || !strings.Contains(out, "-f") {
		t.Errorf("expected tool update --help to contain --force / -f flag documentation, got:\n%s", out)
	}
}

func TestUpdateCommand_ForceFlag(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	// Test update with --force for all tools in dry-run mode
	outForceAll, err := executeCommand("-c", absConfig, "--dry-run", "tool", "update", "--force")
	if err != nil {
		t.Errorf("tool update --force failed: %v, out: %s", err, outForceAll)
	}

	// Test update with -f for a non-existent tool returns error
	_, err = executeCommand("-c", absConfig, "--dry-run", "tool", "update", "-f", "non-existent-tool")
	if err == nil {
		t.Errorf("expected tool update -f non-existent-tool to return an error")
	}
}

func TestCheckUpdatesCommand_Details(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	out, err := executeCommand("-c", absConfig, "tool", "check")
	if err != nil {
		t.Fatalf("tool check failed: %v, out: %s", err, out)
	}

	if !strings.Contains(out, "Checking for updates across configured tools") {
		t.Errorf("expected tool check output to mention checking tools, got:\n%s", out)
	}
}

func TestRunMain(t *testing.T) {
	origArgs := os.Args
	defer func() { os.Args = origArgs }()
	os.Args = []string{"dotfiles", "self", "version"}
	runMain()
}

func TestVersionCommand(t *testing.T) {
	out, err := executeCommand("self", "version")
	if err != nil {
		t.Fatalf("self version command failed: %v", err)
	}
	if strings.TrimSpace(out) != Version {
		t.Errorf("expected version output to be %q, got %q", Version, out)
	}

	outFlag, err := executeCommand("--version")
	if err != nil {
		t.Fatalf("--version flag failed: %v", err)
	}
	if strings.TrimSpace(outFlag) != Version {
		t.Errorf("expected --version output to be %q, got %q", Version, outFlag)
	}
}

func TestWhyCommand(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	t.Run("found tool by binary name bat", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "bat")
		if err != nil {
			t.Fatalf("tool which bat failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/github-release--bat.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("found tool in subfolder by binary name eza", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "eza")
		if err != nil {
			t.Fatalf("tool which eza failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/subfolder/cargo--eza.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("found tool by full name github-release--bat", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "github-release--bat")
		if err != nil {
			t.Fatalf("tool which github-release--bat failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/github-release--bat.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("not found tool fz", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "fz")
		if err == nil {
			t.Errorf("expected error when tool not found, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})

	t.Run("no argument provided", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which")
		if err == nil {
			t.Errorf("expected error when no arg provided, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})

	t.Run("bootstrap error invalid config file", func(t *testing.T) {
		out, err := executeCommand("-c", "/nonexistent/config.ts", "tool", "which", "bat")
		if err == nil {
			t.Errorf("expected error on bootstrap failure, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})
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
	jsonConfig := filepath.Join(tmpDir, "dotfiles.config.json")
	tsPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	if err := os.WriteFile(tsPath, []byte("export default {};"), 0644); err != nil {
		t.Fatalf("writing minimal TypeScript config: %v", err)
	}

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
		{name: "files from json config", args: []string{"-c", jsonConfig, "tool", "files"}, contains: []string{"files currently managed"}},
		{name: "generate overwrite", args: []string{"-c", absConfig, "state", "generate", "--overwrite"}},
		{name: "generate", args: []string{"-c", absConfig, "state", "generate"}},
		{name: "install one", args: []string{"-c", absConfig, "--dry-run", "tool", "install", "bat"}},
		{name: "install all", args: []string{"-c", absConfig, "--dry-run", "tool", "install"}},
		{name: "uninstall one", args: []string{"-c", absConfig, "--dry-run", "tool", "uninstall", "bat"}},
		{name: "uninstall all", args: []string{"-c", absConfig, "--dry-run", "tool", "uninstall"}},
		{name: "update uninstalled tool", args: []string{"-c", absConfig, "--dry-run", "tool", "update", "bat"}, wantErr: `tool "bat" is not installed`},
		{name: "update all", args: []string{"-c", absConfig, "--dry-run", "tool", "update"}},
		{name: "log", args: []string{"-c", absConfig, "state", "log"}},
		{name: "log tail", args: []string{"-c", absConfig, "state", "log", "--tail", "10"}},
		{name: "log json", args: []string{"-c", absConfig, "state", "log", "--json"}},
		{name: "bin", args: []string{"-c", absConfig, "path"}},
		{name: "bin list", args: []string{"-c", absConfig, "tool", "list"}, contains: []string{"brew"}},
		{name: "check-updates", args: []string{"-c", absConfig, "tool", "check"}, contains: []string{"up to date"}},
		{name: "tool info", args: []string{"-c", absConfig, "tool", "info", "github-release--bat"}, contains: []string{"github-release"}},
		{name: "detect-conflicts", args: []string{"-c", absConfig, "shell", "audit"}, contains: []string{"conflicts"}},
		{name: "env", args: []string{"-c", absConfig, "shell", "init"}, contains: []string{"export PATH="}},
		{name: "cleanup", args: []string{"-c", absConfig, "state", "cleanup"}},
		{name: "validate", args: []string{"-c", absConfig, "tool", "validate"}},
		{name: "skill", args: []string{"-c", absConfig, "skill", "--dir", filepath.Join(repoRoot, ".agents/skills")}, contains: []string{"dotfiles"}},
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

func TestDetectConflictsCommand_ErrorReturn(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	tmpDir := t.TempDir()
	targetDir := filepath.Join(tmpDir, "target")
	_ = os.MkdirAll(targetDir, 0755)

	conflictFile := filepath.Join(targetDir, "bat")
	if err := os.WriteFile(conflictFile, []byte("#!/bin/sh\necho not-a-shim"), 0755); err != nil {
		t.Fatalf("failed creating conflict file: %v", err)
	}

	configContent := fmt.Sprintf(`{
	"projectConfig": {
		"paths": {
			"homeDir": "%s",
			"targetDir": "%s",
			"generatedDir": "%s"
		}
	},
	"toolConfigs": {
		"github-release--bat": {
			"name": "github-release--bat",
			"installationMethod": "github-release",
			"binaries": [{"name": "bat"}]
		}
	}
}`, tmpDir, targetDir, tmpDir)

	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed writing test config: %v", err)
	}

	_, err := executeCommand("-c", configPath, "shell", "audit")
	if err == nil {
		t.Fatalf("expected shell audit to return error when non-generator file exists")
	}
	if !strings.Contains(err.Error(), "conflicts detected") {
		t.Errorf("expected conflict error message, got: %v", err)
	}
}

func TestUpdateAndValidateCommand_FindTool(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	// Validate with suffix 'bat' should resolve 'github-release--bat'
	out, err := executeCommand("-c", absConfig, "tool", "validate", "bat")
	if err != nil {
		t.Fatalf("validate bat by binary/suffix failed: %v", err)
	}
	if !strings.Contains(out, "Checked 1 tool configuration") {
		t.Errorf("expected validation success for 'bat', got: %s", out)
	}
}

func TestBootstrapServices_JSONToolNameDefaulting(t *testing.T) {
	tmpDir := t.TempDir()
	configContent := `{
	"projectConfig": {
		"paths": {` + projectPathsJSON(tmpDir) + `}
	},
	"toolConfigs": {
		"implicit-name-tool": {
			"installationMethod": "github-release"
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed writing test config: %v", err)
	}

	ctx := context.Background()
	services, err := BootstrapServices(ctx, configPath)
	if err != nil {
		t.Fatalf("BootstrapServices failed: %v", err)
	}
	defer services.DB.Close()

	if len(services.ToolConfigs) != 1 {
		t.Fatalf("expected 1 tool config, got %d", len(services.ToolConfigs))
	}
	if services.ToolConfigs[0].Name != "implicit-name-tool" {
		t.Errorf("expected tool name 'implicit-name-tool', got %q", services.ToolConfigs[0].Name)
	}
}

func extractJSONPayload(output string) string {
	var jsonLines []string
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "INFO\t") || strings.HasPrefix(trimmed, "WARN\t") || strings.HasPrefix(trimmed, "ERROR\t") || strings.HasPrefix(trimmed, "DEBUG\t") {
			continue
		}
		jsonLines = append(jsonLines, line)
	}
	return strings.Join(jsonLines, "\n")
}

func TestDualModeAndJSONFlags(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	t.Run("check-updates --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "tool", "check", "--json")
		if err != nil {
			t.Fatalf("check-updates --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[\n  {") {
			t.Errorf("expected indented JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "tool", "check", "--json")
		if err != nil {
			t.Fatalf("tool check --json failed in agent mode: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "\n") {
			t.Errorf("expected minified single-line JSON in agent mode, got:\n%s", jsonAgent)
		}
		if !strings.HasPrefix(jsonAgent, "[{") {
			t.Errorf("expected valid minified JSON array, got:\n%s", jsonAgent)
		}
	})

	t.Run("check-updates text in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", absConfig, "tool", "check")
		if err != nil {
			t.Fatalf("tool check failed in agent mode: %v", err)
		}
		if !strings.Contains(out, "tool:") {
			t.Errorf("expected key-value format in agent mode, got:\n%s", out)
		}
	})

	t.Run("files --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "tool", "files", "--json")
		if err != nil {
			t.Fatalf("tool files --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[]") && !strings.Contains(jsonHuman, "[\n  ") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "tool", "files", "--json")
		if err != nil {
			t.Fatalf("tool files --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("files tree in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, _ := executeCommand("-c", absConfig, "tool", "files")
		if !strings.Contains(outHuman, "No files currently managed") && !strings.Contains(outHuman, "- ") {
			t.Errorf("expected human list in human mode, got:\n%s", outHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, _ := executeCommand("-c", absConfig, "tool", "files")
		if !strings.Contains(outAgent, "no files managed") && !strings.Contains(outAgent, "tool:") {
			t.Errorf("expected compact agent output in agent mode, got:\n%s", outAgent)
		}
	})

	t.Run("bin --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"name\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "\n") {
			t.Errorf("expected minified single-line JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("detect-conflicts --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "shell", "audit", "--json")
		if err != nil {
			t.Fatalf("shell audit --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"hasConflicts\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "shell", "audit", "--json")
		if err != nil {
			t.Fatalf("shell audit --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("detect-conflicts text in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", absConfig, "shell", "audit")
		if err != nil {
			t.Fatalf("shell audit failed: %v", err)
		}
		if !strings.Contains(out, "OK: no conflicts") {
			t.Errorf("expected 'OK: no conflicts' in agent mode, got:\n%s", out)
		}
	})

	t.Run("path --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "path", "list", "--json")
		if err != nil {
			t.Fatalf("path list --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"target\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "path", "list", "--json")
		if err != nil {
			t.Fatalf("path list --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("skill --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "skill", "--json")
		if err != nil {
			t.Fatalf("skill --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"name\":") && !strings.Contains(jsonHuman, "[]") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "skill", "--json")
		if err != nil {
			t.Fatalf("skill --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("log --json and log --status --json", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "state", "log", "--status", "--json")
		if err != nil {
			t.Fatalf("state log --status --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[]") && !strings.Contains(jsonHuman, "  ") {
			t.Errorf("expected valid JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "state", "log", "--status", "--json")
		if err != nil {
			t.Fatalf("state log --status --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})
}

func findRepoRoot() string {
	dir, _ := os.Getwd()
	for dir != "/" && dir != "." {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	return "."
}

// TestPositionalArgumentValidation covers the Args validator of every subcommand.
// Cobra validates positional arguments before RunE, so a rejected command line
// never reaches BootstrapServices and no configuration file is needed.
func TestPositionalArgumentValidation(t *testing.T) {
	const atMostOne = "accepts at most 1 arg(s), received 2"

	tests := []struct {
		name    string
		args    []string
		wantErr string
	}{
		{"tool which requires a tool", []string{"tool", "which"}, "accepts 1 arg(s), received 0"},
		{"tool which rejects a second tool", []string{"tool", "which", "bat", "fd"}, "accepts 1 arg(s), received 2"},
		{"tool info requires a tool", []string{"tool", "info"}, "accepts 1 arg(s), received 0"},
		{"tool info rejects a second tool", []string{"tool", "info", "bat", "fd"}, "accepts 1 arg(s), received 2"},
		{"state log rejects a second tool", []string{"state", "log", "bat", "fd"}, atMostOne},
		{"tool files rejects a second tool", []string{"tool", "files", "bat", "fd"}, atMostOne},
		{"tool validate rejects a second tool", []string{"tool", "validate", "bat", "fd"}, atMostOne},
		{"path rejects a second name", []string{"path", "bat", "fd"}, atMostOne},
		{"self upgrade rejects a second version", []string{"self", "upgrade", "1.0.0", "2.0.0"}, atMostOne},
		{"skill copy requires a path", []string{"skill", "copy"}, "accepts 1 arg(s), received 0"},
		{"skill copy rejects a second path", []string{"skill", "copy", "a", "b"}, "accepts 1 arg(s), received 2"},
		{"venv create rejects a second name", []string{"venv", "create", "a", "b"}, atMostOne},
		{"venv delete rejects a second name", []string{"venv", "delete", "a", "b"}, atMostOne},
		{"state generate takes no arguments", []string{"state", "generate", "bat"}, `unknown command "bat" for "dotfiles state generate"`},
		{"state cleanup takes no arguments", []string{"state", "cleanup", "bat"}, `unknown command "bat" for "dotfiles state cleanup"`},
		{"self version takes no arguments", []string{"self", "version", "bat"}, `unknown command "bat" for "dotfiles self version"`},
		{"shell audit takes no arguments", []string{"shell", "audit", "bat"}, `unknown command "bat" for "dotfiles shell audit"`},
		{"venv list takes no arguments", []string{"venv", "list", "bat"}, `unknown command "bat" for "dotfiles venv list"`},
		{"path list takes no arguments", []string{"path", "list", "bat"}, `unknown command "bat" for "dotfiles path list"`},
		{"tool list takes no arguments", []string{"tool", "list", "bat"}, `unknown command "bat" for "dotfiles tool list"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCommand(tt.args...)
			if err == nil {
				t.Fatalf("%v: expected an argument error", tt.args)
			}
			if err.Error() != tt.wantErr {
				t.Fatalf("%v: error = %q, want %q", tt.args, err.Error(), tt.wantErr)
			}
		})
	}
}

// createCompletionConfigDir writes a three-tool fixture so tests can assert on
// prefix filtering, on exclusion of already-typed tool names, and on a tool whose
// only binary shares its name (brew), which `bin` completion must not list twice.
func createCompletionConfigDir(t *testing.T) {
	t.Helper()
	tmpDir := enterTempDir(t)

	configContent := `{
	"projectConfig": {
		"paths": {
			"homeDir": "` + filepath.Join(tmpDir, "home") + `",
			"targetDir": "` + filepath.Join(tmpDir, "target") + `",
			"generatedDir": "` + filepath.Join(tmpDir, "generated") + `"
		}
	},
	"toolConfigs": {
		"brew": {
			"name": "brew",
			"installationMethod": "manual"
		},
		"github-release--bat": {
			"name": "github-release--bat",
			"installationMethod": "github-release",
			"binaries": [{"name": "bat"}]
		},
		"github-release--fd": {
			"name": "github-release--fd",
			"installationMethod": "github-release",
			"binaries": [{"name": "fd"}]
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing test config: %v", err)
	}
}

// parseCompletionOutput splits cobra's __complete stdout into candidate names
// (descriptions after the tab are dropped) and the trailing ":N" directive line.
func parseCompletionOutput(t *testing.T, stdout string) ([]string, cobra.ShellCompDirective) {
	t.Helper()
	lines := strings.Split(strings.TrimRight(stdout, "\n"), "\n")
	var directive int
	if _, err := fmt.Sscanf(lines[len(lines)-1], ":%d", &directive); err != nil {
		t.Fatalf("__complete stdout does not end with a directive line:\n%s", stdout)
	}
	candidates := []string{}
	for _, line := range lines[:len(lines)-1] {
		// Cobra prefixes ActiveHelp lines with "_activeHelp_"; only real candidates matter here.
		if strings.HasPrefix(line, "_activeHelp_") {
			continue
		}
		name, _, _ := strings.Cut(line, "\t")
		candidates = append(candidates, name)
	}
	return candidates, cobra.ShellCompDirective(directive)
}

func assertCandidates(t *testing.T, got []string, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("candidates = %v, want %v", got, want)
	}
}

func TestCompletion_ToolNamePositionalArgs(t *testing.T) {
	createCompletionConfigDir(t)

	allTools := []string{"brew", "github-release--bat", "github-release--fd"}

	tests := []struct {
		name           string
		args           []string
		wantCandidates []string
	}{
		{"install first arg", []string{"tool", "install", ""}, allTools},
		{"update first arg", []string{"tool", "update", ""}, allTools},
		{"uninstall first arg", []string{"tool", "uninstall", ""}, allTools},
		{"which first arg", []string{"tool", "which", ""}, []string{"bat", "brew", "fd", "github-release--bat", "github-release--fd"}},
		{"files first arg", []string{"tool", "files", ""}, allTools},
		{"log first arg", []string{"state", "log", ""}, allTools},
		{"validate first arg", []string{"tool", "validate", ""}, allTools},
		{"prefix filters candidates", []string{"tool", "install", "github-release--b"}, []string{"github-release--bat"}},
		{"install excludes tools already on the line", []string{"tool", "install", "github-release--bat", ""}, []string{"brew", "github-release--fd"}},
		{"install treats KEY=VALUE as not a tool", []string{"tool", "install", "FOO=1", ""}, allTools},
		{"which accepts a single tool only", []string{"tool", "which", "github-release--bat", ""}, []string{}},
		{"files accepts a single tool only", []string{"tool", "files", "github-release--bat", ""}, []string{}},
		{"log accepts a single tool only", []string{"state", "log", "github-release--bat", ""}, []string{}},
		{"validate accepts a single tool only", []string{"tool", "validate", "github-release--bat", ""}, []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand(append([]string{cobra.ShellCompRequestCmd}, tt.args...)...)
			if err != nil {
				t.Fatalf("__complete %v returned error: %v\n%s", tt.args, err, out.Combined)
			}
			got, directive := parseCompletionOutput(t, out.Stdout)
			assertCandidates(t, got, tt.wantCandidates)
			if directive&cobra.ShellCompDirectiveNoFileComp == 0 {
				t.Fatalf("directive = %d, want ShellCompDirectiveNoFileComp set so the shell never falls back to file names", directive)
			}
			// Cobra's trailing debug line belongs on stderr; stdout must carry only what the shell parses.
			if !strings.Contains(out.Stderr, "Completion ended with directive") {
				t.Fatalf("stderr = %q, want cobra's completion debug line there and not on stdout", out.Stderr)
			}
		})
	}
}

func TestCompletion_BinAcceptsBinaryOrToolName(t *testing.T) {
	createCompletionConfigDir(t)

	out, err := runCommand(cobra.ShellCompRequestCmd, "tool", "which", "")
	if err != nil {
		t.Fatalf("__complete tool which returned error: %v\n%s", err, out.Combined)
	}
	got, directive := parseCompletionOutput(t, out.Stdout)
	// brew appears once even though it is both a tool name and that tool's implicit binary.
	assertCandidates(t, got, []string{"bat", "brew", "fd", "github-release--bat", "github-release--fd"})
	if directive&cobra.ShellCompDirectiveNoFileComp == 0 {
		t.Fatalf("directive = %d, want ShellCompDirectiveNoFileComp set", directive)
	}

	out, err = runCommand(cobra.ShellCompRequestCmd, "tool", "which", "bat", "")
	if err != nil {
		t.Fatalf("__complete tool which bat returned error: %v\n%s", err, out.Combined)
	}
	got, _ = parseCompletionOutput(t, out.Stdout)
	assertCandidates(t, got, []string{})

	// path get completion offers the supported path names
	out, err = runCommand(cobra.ShellCompRequestCmd, "path", "get", "")
	if err != nil {
		t.Fatalf("__complete path get returned error: %v\n%s", err, out.Combined)
	}
	got, _ = parseCompletionOutput(t, out.Stdout)
	assertCandidates(t, got, []string{"binaries", "cache", "dotfiles", "generated", "home", "shellScripts", "target", "toolConfigs"})
}

func TestCompletion_ConfigLoadFailureReportsError(t *testing.T) {
	createCompletionConfigDir(t)
	missingConfig := filepath.Join(t.TempDir(), "missing.config.json")

	for _, sub := range [][]string{{"tool", "install"}, {"tool", "which"}} {
		t.Run(strings.Join(sub, " "), func(t *testing.T) {
			args := append([]string{"--config", missingConfig, cobra.ShellCompRequestCmd}, sub...)
			args = append(args, "")
			out, err := runCommand(args...)
			if err != nil {
				t.Fatalf("__complete must never fail the process, got error: %v\n%s", err, out.Combined)
			}
			got, directive := parseCompletionOutput(t, out.Stdout)
			assertCandidates(t, got, []string{})
			if directive&cobra.ShellCompDirectiveError == 0 {
				t.Fatalf("directive = %d, want ShellCompDirectiveError so the shell discards the result", directive)
			}
		})
	}
}

// TestCompletion_DescribesInstallationMethod checks the raw candidate line, since
// parseCompletionOutput drops descriptions: shells that render them (zsh, fish)
// show where each tool comes from.
func TestCompletion_DescribesInstallationMethod(t *testing.T) {
	createCompletionConfigDir(t)

	out, err := runCommand(cobra.ShellCompRequestCmd, "tool", "install", "")
	if err != nil {
		t.Fatalf("__complete tool install returned error: %v\n%s", err, out.Combined)
	}
	for _, want := range []string{"brew\tmanual\n", "github-release--bat\tgithub-release\n"} {
		if !strings.Contains(out.Stdout, want) {
			t.Fatalf("stdout = %q, want candidate line %q", out.Stdout, want)
		}
	}
}

// TestGenerateCommand_WritesCLICompletion covers the wiring in generate.go: after
// tool generation the CLI's own zsh completion lands where main.zsh puts fpath.
func TestGenerateCommand_WritesCLICompletion(t *testing.T) {
	p := newE2EProject(t, `"manual-tool": {"name": "manual-tool", "installationMethod": "manual"}`)

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("generate: %v\n%s", err, out.Combined)
	}

	completionPath := filepath.Join(p.GeneratedDir, "shell-scripts", "zsh", "completions", "_dotfiles")
	script, err := os.ReadFile(completionPath)
	if err != nil {
		t.Fatalf("reading %s: %v\n%s", completionPath, err, out.Combined)
	}
	if !strings.HasPrefix(string(script), "#compdef dotfiles\n") {
		t.Fatalf("%s does not start with cobra's compdef header:\n%.120s", completionPath, script)
	}

	mainZsh, err := os.ReadFile(filepath.Join(p.GeneratedDir, "shell-scripts", "main.zsh"))
	if err != nil {
		t.Fatalf("reading main.zsh: %v", err)
	}
	if !strings.Contains(string(mainZsh), filepath.Dir(completionPath)) {
		t.Fatalf("main.zsh does not put %s on fpath:\n%s", filepath.Dir(completionPath), mainZsh)
	}
}

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

func newE2EProject(t *testing.T, toolConfigs string) e2eProject {
	t.Helper()
	t.Setenv("DOTFILES_E2E_TEST", "true")
	root := t.TempDir()
	p := e2eProject{
		Root:         root,
		HomeDir:      filepath.Join(root, "home"),
		TargetDir:    filepath.Join(root, "target"),
		GeneratedDir: filepath.Join(root, "generated"),
		ConfigPath:   filepath.Join(root, "dotfiles.config.json"),
	}
	for _, dir := range []string{p.HomeDir, p.TargetDir, p.GeneratedDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
	}
	p.writeConfig(t, toolConfigs, "", "")
	return p
}

// writeConfig (re)writes the project's configuration. toolConfigs is the body of the
// "toolConfigs" object; extraPaths is appended inside "paths" and extraProject inside
// "projectConfig", both as raw JSON members (or empty).
func (p e2eProject) writeConfig(t *testing.T, toolConfigs, extraPaths, extraProject string) {
	t.Helper()
	paths := projectPathsJSON(p.Root)
	if extraPaths != "" {
		paths += ", " + extraPaths
	}
	project := fmt.Sprintf(`"paths": {%s}`, paths)
	if extraProject != "" {
		project += ", " + extraProject
	}
	content := fmt.Sprintf(`{"projectConfig": {%s}, "toolConfigs": {%s}}`, project, toolConfigs)
	if err := os.WriteFile(p.ConfigPath, []byte(content), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}
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

// mockRelease is what the release server publishes for one repository: the latest
// tag and the executables packed into its single tar.gz asset.
type mockRelease struct {
	Tag      string
	Binaries []string
}

// releaseAssetName is the one asset every mock release lists. Its name carries no
// platform, so tools select it with assetPattern.
const releaseAssetName = "tool.tar.gz"

// newReleaseServer serves GitHub-style "latest release" metadata and release
// assets for the given repositories and points the CLI at it through
// MOCK_SERVER_PORT, which BootstrapServices maps onto the GitHub host.
// Repositories not listed answer 500 so a failed update check can be exercised;
// every other path answers 404. The asset is served from the same server with the
// release's binaries inside, so the real GitHub installer can install it without
// leaving the machine. Each release lists that asset because the GitHub installer
// only caches releases that have one, and the cached branches are part of what
// is tested.
//
// The GitHub installer keeps an in-process release cache keyed by repository, so
// tests must use repository names that no other test uses.
func newReleaseServer(t *testing.T, releases map[string]mockRelease) *httptest.Server {
	t.Helper()
	assets := make(map[string][]byte, len(releases))
	for repo, rel := range releases {
		files := make(map[string]string, len(rel.Binaries))
		for _, bin := range rel.Binaries {
			files[bin] = "#!/bin/sh\necho " + bin + " " + rel.Tag + "\n"
		}
		assets[repo] = createTestTarGz(t, files)
	}

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const apiPrefix, apiSuffix = "/repos/", "/releases/latest"
		if strings.HasPrefix(r.URL.Path, apiPrefix) && strings.HasSuffix(r.URL.Path, apiSuffix) {
			repo := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, apiPrefix), apiSuffix)
			rel, ok := releases[repo]
			if !ok {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"tag_name": %q, "assets": [{"name": %q, "browser_download_url": "%s/download/%s/%s"}]}`,
				rel.Tag, releaseAssetName, server.URL, repo, releaseAssetName)
			return
		}
		const downloadPrefix, downloadSuffix = "/download/", "/" + releaseAssetName
		if strings.HasPrefix(r.URL.Path, downloadPrefix) && strings.HasSuffix(r.URL.Path, downloadSuffix) {
			repo := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, downloadPrefix), downloadSuffix)
			if asset, ok := assets[repo]; ok {
				w.Header().Set("Content-Type", "application/gzip")
				_, _ = w.Write(asset)
				return
			}
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parsing test server URL: %v", err)
	}
	t.Setenv("MOCK_SERVER_PORT", u.Port())
	return server
}

// TestUpdateCommands_UseBootstrappedInstallers guards which registry the update
// commands resolve installers from. BootstrapServices gives tests mock installers
// whose update check never leaves the process; a lookup in the global registry
// would reach the real GitHub installer and, outside MOCK_SERVER_PORT, api.github.com.
func TestUpdateCommands_UseBootstrappedInstallers(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parsing test server URL: %v", err)
	}
	t.Setenv("MOCK_SERVER_PORT", u.Port())

	p := newE2EProject(t, `"gh": {"name": "gh", "installationMethod": "github-release", "installParams": {"repo": "acme/never-fetched"}}`)
	p.seedInstallation(t, "gh", "v1.0.0", filepath.Join(p.Root, "installed", "gh"))

	for _, args := range [][]string{{"tool", "check"}, {"tool", "update", "gh"}, {"tool", "update"}} {
		out, err := p.run(args...)
		if err != nil {
			t.Fatalf("%v: %v\n%s", args, err, out.Combined)
		}
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("the release server was contacted %d time(s): the commands resolved the real GitHub installer instead of the bootstrapped mock", n)
	}
}

// mustContain fails the test unless every want string appears in got.
func mustContain(t *testing.T, label, got string, want ...string) {
	t.Helper()
	for _, w := range want {
		if !strings.Contains(got, w) {
			t.Fatalf("%s does not contain %q:\n%s", label, w, got)
		}
	}
}

// mustNotContain fails the test if any unwanted string appears in got.
func mustNotContain(t *testing.T, label, got string, unwanted ...string) {
	t.Helper()
	for _, u := range unwanted {
		if strings.Contains(got, u) {
			t.Fatalf("%s must not contain %q:\n%s", label, u, got)
		}
	}
}

func TestConfigureInstallerForUpdate(t *testing.T) {
	const destDir = "dest"

	t.Run("github installer takes host, cache dir and ttl from the project", func(t *testing.T) {
		projCfg := &config.ProjectConfig{}
		projCfg.Github.Host = "http://github.test"
		projCfg.Github.Cache.TTL = 1500
		projCfg.Paths.GeneratedDir = filepath.Join("gen")

		gh := &installer.GitHubInstaller{}
		configureInstallerForUpdate(gh, destDir, projCfg)
		if gh.BinDir != destDir {
			t.Errorf("BinDir = %q, want %q", gh.BinDir, destDir)
		}
		if gh.BaseURL != "http://github.test" {
			t.Errorf("BaseURL = %q, want the project github host", gh.BaseURL)
		}
		if want := filepath.Join("gen", "cache", "github-api"); gh.CacheDir != want {
			t.Errorf("CacheDir = %q, want %q", gh.CacheDir, want)
		}
		if gh.CacheTTL != 1500*time.Millisecond {
			t.Errorf("CacheTTL = %v, want 1.5s", gh.CacheTTL)
		}
	})

	t.Run("github installer keeps defaults when the project sets none", func(t *testing.T) {
		gh := &installer.GitHubInstaller{}
		configureInstallerForUpdate(gh, destDir, &config.ProjectConfig{})
		if gh.BaseURL != "" || gh.CacheDir != "" || gh.CacheTTL != 0 {
			t.Errorf("unexpected overrides: BaseURL=%q CacheDir=%q CacheTTL=%v", gh.BaseURL, gh.CacheDir, gh.CacheTTL)
		}
	})

	t.Run("gitea installer takes the cache dir from the project", func(t *testing.T) {
		projCfg := &config.ProjectConfig{}
		projCfg.Paths.GeneratedDir = "gen"
		gitea := &installer.GiteaInstaller{}
		configureInstallerForUpdate(gitea, destDir, projCfg)
		if gitea.BinDir != destDir {
			t.Errorf("BinDir = %q, want %q", gitea.BinDir, destDir)
		}
		if want := filepath.Join("gen", "cache", "gitea-api"); gitea.CacheDir != want {
			t.Errorf("CacheDir = %q, want %q", gitea.CacheDir, want)
		}
	})

	cargo := &installer.CargoInstaller{}
	curlBinary := &installer.CurlBinaryInstaller{}
	curlScript := &installer.CurlScriptInstaller{}
	curlTar := &installer.CurlTarInstaller{}
	dmg := &installer.DmgInstaller{}
	manual := &installer.ManualInstaller{}
	zshPlugin := &installer.ZshPluginInstaller{}
	pkg := &installer.PkgInstaller{}

	binDirOnly := []struct {
		name   string
		inst   installer.Installer
		binDir func() string
	}{
		{"cargo", cargo, func() string { return cargo.BinDir }},
		{"curl-binary", curlBinary, func() string { return curlBinary.BinDir }},
		{"curl-script", curlScript, func() string { return curlScript.BinDir }},
		{"curl-tar", curlTar, func() string { return curlTar.BinDir }},
		{"dmg", dmg, func() string { return dmg.BinDir }},
		{"manual", manual, func() string { return manual.BinDir }},
		{"zsh-plugin", zshPlugin, func() string { return zshPlugin.BinDir }},
		{"pkg", pkg, func() string { return pkg.BinDir }},
	}
	for _, tt := range binDirOnly {
		t.Run(tt.name+" installer receives the destination dir", func(t *testing.T) {
			configureInstallerForUpdate(tt.inst, destDir, &config.ProjectConfig{})
			if got := tt.binDir(); got != destDir {
				t.Errorf("BinDir = %q, want %q", got, destDir)
			}
		})
	}
}

func TestUpdateCommand_InstalledTools(t *testing.T) {
	// The update check and the reinstall must go through the real installers so the
	// version comparison, the release cache and the download are what is tested.
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoNewer, repoSame = "acme/update-newer", "acme/update-same"
	newReleaseServer(t, map[string]mockRelease{
		repoNewer: {Tag: "v9.9.9", Binaries: []string{"newer-bin", "unknown-current", "sudo-tool"}},
		repoSame:  {Tag: "v0.1.0", Binaries: []string{"same"}},
	})
	manualBin := filepath.Join(t.TempDir(), "manual-bin")
	if err := os.WriteFile(manualBin, []byte("#!/bin/sh\necho manual\n"), 0755); err != nil {
		t.Fatalf("writing manual binary: %v", err)
	}

	p := newE2EProject(t, fmt.Sprintf(`
		"newer": {"name": "newer", "installationMethod": "github-release", "installParams": {"repo": %[1]q, "assetPattern": %[3]q}, "binaries": [{"name": "newer-bin"}]},
		"unknown-current": {"name": "unknown-current", "installationMethod": "github-release", "installParams": {"repo": %[1]q, "assetPattern": %[3]q}},
		"sudo-tool": {"name": "sudo-tool", "installationMethod": "github-release", "sudo": true, "installParams": {"repo": %[1]q, "assetPattern": %[3]q}},
		"same": {"name": "same", "installationMethod": "github-release", "installParams": {"repo": %[2]q, "assetPattern": %[3]q}},
		"manual-versioned": {"name": "manual-versioned", "installationMethod": "manual", "installParams": {"binaryPath": %[4]q}},
		"manual-unversioned": {"name": "manual-unversioned", "installationMethod": "manual", "installParams": {"binaryPath": %[4]q}},
		"bogus": {"name": "bogus", "installationMethod": "bogus-installer"},
		"never-installed": {"name": "never-installed", "installationMethod": "manual"}
	`, repoNewer, repoSame, releaseAssetName, manualBin))

	installRoot := filepath.Join(p.Root, "installed")
	for name, version := range map[string]string{
		"newer":              "v0.1.0",
		"unknown-current":    "unknown",
		"sudo-tool":          "v0.1.0",
		"same":               "v0.1.0",
		"manual-versioned":   "v1.0.0",
		"manual-unversioned": "",
		"bogus":              "v1.0.0",
	} {
		dir := filepath.Join(installRoot, name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating install dir: %v", err)
		}
		p.seedInstallation(t, name, version, dir)
	}

	t.Run("installs a newer release and records its version", func(t *testing.T) {
		out, err := p.run("tool", "update", "newer")
		if err != nil {
			t.Fatalf("tool update newer: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "New version available: v0.1.0 -> v9.9.9", "Successfully updated to version v9.9.9")
		if rec := p.installation(t, "newer"); rec == nil || rec.Version != "v9.9.9" {
			t.Fatalf("installation record after update = %+v, want version v9.9.9", rec)
		}
	})

	t.Run("reports an up to date tool from the cached release", func(t *testing.T) {
		// The previous subtest fetched this repository, so the installer answers from its cache.
		out, err := p.run("tool", "update", "newer")
		if err != nil {
			t.Fatalf("tool update newer again: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Already up to date (v9.9.9, cached)")
	})

	t.Run("reports an up to date tool on a fresh fetch", func(t *testing.T) {
		out, err := p.run("tool", "update", "same")
		if err != nil {
			t.Fatalf("tool update same: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Already up to date (v0.1.0)")
		mustNotContain(t, "stderr", out.Stderr, "cached")
	})

	t.Run("treats an unparsable installed version as outdated", func(t *testing.T) {
		out, err := p.run("tool", "update", "unknown-current")
		if err != nil {
			t.Fatalf("tool update unknown-current: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "New version available: unknown -> v9.9.9")
	})

	t.Run("reports an installed tool without a version as up to date", func(t *testing.T) {
		out, err := p.run("tool", "update", "manual-unversioned")
		if err != nil {
			t.Fatalf("tool update manual-unversioned: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Already up to date")
		mustNotContain(t, "stderr", out.Stderr, "Already up to date (")
	})

	t.Run("force reinstalls the recorded version when nothing is newer", func(t *testing.T) {
		out, err := p.run("tool", "update", "--force", "manual-versioned")
		if err != nil {
			t.Fatalf("tool update --force manual-versioned: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Force updating: reinstalling version v1.0.0", "Successfully updated to version v1.0.0")
	})

	t.Run("shim mode is silent", func(t *testing.T) {
		out, err := p.run("tool", "update", "--shim-mode", "manual-versioned")
		if err != nil {
			t.Fatalf("tool update --shim-mode: %v\n%s", err, out.Combined)
		}
		if out.Combined != "" {
			t.Fatalf("expected no output in shim mode, got:\n%s", out.Combined)
		}
	})

	t.Run("a failed installation is an error", func(t *testing.T) {
		out, err := p.run("tool", "update", "sudo-tool")
		if err == nil {
			t.Fatalf("expected tool update sudo-tool to fail:\n%s", out.Combined)
		}
		mustContain(t, "error", err.Error(), `updating tool "sudo-tool" to version v9.9.9 failed`, "does not support sudo")
	})

	t.Run("an unknown installer is an error", func(t *testing.T) {
		_, err := p.run("tool", "update", "bogus")
		if err == nil || !strings.Contains(err.Error(), `getting installer for "bogus"`) {
			t.Fatalf("error = %v, want installer lookup failure", err)
		}
	})

	t.Run("a tool that is not installed is an error", func(t *testing.T) {
		_, err := p.run("tool", "update", "never-installed")
		if err == nil || !strings.Contains(err.Error(), `tool "never-installed" is not installed`) {
			t.Fatalf("error = %v, want not-installed failure", err)
		}
	})

	t.Run("updating everything skips what it cannot handle and continues past failures", func(t *testing.T) {
		out, err := p.run("tool", "update")
		if err != nil {
			t.Fatalf("tool update: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr,
			"Checking all configured tools for updates...",
			"[sudo-tool] Updating to version v9.9.9 failed",
		)
		mustNotContain(t, "stderr", out.Stderr, "[never-installed]", "[bogus]")
	})

	t.Run("force updating everything reinstalls each installed tool", func(t *testing.T) {
		out, err := p.run("tool", "update", "--force")
		if err != nil {
			t.Fatalf("tool update --force: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr,
			"[same] Force updating: reinstalling version v0.1.0",
			"[manual-versioned] Force updating: reinstalling version v1.0.0",
		)
	})
}

func TestCheckUpdatesCommand_Statuses(t *testing.T) {
	// Real installers, so the GitHub release lookup and its cache are what is tested.
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoAvail, repoUpd, repoSame, repoFail = "acme/cu-avail", "acme/cu-upd", "acme/cu-same", "acme/cu-fail"
	newReleaseServer(t, map[string]mockRelease{repoAvail: {Tag: "v9.9.9"}, repoUpd: {Tag: "v9.9.9"}, repoSame: {Tag: "v0.1.0"}})

	p := newE2EProject(t, fmt.Sprintf(`
		"avail": {"name": "avail", "installationMethod": "github-release", "installParams": {"repo": %q}},
		"upd": {"name": "upd", "installationMethod": "github-release", "installParams": {"repo": %q}},
		"same": {"name": "same", "version": "v0.1.0", "installationMethod": "github-release", "installParams": {"repo": %q}},
		"fail": {"name": "fail", "installationMethod": "github-release", "installParams": {"repo": %q}},
		"off": {"name": "off", "disabled": true, "installationMethod": "github-release", "installParams": {"repo": %q}},
		"noinst": {"name": "noinst", "installationMethod": "bogus-installer"},
		"shell-only": {"name": "shell-only"}
	`, repoAvail, repoUpd, repoSame, repoFail, repoAvail))
	p.seedInstallation(t, "upd", "v0.1.0", filepath.Join(p.Root, "installed", "upd"))

	t.Run("human output on a fresh fetch", func(t *testing.T) {
		out, err := p.run("tool", "check")
		if err != nil {
			t.Fatalf("tool check: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout,
			"avail: available (v9.9.9)\n",
			"upd: update available (v0.1.0 -> v9.9.9)\n",
			"same: up to date (v0.1.0)\n",
		)
		mustNotContain(t, "stdout", out.Stdout, "off:", "noinst:", "shell-only:", "fail:")
		mustContain(t, "stderr", out.Stderr,
			`Installer "bogus-installer" not found`,
			"[fail] Update check failed",
			"[avail] Available: v9.9.9",
			"[upd] Update available: v0.1.0 -> v9.9.9",
			"[same] Up to date (v0.1.0)",
		)
	})

	t.Run("human output from the cached releases", func(t *testing.T) {
		out, err := p.run("tool", "check")
		if err != nil {
			t.Fatalf("tool check: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "same: up to date (v0.1.0, cached)\n")
		mustContain(t, "stderr", out.Stderr, "[same] Up to date (v0.1.0, cached)")
	})

	t.Run("agent output", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("tool", "check")
		if err != nil {
			t.Fatalf("tool check: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout,
			"tool:avail current: latest:v9.9.9 update:true cached:true\n",
			"tool:upd current:v0.1.0 latest:v9.9.9 update:true cached:true\n",
			"tool:same current:v0.1.0 latest:v0.1.0 update:false cached:true\n",
		)
	})

	t.Run("json output", func(t *testing.T) {
		out, err := p.run("tool", "check", "--json")
		if err != nil {
			t.Fatalf("tool check --json: %v\n%s", err, out.Combined)
		}
		var results []ToolUpdateResult
		if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
			t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
		}
		byName := map[string]ToolUpdateResult{}
		for _, r := range results {
			byName[r.ToolName] = r
		}
		if r := byName["upd"]; !r.HasUpdate || r.CurrentVersion != "v0.1.0" || r.LatestVersion != "v9.9.9" {
			t.Errorf("upd result = %+v, want an update from v0.1.0 to v9.9.9", r)
		}
		if r := byName["same"]; r.HasUpdate || !r.Cached {
			t.Errorf("same result = %+v, want no update from cache", r)
		}
		if _, ok := byName["off"]; ok {
			t.Errorf("disabled tool must not be checked: %+v", results)
		}
	})
}

// TestCheckUpdatesCommand_UpdateCheckSettings pins what a tool's .updateCheck() block
// does to check-updates: enabled:false takes the tool out of the run, and a constraint
// decides whether the newest release upstream counts as an update at all.
func TestCheckUpdatesCommand_UpdateCheckSettings(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoOff, repoPinned, repoAdmitted = "acme/uc-off", "acme/uc-pinned", "acme/uc-admitted"
	newReleaseServer(t, map[string]mockRelease{
		repoOff:      {Tag: "v9.9.9"},
		repoPinned:   {Tag: "v2.0.0"},
		repoAdmitted: {Tag: "v1.2.9"},
	})

	p := newE2EProject(t, fmt.Sprintf(`
		"off": {"name": "off", "installationMethod": "github-release", "installParams": {"repo": %q}, "updateCheck": {"enabled": false}},
		"pinned": {"name": "pinned", "installationMethod": "github-release", "installParams": {"repo": %q}, "updateCheck": {"constraint": "~1.2.0"}},
		"admitted": {"name": "admitted", "installationMethod": "github-release", "installParams": {"repo": %q}, "updateCheck": {"constraint": "~1.2.0"}}
	`, repoOff, repoPinned, repoAdmitted))
	p.seedInstallation(t, "off", "v0.1.0", filepath.Join(p.Root, "installed", "off"))
	p.seedInstallation(t, "pinned", "v1.2.3", filepath.Join(p.Root, "installed", "pinned"))
	p.seedInstallation(t, "admitted", "v1.2.3", filepath.Join(p.Root, "installed", "admitted"))

	out, err := p.run("tool", "check", "--json")
	if err != nil {
		t.Fatalf("tool check --json: %v\n%s", err, out.Combined)
	}
	var results []ToolUpdateResult
	if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
		t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
	}
	byName := map[string]ToolUpdateResult{}
	for _, r := range results {
		byName[r.ToolName] = r
	}

	if r, ok := byName["off"]; ok {
		t.Errorf(`"off" was checked despite updateCheck.enabled:false: %+v`, r)
	}
	if r := byName["pinned"]; r.HasUpdate {
		t.Errorf("pinned result = %+v, want no update: v2.0.0 is outside ~1.2.0", r)
	}
	if r := byName["admitted"]; !r.HasUpdate || r.LatestVersion != "v1.2.9" {
		t.Errorf("admitted result = %+v, want an update to v1.2.9, which ~1.2.0 admits", r)
	}
}

func TestLogCommand_OperationsAndStatus(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat", "installationMethod": "manual"}`)

	existing := filepath.Join(p.TargetDir, "bat")
	if err := os.WriteFile(existing, []byte("bin!"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}
	missingLink := filepath.Join(p.TargetDir, "bat-link")
	missingTarget := filepath.Join(p.Root, "nowhere", "bat")
	size := int64(4)
	p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
		if err := reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      existing,
			FileType:      "binary",
			SizeBytes:     &size,
			CreatedAt:     time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC).UnixMilli(),
		}); err != nil {
			return err
		}
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "symlink",
			FilePath:      missingLink,
			TargetPath:    &missingTarget,
			FileType:      "symlink",
			CreatedAt:     time.Date(2024, 1, 3, 3, 4, 5, 0, time.UTC).UnixMilli(),
		})
	})

	t.Run("history in human mode", func(t *testing.T) {
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] write", "(binary)", "[bat] symlink", "(symlink)")
		mustContain(t, "stderr", out.Stderr, "Reading operation history and logs")
	})

	t.Run("history in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "tool:bat op:write path:", "type:binary", "tool:bat op:symlink path:")
	})

	t.Run("history as json", func(t *testing.T) {
		out, err := p.run("state", "log", "--json")
		if err != nil {
			t.Fatalf("state log --json: %v\n%s", err, out.Combined)
		}
		var ops []map[string]any
		if err := json.Unmarshal([]byte(out.Stdout), &ops); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if len(ops) != 2 {
			t.Fatalf("got %d operations, want the 2 seeded ones", len(ops))
		}
	})

	t.Run("type filter", func(t *testing.T) {
		out, err := p.run("state", "log", "--type", "symlink")
		if err != nil {
			t.Fatalf("state log --type symlink: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] symlink")
		mustNotContain(t, "stdout", out.Stdout, "[bat] write")
	})

	t.Run("since filter keeps operations after the date", func(t *testing.T) {
		out, err := p.run("state", "log", "--since", "2024-01-03")
		if err != nil {
			t.Fatalf("state log --since: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] symlink")
		mustNotContain(t, "stdout", out.Stdout, "[bat] write")
	})

	t.Run("since filter with no matches falls back to disk logs", func(t *testing.T) {
		out, err := p.run("state", "log", "--since", "2030-01-01")
		if err != nil {
			t.Fatalf("state log --since: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "No log entries found.\n" {
			t.Fatalf("stdout = %q, want the no-entries message", out.Stdout)
		}
	})

	t.Run("an unparsable since date is ignored", func(t *testing.T) {
		out, err := p.run("state", "log", "--since", "yesterday")
		if err != nil {
			t.Fatalf("state log --since yesterday: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "[bat] write", "[bat] symlink")
	})

	t.Run("status in human mode", func(t *testing.T) {
		out, err := p.run("state", "log", "--status")
		if err != nil {
			t.Fatalf("state log --status: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout,
			"File states for bat:\n",
			"[OK] "+existing+" [binary] - exists (4 bytes)\n",
			"[MISSING] "+missingLink+" [symlink] - MISSING\n",
			"[MISSING ->] "+missingTarget+"\n",
		)
	})

	t.Run("status for one tool", func(t *testing.T) {
		out, err := p.run("state", "log", "bat", "--status")
		if err != nil {
			t.Fatalf("state log bat --status: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "File states for bat:\n")

		out, err = p.run("state", "log", "ghost", "--status")
		if err != nil {
			t.Fatalf("state log ghost --status: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "" {
			t.Fatalf("stdout for a tool without states = %q, want empty", out.Stdout)
		}
	})

	t.Run("status in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("state", "log", "--status")
		if err != nil {
			t.Fatalf("state log --status: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout,
			"tool:bat path:"+existing+" type:binary exists:true size:4 target:\n",
			"tool:bat path:"+missingLink+" type:symlink exists:false size:0 target:"+missingTarget+"\n",
		)
	})

	t.Run("status as json", func(t *testing.T) {
		out, err := p.run("state", "log", "--status", "--json")
		if err != nil {
			t.Fatalf("state log --status --json: %v\n%s", err, out.Combined)
		}
		var states []FileStateInfo
		if err := json.Unmarshal([]byte(out.Stdout), &states); err != nil {
			t.Fatalf("stdout is not a JSON array of states: %v\n%s", err, out.Stdout)
		}
		var sawExisting bool
		for _, s := range states {
			if s.FilePath == existing && s.Exists && s.SizeBytes != nil && *s.SizeBytes == 4 {
				sawExisting = true
			}
		}
		if !sawExisting {
			t.Fatalf("states = %+v, want the existing binary with its size", states)
		}
	})
}

func TestLogCommand_DiskLogFallback(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat", "installationMethod": "manual"}`)

	t.Run("nothing recorded", func(t *testing.T) {
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "No log entries found.\n" {
			t.Fatalf("stdout = %q, want the no-entries message", out.Stdout)
		}
		out, err = p.run("state", "log", "--json")
		if err != nil {
			t.Fatalf("state log --json: %v\n%s", err, out.Combined)
		}
		if strings.TrimSpace(out.Stdout) != "[]" {
			t.Fatalf("stdout = %q, want an empty JSON array", out.Stdout)
		}
	})

	logPath := filepath.Join(p.GeneratedDir, "dotfiles.log")
	if err := os.WriteFile(logPath, []byte("one\ntwo\nthree\n"), 0644); err != nil {
		t.Fatalf("writing log: %v", err)
	}

	t.Run("tail of the generated log", func(t *testing.T) {
		out, err := p.run("state", "log", "--tail", "2")
		if err != nil {
			t.Fatalf("state log --tail 2: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "two\nthree\n" {
			t.Fatalf("stdout = %q, want the last two lines", out.Stdout)
		}
		mustContain(t, "stderr", out.Stderr, "Reading log file: "+logPath)

		out, err = p.run("state", "log", "--tail", "0")
		if err != nil {
			t.Fatalf("state log --tail 0: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "one\ntwo\nthree\n" {
			t.Fatalf("stdout = %q, want every line", out.Stdout)
		}
	})

	t.Run("tail as json", func(t *testing.T) {
		out, err := p.run("state", "log", "--tail", "2", "--json")
		if err != nil {
			t.Fatalf("state log --tail 2 --json: %v\n%s", err, out.Combined)
		}
		var lines []string
		if err := json.Unmarshal([]byte(out.Stdout), &lines); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if !slices.Equal(lines, []string{"two", "three"}) {
			t.Fatalf("lines = %v, want the last two", lines)
		}
	})

	t.Run("shim usage log wins over the generated log", func(t *testing.T) {
		usagePath := filepath.Join(p.GeneratedDir, "usage", "shim-usage.log")
		if err := os.MkdirAll(filepath.Dir(usagePath), 0755); err != nil {
			t.Fatalf("creating usage dir: %v", err)
		}
		if err := os.WriteFile(usagePath, []byte("bat used\n"), 0644); err != nil {
			t.Fatalf("writing usage log: %v", err)
		}
		out, err := p.run("state", "log")
		if err != nil {
			t.Fatalf("state log: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "bat used\n" {
			t.Fatalf("stdout = %q, want the shim usage log", out.Stdout)
		}
		mustContain(t, "stderr", out.Stderr, "Reading log file: "+usagePath)
	})
}

func TestScaffoldCommand(t *testing.T) {
	p := newE2EProject(t, "")
	toolsDir := filepath.Join(p.Root, "tools")
	p.writeConfig(t, "", fmt.Sprintf(`"toolConfigsDir": %q`, toolsDir), "")
	dotfilesTool := filepath.Join(toolsDir, "dotfiles.tool.ts")

	t.Run("creates the starter files", func(t *testing.T) {
		out, err := p.run("tool", "scaffold")
		if err != nil {
			t.Fatalf("tool scaffold: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Created "+dotfilesTool)
		if _, err := os.Stat(dotfilesTool); err != nil {
			t.Fatalf("expected %s to exist: %v", dotfilesTool, err)
		}
	})

	t.Run("leaves existing files alone", func(t *testing.T) {
		out, err := p.run("tool", "scaffold")
		if err != nil {
			t.Fatalf("tool scaffold: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, dotfilesTool+" already exists, skipping")
	})

	t.Run("force replaces an edited file and keeps a backup", func(t *testing.T) {
		if err := os.WriteFile(dotfilesTool, []byte("// my edits\n"), 0644); err != nil {
			t.Fatalf("editing file: %v", err)
		}
		out, err := p.run("tool", "scaffold", "--force")
		if err != nil {
			t.Fatalf("tool scaffold --force: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr,
			"Overwrote "+dotfilesTool,
			"Saved your previous dotfiles.tool.ts to "+dotfilesTool+".bak",
		)
		backup, err := os.ReadFile(dotfilesTool + ".bak")
		if err != nil {
			t.Fatalf("reading backup: %v", err)
		}
		if string(backup) != "// my edits\n" {
			t.Fatalf("backup = %q, want the edited content", backup)
		}
	})

	t.Run("dry run only reports", func(t *testing.T) {
		fresh := newE2EProject(t, "")
		freshTools := filepath.Join(fresh.Root, "tools")
		fresh.writeConfig(t, "", fmt.Sprintf(`"toolConfigsDir": %q`, freshTools), "")
		out, err := fresh.run("tool", "scaffold", "--dry-run")
		if err != nil {
			t.Fatalf("tool scaffold --dry-run: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Would create "+filepath.Join(freshTools, "dotfiles.tool.ts"))
		if _, err := os.Stat(freshTools); !os.IsNotExist(err) {
			t.Fatalf("dry run must not create %s (stat err = %v)", freshTools, err)
		}
	})
}

func TestBootstrapServices_DependencyResolution(t *testing.T) {
	writeConfig := func(t *testing.T, toolConfigs string) string {
		t.Helper()
		dir := t.TempDir()
		content := fmt.Sprintf(`{"projectConfig": {"paths": {"homeDir": %q, "targetDir": %q, "generatedDir": %q}}, "toolConfigs": {%s}}`,
			filepath.Join(dir, "home"), filepath.Join(dir, "target"), filepath.Join(dir, "generated"), toolConfigs)
		path := filepath.Join(dir, "dotfiles.config.json")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("writing config: %v", err)
		}
		return path
	}

	t.Run("a binary provided by two tools is ambiguous", func(t *testing.T) {
		path := writeConfig(t, `
			"alpha": {"name": "alpha", "binaries": [{"name": "shared"}]},
			"beta": {"name": "beta", "binaries": [{"name": "shared"}]},
			"user": {"name": "user", "dependencies": ["shared"]}
		`)
		_, err := BootstrapServices(context.Background(), path)
		if err == nil || !strings.Contains(err.Error(), `ambiguous dependency: binary "shared" is provided by multiple tools: alpha, beta`) {
			t.Fatalf("error = %v, want the ambiguity report naming both providers", err)
		}
	})

	t.Run("dependencies resolve to the providing tool", func(t *testing.T) {
		path := writeConfig(t, `
			"object-provider": {"name": "object-provider", "binaries": [{"name": "objbin"}]},
			"curl-script--fnm": {"name": "curl-script--fnm"},
			"user": {"name": "user", "dependencies": ["objbin", "fnm", "unknown-dep"]}
		`)
		services, err := BootstrapServices(context.Background(), path)
		if err != nil {
			t.Fatalf("BootstrapServices: %v", err)
		}
		defer services.DB.Close()
		user := config.FindTool(services.ToolConfigs, "user")
		if user == nil {
			t.Fatal("user tool missing")
		}
		want := []string{"object-provider", "curl-script--fnm", "unknown-dep"}
		if !slices.Equal(user.Dependencies, want) {
			t.Fatalf("dependencies = %v, want %v", user.Dependencies, want)
		}
	})
}

func TestBootstrapServices_DiscoveryAndFailures(t *testing.T) {
	t.Run("falls back to the repository root for the default config", func(t *testing.T) {
		repoRoot := t.TempDir()
		configPath := filepath.Join(repoRoot, "dotfiles.config.json")
		content := fmt.Sprintf(`{"projectConfig": {"paths": {"homeDir": %q, "generatedDir": %q}}, "toolConfigs": {}}`,
			filepath.Join(repoRoot, "home"), filepath.Join(repoRoot, "generated"))
		if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
			t.Fatalf("writing config: %v", err)
		}
		enterTempDir(t)
		t.Setenv("DOTFILES_REPO_ROOT", repoRoot)

		services, err := BootstrapServices(context.Background(), "")
		if err != nil {
			t.Fatalf("BootstrapServices: %v", err)
		}
		defer services.DB.Close()
		if services.ConfigPath != configPath {
			t.Fatalf("ConfigPath = %q, want %q", services.ConfigPath, configPath)
		}
	})

	t.Run("malformed json is reported", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "dotfiles.config.json")
		if err := os.WriteFile(path, []byte("{not json"), 0644); err != nil {
			t.Fatalf("writing config: %v", err)
		}
		_, err := BootstrapServices(context.Background(), path)
		if err == nil || !strings.Contains(err.Error(), "failed to unmarshal native JSON project config") {
			t.Fatalf("error = %v, want unmarshal failure", err)
		}
	})

	t.Run("an unusable registry location is reported", func(t *testing.T) {
		// Other tests flip the dryRun global directly; a dry run would use an
		// in-memory registry and never touch the unusable location.
		previousDryRun := dryRun
		dryRun = false
		t.Cleanup(func() { dryRun = previousDryRun })
		t.Setenv("DOTFILES_E2E_TEST", "true")
		dir := t.TempDir()
		blocker := filepath.Join(dir, "generated")
		if err := os.WriteFile(blocker, []byte("not a directory"), 0644); err != nil {
			t.Fatalf("writing blocker: %v", err)
		}
		path := filepath.Join(dir, "dotfiles.config.json")
		content := fmt.Sprintf(`{"projectConfig": {"paths": {"homeDir": %q, "generatedDir": %q}}, "toolConfigs": {}}`, dir, blocker)
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("writing config: %v", err)
		}
		_, err := BootstrapServices(context.Background(), path)
		if err == nil || !strings.Contains(err.Error(), "failed connecting to SQLite database") {
			t.Fatalf("error = %v, want database connection failure", err)
		}
	})

	t.Run("fileExists reports errors other than absence", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "file")
		if err := os.WriteFile(file, []byte("x"), 0644); err != nil {
			t.Fatalf("writing file: %v", err)
		}
		exists, err := fileExists(filepath.Join(file, "child"))
		if exists || err == nil {
			t.Fatalf("fileExists(child of a file) = (%v, %v), want (false, error)", exists, err)
		}
	})
}

func TestMockInstaller_ObjectBinaries(t *testing.T) {
	memFS := fs.NewMemFS()
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.BinariesDir = "/bins"
	stagingDir := filepath.Join(projCfg.Paths.BinariesDir, "tool", "v1")
	if err := memFS.MkdirAll(stagingDir, 0755); err != nil {
		t.Fatalf("creating staging dir: %v", err)
	}

	m := &mockInstaller{name: "manual", fsys: memFS, projCfg: projCfg}
	res, err := m.Install(context.Background(), &config.ToolConfig{
		Name:     "tool",
		Binaries: []interface{}{map[string]interface{}{"name": "objbin"}, map[string]interface{}{"pattern": "no-name"}},
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if !slices.Equal(res.Binaries, []string{"objbin"}) {
		t.Fatalf("Binaries = %v, want the named object binary only", res.Binaries)
	}
	if exists, _ := memFS.Exists(filepath.Join(stagingDir, "objbin")); !exists {
		t.Fatalf("expected the mock binary to be written into %s", stagingDir)
	}
}

func TestBinCommand_Resolution(t *testing.T) {
	p := newE2EProject(t, `
		"gh-tool": {"name": "gh-tool", "installationMethod": "manual", "binaries": [{"name": "ghb"}]},
		"plain": {"name": "plain", "installationMethod": "manual"}
	`)
	binariesDir := filepath.Join(p.GeneratedDir, "binaries")
	ghb := filepath.Join(binariesDir, "gh-tool", "current", "ghb")
	if err := os.MkdirAll(filepath.Dir(ghb), 0755); err != nil {
		t.Fatalf("creating binary dir: %v", err)
	}
	if err := os.WriteFile(ghb, []byte("bin"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}
	// The command resolves symlinks, and temp dirs may sit behind one.
	wantPath, err := filepath.EvalSymlinks(ghb)
	if err != nil {
		t.Fatalf("resolving %s: %v", ghb, err)
	}

	for _, name := range []string{"ghb", "gh-tool"} {
		t.Run("resolves "+name, func(t *testing.T) {
			out, err := p.run("tool", "which", "--bin", name)
			if err != nil {
				t.Fatalf("tool which --bin %s: %v\n%s", name, err, out.Combined)
			}
			if strings.TrimSpace(out.Stdout) != wantPath {
				t.Fatalf("stdout = %q, want %q", out.Stdout, wantPath)
			}
		})
	}

	t.Run("resolves as json", func(t *testing.T) {
		out, err := p.run("tool", "which", "--bin", "ghb", "--json")
		if err != nil {
			t.Fatalf("tool which --bin ghb --json: %v\n%s", err, out.Combined)
		}
		var got map[string]string
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got["tool"] != "gh-tool" || got["binary"] != "ghb" || got["path"] != wantPath {
			t.Fatalf("json = %v, want tool gh-tool, binary ghb, path %s", got, wantPath)
		}
	})

	t.Run("unknown name", func(t *testing.T) {
		_, err := p.run("tool", "which", "--bin", "nope")
		if err == nil || !strings.Contains(err.Error(), "not found") {
			t.Fatalf("error = %v, want not-found failure", err)
		}
	})

	t.Run("binary missing on disk", func(t *testing.T) {
		_, err := p.run("tool", "which", "--bin", "plain")
		if err == nil || !strings.Contains(err.Error(), "binary path does not exist") {
			t.Fatalf("error = %v, want missing-path failure", err)
		}
	})

	t.Run("bin dir as json", func(t *testing.T) {
		out, err := p.run("path", "target", "--json")
		if err != nil {
			t.Fatalf("path target --json: %v\n%s", err, out.Combined)
		}
		var got map[string]string
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got["path"] != p.TargetDir {
			t.Fatalf("path = %q, want the target dir %q", got["path"], p.TargetDir)
		}
	})

	t.Run("list as json", func(t *testing.T) {
		out, err := p.run("tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json: %v\n%s", err, out.Combined)
		}
		var got []ToolListItem
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		names := []string{}
		for _, item := range got {
			names = append(names, item.Name)
		}
		if !slices.Contains(names, "gh-tool") || !slices.Contains(names, "plain") {
			t.Fatalf("tools = %+v, want gh-tool and plain", names)
		}
	})
}

// TestBinCommand_PrintsTargetDir runs the target path query against the on-disk
// fixture, whose targetDir ({paths.generatedDir}/user-bin) and binariesDir
// ({paths.generatedDir}/binaries) differ, so printing the wrong one is visible.
func TestBinCommand_PrintsTargetDir(t *testing.T) {
	absConfig := filepath.Join(findRepoRoot(), "test-project", "dotfiles.config.ts")
	wantDir := filepath.Join(findRepoRoot(), "test-project", ".generated", "user-bin")

	t.Run("human", func(t *testing.T) {
		out, err := runCommand("-c", absConfig, "path", "target")
		if err != nil {
			t.Fatalf("path target: %v\n%s", err, out.Combined)
		}
		if out.Stdout != wantDir+"\n" {
			t.Fatalf("stdout = %q, want the configured target dir %q", out.Stdout, wantDir)
		}
	})

	t.Run("json", func(t *testing.T) {
		out, err := runCommand("-c", absConfig, "path", "target", "--json")
		if err != nil {
			t.Fatalf("path target --json: %v\n%s", err, out.Combined)
		}
		var got map[string]string
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got["path"] != wantDir {
			t.Fatalf("path = %q, want the configured target dir %q", got["path"], wantDir)
		}
	})
}

func TestToolListAndInfoCommand_Output(t *testing.T) {
	p := newE2EProject(t, `
		"gh": {"name": "gh", "installationMethod": "manual", "binaries": [{"name": "ghb"}, {"name": "ghc"}]},
		"sh": {"name": "sh"}
	`)

	t.Run("tool list text", func(t *testing.T) {
		out, err := p.run("tool", "list")
		if err != nil {
			t.Fatalf("tool list: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "gh", "sh")
	})

	t.Run("tool list agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("tool", "list")
		if err != nil {
			t.Fatalf("tool list: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "name:gh", "name:sh")
	})

	t.Run("tool list json", func(t *testing.T) {
		out, err := p.run("tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json: %v\n%s", err, out.Combined)
		}
		var got []ToolListItem
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if len(got) != 2 {
			t.Fatalf("expected 2 tools, got %d", len(got))
		}
	})

	t.Run("tool info", func(t *testing.T) {
		out, err := p.run("tool", "info", "gh")
		if err != nil {
			t.Fatalf("tool info gh: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "gh", "manual", "ghb", "ghc")
	})

	t.Run("tool info json", func(t *testing.T) {
		out, err := p.run("tool", "info", "gh", "--json")
		if err != nil {
			t.Fatalf("tool info gh --json: %v\n%s", err, out.Combined)
		}
		var got ToolInfoReport
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got.Name != "gh" || got.InstallationMethod != "manual" || len(got.Binaries) != 2 {
			t.Fatalf("unexpected info report: %+v", got)
		}
	})
}

func TestEnvCommand_Lifecycle(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat"}`)
	enterTempDir(t)
	// The command reports the working directory as the OS resolves it, which may
	// differ from the temp dir path when it sits behind a symlink.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getting working dir: %v", err)
	}

	out, err := p.run("venv", "create", "venv")
	if err != nil {
		t.Fatalf("venv create venv: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stdout", out.Stdout, "Virtual environment created at: "+filepath.Join(cwd, "venv"))

	_, err = p.run("venv", "create", "venv")
	if err == nil || !strings.Contains(err.Error(), "failed to create virtual environment") {
		t.Fatalf("error = %v, want creation failure for an existing environment", err)
	}

	_, err = p.run("venv", "delete", "missing")
	if err == nil || !strings.Contains(err.Error(), `virtual environment "missing" not found in `+cwd) {
		t.Fatalf("error = %v, want not-found failure", err)
	}

	// An absolute environment path is accepted as-is.
	envDir := filepath.Join(cwd, "venv")
	out, err = p.run("venv", "delete", "--force", envDir)
	if err != nil {
		t.Fatalf("venv delete %s: %v\n%s", envDir, err, out.Combined)
	}
	if out.Stdout != "Deleted virtual environment at "+envDir+"\n" {
		t.Fatalf("stdout = %q, want the deletion confirmation", out.Stdout)
	}
	if _, err := os.Stat(envDir); !os.IsNotExist(err) {
		t.Fatalf("expected %s to be removed (stat err = %v)", envDir, err)
	}
}

// TestEnvDeleteCommand_Confirmation covers the gate in front of the recursive
// removal: a [y/N] prompt on an interactive terminal, a refusal anywhere the
// prompt cannot be answered, and --force skipping both.
func TestEnvDeleteCommand_Confirmation(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat"}`)
	enterTempDir(t)
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getting working dir: %v", err)
	}
	envDir := filepath.Join(cwd, "venv")
	prompt := "Delete environment at '" + envDir + "'? [y/N] "

	createEnv := func(t *testing.T) {
		t.Helper()
		if out, err := p.run("venv", "create", "venv"); err != nil {
			t.Fatalf("venv create venv: %v\n%s", err, out.Combined)
		}
	}
	mustExist := func(t *testing.T) {
		t.Helper()
		if _, err := os.Stat(envDir); err != nil {
			t.Fatalf("expected %s to still exist (stat err = %v)", envDir, err)
		}
	}
	mustBeGone := func(t *testing.T) {
		t.Helper()
		if _, err := os.Stat(envDir); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be removed (stat err = %v)", envDir, err)
		}
	}
	// deleteWith runs venv delete with stdin replaced by answer. go test never runs
	// on a terminal, so terminal is what stdioIsTerminal reports for this run.
	deleteWith := func(t *testing.T, terminal bool, answer string, extra ...string) (commandOutput, error) {
		t.Helper()
		orig := stdioIsTerminal
		stdioIsTerminal = func(io.Reader, io.Writer) bool { return terminal }
		rootCmd.SetIn(strings.NewReader(answer))
		t.Cleanup(func() {
			stdioIsTerminal = orig
			rootCmd.SetIn(nil)
		})
		return p.run(append([]string{"venv", "delete", "venv"}, extra...)...)
	}

	t.Run("a terminal is asked and y deletes", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, true, "y\n")
		if err != nil {
			t.Fatalf("venv delete: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, prompt)
		if out.Stdout != "Deleted virtual environment at "+envDir+"\n" {
			t.Fatalf("stdout = %q, want only the deletion confirmation", out.Stdout)
		}
		mustBeGone(t)
	})

	t.Run("a terminal is asked and n cancels", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, true, "n\n")
		if err != nil {
			t.Fatalf("env delete: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, prompt, "Deletion cancelled")
		mustNotContain(t, "stderr", out.Stderr, "Deleted virtual environment")
		if out.Stdout != "" {
			t.Fatalf("stdout = %q, want nothing on cancel", out.Stdout)
		}
		mustExist(t)
	})

	t.Run("a terminal is asked and end of input cancels", func(t *testing.T) {
		out, err := deleteWith(t, true, "")
		if err != nil {
			t.Fatalf("env delete: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, prompt, "Deletion cancelled")
		mustExist(t)
	})

	t.Run("a terminal is not asked with --force", func(t *testing.T) {
		out, err := deleteWith(t, true, "n\n", "--force")
		if err != nil {
			t.Fatalf("env delete --force: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustBeGone(t)
	})

	t.Run("no terminal refuses without --force even when stdin says y", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, false, "y\n")
		if err == nil || !strings.Contains(err.Error(), "--force") {
			t.Fatalf("error = %v, want a refusal that points at --force\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustExist(t)
	})

	t.Run("agent mode refuses without --force even on a terminal", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := deleteWith(t, true, "y\n")
		if err == nil || !strings.Contains(err.Error(), "--force") {
			t.Fatalf("error = %v, want a refusal that points at --force\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustExist(t)
	})

	t.Run("no terminal deletes with --force", func(t *testing.T) {
		out, err := deleteWith(t, false, "", "--force")
		if err != nil {
			t.Fatalf("venv delete --force: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustBeGone(t)
	})

	t.Run("no terminal deletes with -f shorthand", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, false, "", "-f")
		if err != nil {
			t.Fatalf("venv delete -f: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustBeGone(t)
	})

	t.Run("the real terminal check sees no terminal under go test", func(t *testing.T) {
		if stdioIsTerminal(strings.NewReader(""), &bytes.Buffer{}) {
			t.Fatal("in-memory stdin and stderr were reported as a terminal")
		}
	})

	t.Run("a missing environment is reported before any prompt", func(t *testing.T) {
		out, err := deleteWith(t, true, "y\n")
		if err == nil || !strings.Contains(err.Error(), `virtual environment "venv" not found in `+cwd) {
			t.Fatalf("error = %v, want not-found failure", err)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
	})
}

func TestInstallCommand_ArgumentHandling(t *testing.T) {
	p := newE2EProject(t, `
		"bat": {"name": "bat", "installationMethod": "manual"},
		"broken": {"name": "broken", "binaries": [{"name": "brk"}]}
	`)

	t.Run("KEY=VALUE words are not tool names", func(t *testing.T) {
		out, err := p.run("tool", "install", "FOO=1", "bat")
		if err != nil {
			t.Fatalf("tool install FOO=1 bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Installing...")
	})

	t.Run("unknown tool", func(t *testing.T) {
		_, err := p.run("tool", "install", "nope")
		if err == nil || !strings.Contains(err.Error(), `tool "nope" not found in configuration`) {
			t.Fatalf("error = %v, want not-found failure", err)
		}
	})

	t.Run("a failed installation is logged once and the error silenced", func(t *testing.T) {
		out, err := p.run("tool", "install", "broken")
		if !errors.Is(err, ErrSilent) {
			t.Fatalf("error = %v, want ErrSilent", err)
		}
		mustContain(t, "stderr", out.Stderr, "[broken] installation method not specified")
	})

	t.Run("force reinstalls", func(t *testing.T) {
		out, err := p.run("tool", "install", "--force", "bat")
		if err != nil {
			t.Fatalf("tool install --force bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Installing...")
	})
}

func TestUninstallCommand_Errors(t *testing.T) {
	t.Run("unknown tool", func(t *testing.T) {
		p := newE2EProject(t, `"bat": {"name": "bat", "installationMethod": "manual"}`)
		_, err := p.run("tool", "uninstall", "nope")
		if err == nil || !strings.Contains(err.Error(), `tool "nope" not found in configuration`) {
			t.Fatalf("error = %v, want not-found failure", err)
		}
	})

	t.Run("a dependency cycle stops uninstalling everything", func(t *testing.T) {
		p := newE2EProject(t, `
			"a": {"name": "a", "dependencies": ["b"]},
			"b": {"name": "b", "dependencies": ["a"]}
		`)
		_, err := p.run("tool", "uninstall")
		if err == nil || !strings.Contains(err.Error(), "dependency cycle detected among tools: a, b") {
			t.Fatalf("error = %v, want cycle detection", err)
		}
	})
}

func TestCleanupCommand_RemovesOrphans(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat", "installationMethod": "manual"}`)
	p.seedInstallation(t, "ghost", "v1.0.0", filepath.Join(p.Root, "installed", "ghost"))
	p.seedInstallation(t, "bat", "v1.0.0", filepath.Join(p.Root, "installed", "bat"))

	out, err := p.run("state", "cleanup")
	if err != nil {
		t.Fatalf("state cleanup: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "[ghost] Removing orphaned tool...")
	if rec := p.installation(t, "ghost"); rec != nil {
		t.Fatalf("ghost is still recorded after cleanup: %+v", rec)
	}
	if rec := p.installation(t, "bat"); rec == nil {
		t.Fatal("bat, which is configured, must survive cleanup")
	}
}

// shellInstallFeature configures every shell's profile under the project HOME.
const shellInstallFeature = `"features": {"shellInstall": {"zsh": "~/.zshrc", "bash": "~/.bashrc", "powershell": "~/.config/powershell/profile.ps1"}}`

// shellInstallProfiles maps each configured profile (relative to HOME) to the
// generated script it must source.
var shellInstallProfiles = map[string]string{
	".zshrc":                         "main.zsh",
	".bashrc":                        "main.bash",
	".config/powershell/profile.ps1": "main.ps1",
}

func TestGenerateCommand_UpdatesExistingProfiles(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat"}`)
	p.writeConfig(t, `"bat": {"name": "bat"}`, "", shellInstallFeature)
	const userSettings = "# user settings\nexport EDITOR=vim\n"
	for rel := range shellInstallProfiles {
		profile := filepath.Join(p.HomeDir, rel)
		if err := os.MkdirAll(filepath.Dir(profile), 0755); err != nil {
			t.Fatalf("creating %s: %v", filepath.Dir(profile), err)
		}
		if err := os.WriteFile(profile, []byte(userSettings), 0644); err != nil {
			t.Fatalf("writing %s: %v", profile, err)
		}
	}

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("state generate: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "Integrating generated shell scripts with profiles")
	if strings.Contains(out.Stderr, "Profile not found") {
		t.Fatalf("existing profiles were reported as missing:\n%s", out.Stderr)
	}

	for rel, script := range shellInstallProfiles {
		profile := filepath.Join(p.HomeDir, rel)
		data, err := os.ReadFile(profile)
		if err != nil {
			t.Fatalf("reading %s: %v", profile, err)
		}
		mustContain(t, rel, string(data), userSettings, "# Generated via dotfiles generator - do not modify", script)
		info, err := os.Stat(profile)
		if err != nil {
			t.Fatalf("stat %s: %v", profile, err)
		}
		if perm := info.Mode().Perm(); perm != 0644 {
			t.Errorf("%s permissions = %#o after generate, want the original 0644", rel, perm)
		}
	}
}

func TestGenerateCommand_SkipsMissingProfiles(t *testing.T) {
	p := newE2EProject(t, `"bat": {"name": "bat"}`)
	p.writeConfig(t, `"bat": {"name": "bat"}`, "", shellInstallFeature)

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("state generate: %v\n%s", err, out.Combined)
	}

	for rel, script := range shellInstallProfiles {
		profile := filepath.Join(p.HomeDir, rel)
		if _, err := os.Stat(profile); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s must not be created by generate (stat error = %v)", profile, err)
		}
		mustContain(t, "stderr", out.Stderr, profile, "Profile not found, skipping", script)
	}
}

func TestWhyCommand_MissingConfigFile(t *testing.T) {
	p := newE2EProject(t, "")
	missing := filepath.Join(p.Root, "tools", "bat.tool.ts")
	p.writeConfig(t, fmt.Sprintf(`"bat": {"name": "bat", "configFilePath": %q}`, missing), "", "")

	_, err := p.run("tool", "which", "bat")
	if err == nil || !strings.Contains(err.Error(), `config file for "bat" does not exist: `+missing) {
		t.Fatalf("error = %v, want missing config file failure", err)
	}
}

func TestSubcommandArgConsistency(t *testing.T) {
	if stateDiffCmd.Use != "diff [tool]" {
		t.Errorf("stateDiffCmd.Use = %q, want %q", stateDiffCmd.Use, "diff [tool]")
	}
	if toolFilesCmd.Use != "files [tool]" {
		t.Errorf("toolFilesCmd.Use = %q, want %q", toolFilesCmd.Use, "files [tool]")
	}
	for _, cmd := range rootCmd.Commands() {
		if strings.Contains(cmd.Use, "toolName") {
			t.Errorf("command %q has inconsistent argument name %q (must use 'tool' instead of 'toolName')", cmd.Name(), cmd.Use)
		}
	}
}

func TestNewHierarchySubcommandsCoverage(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)

	configContent := fmt.Sprintf(`{
	"projectConfig": {
		"paths": {
			"homeDir": %q,
			"targetDir": %q,
			"generatedDir": %q,
			"binariesDir": %q,
			"dotfilesDir": %q,
			"shellScriptsDir": %q,
			"toolConfigsDir": %q
		}
	},
	"toolConfigs": {
		"bat": {
			"name": "bat",
			"installationMethod": "github-release",
			"binaries": [{"name": "bat"}]
		}
	}
}`, tmpDir, filepath.Join(tmpDir, "bin"), filepath.Join(tmpDir, ".generated"), filepath.Join(tmpDir, ".generated", "binaries"), tmpDir, filepath.Join(tmpDir, ".generated", "shell-scripts"), toolsDir)
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}

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
		go func() {
			time.Sleep(100 * time.Millisecond)
			_ = syscall.Kill(syscall.Getpid(), syscall.SIGINT)
		}()
		_, _ = executeCommand("-c", configPath, "dashboard", "start", "--port", "0")
	})
}

func TestRootShortcutsAndDomainAliases(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	_ = os.WriteFile(configPath, []byte(`{
	"projectConfig": {
		"paths": {
			"targetDir": "`+filepath.Join(tmpDir, "target")+`",
			"generatedDir": "`+filepath.Join(tmpDir, ".generated")+`"
		}
	},
	"toolConfigs": {
		"bat": {
			"name": "bat",
			"installationMethod": "github-release",
			"binaries": [{"name": "bat"}]
		}
	}
}`), 0644)

	t.Run("generate and g root shortcuts", func(t *testing.T) {
		out1, err := executeCommand("-c", configPath, "generate")
		if err != nil {
			t.Fatalf("root generate shortcut failed: %v\n%s", err, out1)
		}
		out2, err := executeCommand("-c", configPath, "g")
		if err != nil {
			t.Fatalf("root g shortcut failed: %v\n%s", err, out2)
		}
		out3, err := executeCommand("-c", configPath, "state", "g")
		if err != nil {
			t.Fatalf("state g alias failed: %v\n%s", err, out3)
		}
	})

	t.Run("install and i root shortcuts", func(t *testing.T) {
		out1, err := executeCommand("-c", configPath, "--dry-run", "install", "bat")
		if err != nil {
			t.Fatalf("root install shortcut failed: %v\n%s", err, out1)
		}
		out2, err := executeCommand("-c", configPath, "--dry-run", "i", "bat")
		if err != nil {
			t.Fatalf("root i shortcut failed: %v\n%s", err, out2)
		}
		out3, err := executeCommand("-c", configPath, "--dry-run", "tool", "i", "bat")
		if err != nil {
			t.Fatalf("tool i alias failed: %v\n%s", err, out3)
		}
	})

	t.Run("update and u root shortcuts", func(t *testing.T) {
		out1, err := executeCommand("-c", configPath, "--dry-run", "update")
		if err != nil {
			t.Fatalf("root update shortcut failed: %v\n%s", err, out1)
		}
		out2, err := executeCommand("-c", configPath, "--dry-run", "u")
		if err != nil {
			t.Fatalf("root u shortcut failed: %v\n%s", err, out2)
		}
		out3, err := executeCommand("-c", configPath, "--dry-run", "tool", "u")
		if err != nil {
			t.Fatalf("tool u alias failed: %v\n%s", err, out3)
		}
	})

	t.Run("root shortcuts remain hidden from help", func(t *testing.T) {
		for _, name := range []string{"generate", "g", "install", "i", "update", "u"} {
			cmd, _, err := rootCmd.Find([]string{name})
			if err != nil {
				t.Fatalf("finding command %s: %v", name, err)
			}
			if !cmd.Hidden {
				t.Errorf("command %s should be Hidden", name)
			}
		}
	})
}
