package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
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
	host = "127.0.0.1"
	port = 8080
	inputFile = "dotfiles.config.ts"
	outputFile = "dotfiles.config.json"
	listBins = false
	generateReadme = false
	logTailLines = 50
	skillDir = ""

	resetFlags(rootCmd)

	var stdout, stderr, combined bytes.Buffer
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
			args:           []string{"generate"},
			expectedOutput: []string{"Starting generation", "DONE"},
			expectedErr:    false,
		},
		{
			name:           "generate command dry-run",
			args:           []string{"generate", "--dry-run"},
			expectedOutput: []string{"Starting generation", "DONE"},
			expectedErr:    false,
		},
		{
			name:           "install all tools",
			args:           []string{"install"},
			expectedOutput: []string{"Installing all configured tools"},
			expectedErr:    false,
		},
		{
			name:           "install single tool",
			args:           []string{"install", "bat"},
			expectedOutput: []string{"[bat] Installing..."},
			expectedErr:    false,
		},
		{
			name:           "uninstall all tools",
			args:           []string{"uninstall"},
			expectedOutput: []string{"Uninstalling all configured tools"},
			expectedErr:    false,
		},
		{
			name:           "uninstall single tool",
			args:           []string{"uninstall", "bat"},
			expectedOutput: []string{"[bat] Uninstalling..."},
			expectedErr:    false,
		},
		{
			name:           "update command",
			args:           []string{"update"},
			expectedOutput: []string{"Evaluating versions and checking for updates"},
			expectedErr:    false,
		},
		{
			name:           "env command",
			args:           []string{"env"},
			expectedOutput: []string{"export PATH="},
			expectedErr:    false,
		},
		{
			name:           "env create and delete flow",
			args:           []string{"env", "create", "myenv"},
			expectedOutput: []string{"Virtual environment created at:"},
			expectedErr:    false,
		},
		{
			name:           "files command default",
			args:           []string{"files"},
			expectedOutput: []string{"No files currently managed"},
			expectedErr:    false,
		},
		{
			name:           "config convert default",
			args:           []string{"config", "convert"},
			expectedOutput: []string{"Converting configuration", "dotfiles.config.ts", "dotfiles.config.json", "Configuration migration completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "config convert custom values",
			args:           []string{"config", "convert", "-i", "my.config.ts", "-o", "my.config.json"},
			expectedOutput: []string{"Converting configuration", "my.config.ts", "my.config.json", "Configuration migration completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "bin command target dir",
			args:           []string{"bin"},
			expectedOutput: []string{filepath.Join(tmpDir, "generated")},
			expectedErr:    false,
		},
		{
			name:           "bin command list flag",
			args:           []string{"bin", "--list"},
			expectedOutput: []string{"bat (bat)"},
			expectedErr:    false,
		},
		{
			name:           "features command default",
			args:           []string{"features"},
			expectedOutput: []string{"Catalog Generate:", "ShellInstall:"},
			expectedErr:    false,
		},
		{
			name:           "features command generate-readme",
			args:           []string{"features", "--generate-readme"},
			expectedOutput: []string{"# Configured Tools & Features", "| Tool | Method | Binaries | Description |", "bat"},
			expectedErr:    false,
		},
		{
			name:           "cleanup command",
			args:           []string{"cleanup"},
			expectedOutput: []string{"Starting cleanup of orphaned tools and stale artifacts"},
			expectedErr:    false,
		},
		{
			name:           "check-updates command",
			args:           []string{"check-updates"},
			expectedOutput: []string{"Checking for updates across configured tools"},
			expectedErr:    false,
		},
		{
			name:           "log command",
			args:           []string{"log"},
			expectedOutput: []string{"No log entries found."},
			expectedErr:    false,
		},
		{
			name:           "skill command",
			args:           []string{"skill"},
			expectedOutput: []string{"No AI skills found."},
			expectedErr:    false,
		},
		{
			name:           "global flags platform arch libc",
			args:           []string{"--platform=linux", "--arch=amd64", "--libc=glibc", "env"},
			expectedOutput: []string{"export PATH="},
			expectedErr:    false,
		},
		{
			name:           "global flags verbose and quiet",
			args:           []string{"-v", "env"},
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

	if len(services.ToolConfigs) != 17 {
		t.Errorf("expected exactly 17 tool configurations to be successfully loaded natively, but got %d", len(services.ToolConfigs))
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

	out1, err := executeCommand("env", "create", "testenv")
	if err != nil || !strings.Contains(out1, "Virtual environment created at:") {
		t.Fatalf("env create failed: %v, out: %s", err, out1)
	}

	out2, err := executeCommand("env", "delete", "testenv", "--force")
	if err != nil || !strings.Contains(out2, "Deleted virtual environment at") {
		t.Fatalf("env delete failed: %v, out: %s", err, out2)
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

	out, err := executeCommand("install", "--shim-mode", "bat")
	if err != nil {
		t.Fatalf("install bat in shim mode failed: %v", err)
	}
	if out != "" {
		t.Errorf("expected no output in shim mode, got: %q", out)
	}
}

func TestUpdateCommand_HelpAndUninstalled(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	_, err := executeCommand("-c", configPath, "update", "non-existent-tool")
	if err == nil {
		t.Errorf("expected update non-existent-tool to return an error")
	}

	out, err := executeCommand("update", "--help")
	if err != nil {
		t.Fatalf("update --help failed: %v", err)
	}
	if !strings.Contains(out, "When run without arguments, checks all installed tools") || !strings.Contains(out, "dotfiles update ripgrep") {
		t.Errorf("expected update --help to contain usage details, got:\n%s", out)
	}
	if !strings.Contains(out, "--force") || !strings.Contains(out, "-f") {
		t.Errorf("expected update --help to contain --force / -f flag documentation, got:\n%s", out)
	}
}

func TestUpdateCommand_ForceFlag(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	// Test update with --force for all tools
	outForceAll, err := executeCommand("-c", absConfig, "update", "--force")
	if err != nil {
		t.Errorf("update --force failed: %v, out: %s", err, outForceAll)
	}

	// Test update with -f for a non-existent tool returns error
	_, err = executeCommand("-c", absConfig, "update", "-f", "non-existent-tool")
	if err == nil {
		t.Errorf("expected update -f non-existent-tool to return an error")
	}
}

func TestCheckUpdatesCommand_Details(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	out, err := executeCommand("-c", absConfig, "check-updates")
	if err != nil {
		t.Fatalf("check-updates failed: %v, out: %s", err, out)
	}

	if !strings.Contains(out, "Checking for updates across configured tools") {
		t.Errorf("expected check-updates output to mention checking tools, got:\n%s", out)
	}
}

func TestRunMain(t *testing.T) {
	origArgs := os.Args
	defer func() { os.Args = origArgs }()
	os.Args = []string{"dotfiles", "version"}
	runMain()
}

func TestVersionCommand(t *testing.T) {
	out, err := executeCommand("version")
	if err != nil {
		t.Fatalf("version command failed: %v", err)
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
		out, err := executeCommand("-c", absConfig, "why", "bat")
		if err != nil {
			t.Fatalf("why bat failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/github-release--bat.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("found tool in subfolder by binary name eza", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "why", "eza")
		if err != nil {
			t.Fatalf("why eza failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/subfolder/cargo--eza.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("found tool by full name github-release--bat", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "why", "github-release--bat")
		if err != nil {
			t.Fatalf("why github-release--bat failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/github-release--bat.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("not found tool fz", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "why", "fz")
		if err == nil {
			t.Errorf("expected error when tool not found, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})

	t.Run("no argument provided", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "why")
		if err == nil {
			t.Errorf("expected error when no arg provided, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})

	t.Run("bootstrap error invalid config file", func(t *testing.T) {
		out, err := executeCommand("-c", "/nonexistent/config.ts", "why", "bat")
		if err == nil {
			t.Errorf("expected error on bootstrap failure, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})
}

func TestAdditionalCmdCoverage(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	// files command
	_, _ = executeCommand("-c", absConfig, "files")
	_, _ = executeCommand("-c", absConfig, "files", "--tree")
	_, _ = executeCommand("-c", absConfig, "files", "--json")
	_, _ = executeCommand("-c", configPath, "files")

	// generate with --overwrite
	_, _ = executeCommand("-c", absConfig, "generate", "--overwrite")
	_, _ = executeCommand("-c", absConfig, "generate")

	// install command single & all
	_, _ = executeCommand("-c", absConfig, "install", "bat")
	_, _ = executeCommand("-c", absConfig, "install")

	// uninstall command single & all
	_, _ = executeCommand("-c", absConfig, "uninstall", "bat")
	_, _ = executeCommand("-c", absConfig, "uninstall")

	// update command
	_, _ = executeCommand("-c", absConfig, "update", "bat")
	_, _ = executeCommand("-c", absConfig, "update")

	// log command
	_, _ = executeCommand("-c", absConfig, "log")
	_, _ = executeCommand("-c", absConfig, "log", "--lines", "10")
	_, _ = executeCommand("-c", absConfig, "log", "--json")

	// convert command
	tsPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(tsPath, []byte("export default {};"), 0644)
	_, _ = executeCommand("-c", tsPath, "convert", "-i", tsPath, "-o", filepath.Join(tmpDir, "out.json"))

	// bin command
	_, _ = executeCommand("-c", absConfig, "bin")
	_, _ = executeCommand("-c", absConfig, "bin", "--list")

	// check-updates command
	_, _ = executeCommand("-c", absConfig, "check-updates")

	// features command
	_, _ = executeCommand("-c", absConfig, "features")

	// detect-conflicts command
	_, _ = executeCommand("-c", absConfig, "detect-conflicts")

	// env command
	_, _ = executeCommand("-c", absConfig, "env")

	// cleanup command
	_, _ = executeCommand("-c", absConfig, "cleanup")

	// validate command
	_, _ = executeCommand("-c", absConfig, "validate")

	// skill command
	_, _ = executeCommand("-c", absConfig, "skill", "--dir", filepath.Join(repoRoot, ".agents/skills"))

	// dashboard command help
	_, _ = executeCommand("dashboard", "--help")
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
			"binaries": ["bat"]
		}
	}
}`, tmpDir, targetDir, tmpDir)

	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed writing test config: %v", err)
	}

	_, err := executeCommand("-c", configPath, "detect-conflicts")
	if err == nil {
		t.Fatalf("expected detect-conflicts to return error when non-generator file exists")
	}
	if !strings.Contains(err.Error(), "conflicts detected") {
		t.Errorf("expected conflict error message, got: %v", err)
	}
}

func TestUpdateAndValidateCommand_FindTool(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	// Validate with suffix 'bat' should resolve 'github-release--bat'
	out, err := executeCommand("-c", absConfig, "validate", "bat")
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
		outHuman, err := executeCommand("-c", absConfig, "check-updates", "--json")
		if err != nil {
			t.Fatalf("check-updates --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[\n  {") {
			t.Errorf("expected indented JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "check-updates", "--json")
		if err != nil {
			t.Fatalf("check-updates --json failed in agent mode: %v", err)
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
		out, err := executeCommand("-c", absConfig, "check-updates")
		if err != nil {
			t.Fatalf("check-updates failed in agent mode: %v", err)
		}
		if !strings.Contains(out, "tool:") {
			t.Errorf("expected key-value format in agent mode, got:\n%s", out)
		}
	})

	t.Run("files --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "files", "--json")
		if err != nil {
			t.Fatalf("files --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[]") && !strings.Contains(jsonHuman, "[\n  ") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "files", "--json")
		if err != nil {
			t.Fatalf("files --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("files tree in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, _ := executeCommand("-c", absConfig, "files")
		if !strings.Contains(outHuman, "No files currently managed") && !strings.Contains(outHuman, "- ") {
			t.Errorf("expected human list in human mode, got:\n%s", outHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, _ := executeCommand("-c", absConfig, "files")
		if !strings.Contains(outAgent, "no files managed") && !strings.Contains(outAgent, "tool:") {
			t.Errorf("expected compact agent output in agent mode, got:\n%s", outAgent)
		}
	})

	t.Run("bin --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "bin", "--list", "--json")
		if err != nil {
			t.Fatalf("bin --list --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"binary\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "bin", "--list", "--json")
		if err != nil {
			t.Fatalf("bin --list --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "\n") {
			t.Errorf("expected minified single-line JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("detect-conflicts --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "detect-conflicts", "--json")
		if err != nil {
			t.Fatalf("detect-conflicts --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"hasConflicts\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "detect-conflicts", "--json")
		if err != nil {
			t.Fatalf("detect-conflicts --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("detect-conflicts text in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", absConfig, "detect-conflicts")
		if err != nil {
			t.Fatalf("detect-conflicts failed: %v", err)
		}
		if !strings.Contains(out, "OK: no conflicts") {
			t.Errorf("expected 'OK: no conflicts' in agent mode, got:\n%s", out)
		}
	})

	t.Run("features --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "features", "--json")
		if err != nil {
			t.Fatalf("features --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"catalog\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "features", "--json")
		if err != nil {
			t.Fatalf("features --json in agent mode failed: %v", err)
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
		outHuman, err := executeCommand("-c", absConfig, "log", "--status", "--json")
		if err != nil {
			t.Fatalf("log --status --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[]") && !strings.Contains(jsonHuman, "  ") {
			t.Errorf("expected valid JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "log", "--status", "--json")
		if err != nil {
			t.Fatalf("log --status --json in agent mode failed: %v", err)
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
		{"why requires a tool", []string{"why"}, "accepts 1 arg(s), received 0"},
		{"why rejects a second tool", []string{"why", "bat", "fd"}, "accepts 1 arg(s), received 2"},
		{"log rejects a second tool", []string{"log", "bat", "fd"}, atMostOne},
		{"files rejects a second tool", []string{"files", "bat", "fd"}, atMostOne},
		{"validate rejects a second tool", []string{"validate", "bat", "fd"}, atMostOne},
		{"uninstall rejects a second tool", []string{"uninstall", "bat", "fd"}, atMostOne},
		{"update rejects a second tool", []string{"update", "bat", "fd"}, atMostOne},
		{"bin rejects a second name", []string{"bin", "bat", "fd"}, atMostOne},
		{"upgrade rejects a second version", []string{"upgrade", "1.0.0", "2.0.0"}, atMostOne},
		{"skill rejects a second path", []string{"skill", "a", "b"}, atMostOne},
		{"env create rejects a second name", []string{"env", "create", "a", "b"}, atMostOne},
		{"env delete rejects a second name", []string{"env", "delete", "a", "b"}, atMostOne},
		{"features rejects an unknown word", []string{"features", "readme"}, `invalid argument "readme" for "dotfiles features"`},
		{"features rejects a second word", []string{"features", "generate-readme", "generate-readme"}, atMostOne},
		{"generate takes no arguments", []string{"generate", "bat"}, `unknown command "bat" for "dotfiles generate"`},
		{"cleanup takes no arguments", []string{"cleanup", "bat"}, `unknown command "bat" for "dotfiles cleanup"`},
		{"dashboard takes no arguments", []string{"dashboard", "bat"}, `unknown command "bat" for "dotfiles dashboard"`},
		{"check-updates takes no arguments", []string{"check-updates", "bat"}, `unknown command "bat" for "dotfiles check-updates"`},
		{"detect-conflicts takes no arguments", []string{"detect-conflicts", "bat"}, `unknown command "bat" for "dotfiles detect-conflicts"`},
		{"version takes no arguments", []string{"version", "bat"}, `unknown command "bat" for "dotfiles version"`},
		{"scaffold takes no arguments", []string{"scaffold", "bat"}, `unknown command "bat" for "dotfiles scaffold"`},
		{"env takes no arguments", []string{"env", "bat"}, `unknown command "bat" for "dotfiles env"`},
		{"config convert takes no arguments", []string{"config", "convert", "bat"}, `unknown command "bat" for "dotfiles config convert"`},
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
			"binaries": ["bat"]
		},
		"github-release--fd": {
			"name": "github-release--fd",
			"installationMethod": "github-release",
			"binaries": ["fd"]
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
		{"install first arg", []string{"install", ""}, allTools},
		{"update first arg", []string{"update", ""}, allTools},
		{"uninstall first arg", []string{"uninstall", ""}, allTools},
		{"why first arg", []string{"why", ""}, allTools},
		{"files first arg", []string{"files", ""}, allTools},
		{"log first arg", []string{"log", ""}, allTools},
		{"validate first arg", []string{"validate", ""}, allTools},
		{"prefix filters candidates", []string{"install", "github-release--b"}, []string{"github-release--bat"}},
		{"install excludes tools already on the line", []string{"install", "github-release--bat", ""}, []string{"brew", "github-release--fd"}},
		{"install treats KEY=VALUE as not a tool", []string{"install", "FOO=1", ""}, allTools},
		{"why accepts a single tool only", []string{"why", "github-release--bat", ""}, []string{}},
		{"update accepts a single tool only", []string{"update", "github-release--bat", ""}, []string{}},
		{"uninstall accepts a single tool only", []string{"uninstall", "github-release--bat", ""}, []string{}},
		{"files accepts a single tool only", []string{"files", "github-release--bat", ""}, []string{}},
		{"log accepts a single tool only", []string{"log", "github-release--bat", ""}, []string{}},
		{"validate accepts a single tool only", []string{"validate", "github-release--bat", ""}, []string{}},
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

	out, err := runCommand(cobra.ShellCompRequestCmd, "bin", "")
	if err != nil {
		t.Fatalf("__complete bin returned error: %v\n%s", err, out.Combined)
	}
	got, directive := parseCompletionOutput(t, out.Stdout)
	// brew appears once even though it is both a tool name and that tool's implicit binary.
	assertCandidates(t, got, []string{"bat", "brew", "fd", "github-release--bat", "github-release--fd"})
	if directive&cobra.ShellCompDirectiveNoFileComp == 0 {
		t.Fatalf("directive = %d, want ShellCompDirectiveNoFileComp set", directive)
	}

	out, err = runCommand(cobra.ShellCompRequestCmd, "bin", "bat", "")
	if err != nil {
		t.Fatalf("__complete bin bat returned error: %v\n%s", err, out.Combined)
	}
	got, _ = parseCompletionOutput(t, out.Stdout)
	assertCandidates(t, got, []string{})
}

func TestCompletion_ConfigLoadFailureReportsError(t *testing.T) {
	createCompletionConfigDir(t)
	missingConfig := filepath.Join(t.TempDir(), "missing.config.json")

	// One subcommand per completion variant: repeatable tool, single tool, binary-or-tool.
	for _, sub := range []string{"install", "why", "bin"} {
		t.Run(sub, func(t *testing.T) {
			out, err := runCommand("--config", missingConfig, cobra.ShellCompRequestCmd, sub, "")
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

	out, err := runCommand(cobra.ShellCompRequestCmd, "install", "")
	if err != nil {
		t.Fatalf("__complete install returned error: %v\n%s", err, out.Combined)
	}
	for _, want := range []string{"brew\tmanual\n", "github-release--bat\tgithub-release\n"} {
		if !strings.Contains(out.Stdout, want) {
			t.Fatalf("stdout = %q, want candidate line %q", out.Stdout, want)
		}
	}
}
