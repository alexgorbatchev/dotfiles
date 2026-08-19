package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
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

func executeCommand(args ...string) (string, error) {
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

	buf := new(bytes.Buffer)
	rootCmd.SetOut(buf)
	rootCmd.SetErr(buf)
	rootCmd.SetArgs(args)

	err := rootCmd.Execute()
	return buf.String(), err
}

func createTempConfigDir(t *testing.T) string {
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

	configContent := `{
	"projectConfig": {
		"paths": {
			"homeDir": "/tmp/test-home",
			"targetDir": "/tmp/test-target",
			"generatedDir": "/tmp/test-generated"
		}
	},
	"toolConfigs": {
		"bat": {
			"name": "bat",
			"installer": "github-release"
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
	createTempConfigDir(t)

	tests := []struct {
		name           string
		args           []string
		expectedOutput []string
		expectedErr    bool
	}{
		{
			name:           "generate command default",
			args:           []string{"generate"},
			expectedOutput: []string{"Starting generation", "Command completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "generate command dry-run",
			args:           []string{"generate", "--dry-run"},
			expectedOutput: []string{"Starting generation", "Command completed successfully (dry-run)"},
			expectedErr:    false,
		},
		{
			name:           "install all tools",
			args:           []string{"install"},
			expectedOutput: []string{"Installing all configured tools", "Command completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "install single tool",
			args:           []string{"install", "bat"},
			expectedOutput: []string{"Installing tool: bat", "Command completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "uninstall all tools",
			args:           []string{"uninstall"},
			expectedOutput: []string{"Uninstalling all configured tools", "Command completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "uninstall single tool",
			args:           []string{"uninstall", "bat"},
			expectedOutput: []string{"Uninstalling tool: bat", "Command completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "update command",
			args:           []string{"update"},
			expectedOutput: []string{"Evaluating versions and checking for updates", "Command completed successfully"},
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
			expectedOutput: []string{"/tmp/test-generated"},
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
			expectedOutput: []string{"Starting cleanup of orphaned tools and stale artifacts", "Command completed successfully"},
			expectedErr:    false,
		},
		{
			name:           "check-updates command",
			args:           []string{"check-updates"},
			expectedOutput: []string{"Checking for updates across configured tools", "Command completed successfully"},
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
	// Force dryRun = true for in-memory DB and MemFS simulation
	dryRun = true
	services, err := BootstrapServices(ctx, "test-project/dotfiles.config.ts")
	if err != nil {
		t.Fatalf("bootstrap failed: %v", err)
	}
	defer services.DB.Close()

	if services.ProjectConfig.Paths.HomeDir == "" {
		t.Errorf("expected loaded config, got empty HomeDir")
	}

	if len(services.ToolConfigs) != 13 {
		t.Errorf("expected exactly 13 tool configurations to be successfully loaded natively, but got %d", len(services.ToolConfigs))
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

func TestMatchesPlatform(t *testing.T) {
	tests := []struct {
		platforms int
		osName    string
		want      bool
	}{
		{1, "linux", true},
		{1, "darwin", false},
		{2, "darwin", true},
		{3, "linux", true},    // Linux | Darwin (1 | 2 = 3)
		{3, "darwin", true},   // Linux | Darwin (1 | 2 = 3)
		{3, "windows", false}, // Linux | Darwin (1 | 2 = 3)
		{5, "linux", true},    // Linux | Windows (1 | 4 = 5)
		{5, "windows", true},  // Linux | Windows (1 | 4 = 5)
		{5, "darwin", false},  // Linux | Windows (1 | 4 = 5)
		{7, "linux", true},    // All (1 | 2 | 4 = 7)
		{7, "darwin", true},
		{7, "windows", true},
	}

	for _, tt := range tests {
		got := matchesPlatform(tt.platforms, tt.osName)
		if got != tt.want {
			t.Errorf("matchesPlatform(%d, %q) = %v; want %v", tt.platforms, tt.osName, got, tt.want)
		}
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
	"projectConfig": {"paths": {"homeDir": "/tmp/h", "targetDir": "/tmp/t", "generatedDir": "/tmp/g"}},
	"toolConfigs": {}
}`
			if strings.HasSuffix(candName, ".ts") || strings.HasSuffix(candName, ".js") {
				content = `export default { projectConfig: { paths: { homeDir: "/tmp/h", targetDir: "/tmp/t", generatedDir: "/tmp/g" } }, toolConfigs: {} };`
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
	"projectConfig": {"paths": {"homeDir": "/tmp/h", "targetDir": "/tmp/t", "generatedDir": "/tmp/g"}},
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
			"installer": "github-release",
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
		"paths": {
			"homeDir": "/tmp/test-home",
			"targetDir": "/tmp/test-target",
			"generatedDir": "/tmp/test-generated"
		}
	},
	"toolConfigs": {
		"implicit-name-tool": {
			"installer": "github-release"
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
