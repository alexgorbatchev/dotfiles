package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

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
	port = 8080
	inputFile = "dotfiles.config.ts"
	outputFile = "dotfiles.config.json"
	listBins = false
	generateReadme = false
	logTailLines = 50
	skillDir = ""

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
			name:           "files command",
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
	services, err := BootstrapServices(ctx, "test-project-npm/dotfiles.config.ts")
	if err != nil {
		t.Fatalf("bootstrap failed: %v", err)
	}
	defer services.DB.Close()

	if services.ProjectConfig.Paths.HomeDir == "" {
		t.Errorf("expected loaded config, got empty HomeDir")
	}

	if len(services.ToolConfigs) != 12 {
		t.Errorf("expected exactly 12 tool configurations to be successfully loaded natively, but got %d", len(services.ToolConfigs))
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
