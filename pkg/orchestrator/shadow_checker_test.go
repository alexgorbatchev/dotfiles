package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestShadowChecker_BuiltinDetection(t *testing.T) {
	memFS := fs.NewMemFS()
	sc := NewShadowChecker(memFS, nil)

	tests := []struct {
		name       string
		tool       *config.ToolConfig
		wantSubstr []string
	}{
		{
			name: "zsh builtin function cd",
			tool: &config.ToolConfig{
				Name: "zoxide",
				ShellConfigs: &config.ShellConfigs{
					Zsh: &config.ShellTypeConfig{
						Functions: map[string]string{
							"cd": "zoxide_cd $@",
						},
					},
				},
			},
			wantSubstr: []string{
				`[zsh] Function "cd" shadows zsh builtin "cd"`,
			},
		},
		{
			name: "bash builtin alias echo",
			tool: &config.ToolConfig{
				Name: "echo-enhancer",
				ShellConfigs: &config.ShellConfigs{
					Bash: &config.ShellTypeConfig{
						Aliases: map[string]string{
							"echo": "echo -e",
						},
					},
				},
			},
			wantSubstr: []string{
				`[bash] Alias "echo" shadows bash builtin "echo"`,
			},
		},
		{
			name: "powershell builtin alias ls and dir",
			tool: &config.ToolConfig{
				Name: "eza",
				ShellConfigs: &config.ShellConfigs{
					Powershell: &config.ShellTypeConfig{
						Aliases: map[string]string{
							"dir": "eza",
							"ls":  "eza",
						},
					},
				},
			},
			wantSubstr: []string{
				`[powershell] Alias "dir" shadows powershell builtin "dir"`,
				`[powershell] Alias "ls" shadows powershell builtin "ls"`,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			warnings := sc.CheckTool(context.Background(), tt.tool, nil)
			if len(warnings) != len(tt.wantSubstr) {
				t.Fatalf("expected %d warnings, got %d: %+v", len(tt.wantSubstr), len(warnings), warnings)
			}
			for i, want := range tt.wantSubstr {
				if !strings.Contains(warnings[i].Message, want) {
					t.Errorf("warning[%d] %q does not contain %q", i, warnings[i].Message, want)
				}
				if warnings[i].ToolName != tt.tool.Name {
					t.Errorf("warning[%d] ToolName = %q, want %q", i, warnings[i].ToolName, tt.tool.Name)
				}
			}
		})
	}
}

func TestShadowChecker_ExternalCommandDetection(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/usr/bin", 0755)
	_ = memFS.WriteFile("/usr/bin/git", []byte("echo git"), 0755)
	_ = memFS.WriteFile("/usr/bin/ls", []byte("echo ls"), 0755)
	_ = memFS.WriteFile("/usr/bin/cat", []byte("echo cat"), 0755)

	sc := NewShadowChecker(memFS, nil)
	sc.SetPath("/usr/bin")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/.generated/bin",
			HomeDir:      "/home/user",
		},
	}

	t.Run("binary shim shadows external command", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name:               "custom-git",
			InstallationMethod: "github-release",
			InstallParams: map[string]interface{}{
				"repo": "custom/git",
			},
			Binaries: []interface{}{
				config.BinaryConfig{Name: "git"},
			},
		}
		warnings := sc.CheckTool(context.Background(), tool, projCfg)
		if len(warnings) != 1 {
			t.Fatalf("expected 1 warning, got %d: %+v", len(warnings), warnings)
		}
		expected := `Binary "git" shadows /usr/bin/git`
		if warnings[0].Message != expected {
			t.Errorf("got %q, want %q", warnings[0].Message, expected)
		}
	})

	t.Run("alias shadows external command", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "eza",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"ls": "eza",
					},
				},
			},
		}
		warnings := sc.CheckTool(context.Background(), tool, projCfg)
		if len(warnings) != 1 {
			t.Fatalf("expected 1 warning, got %d: %+v", len(warnings), warnings)
		}
		expected := `[zsh] Alias "ls" shadows /usr/bin/ls`
		if warnings[0].Message != expected {
			t.Errorf("got %q, want %q", warnings[0].Message, expected)
		}
	})

	t.Run("function shadows external command", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "bat",
			ShellConfigs: &config.ShellConfigs{
				Bash: &config.ShellTypeConfig{
					Functions: map[string]string{
						"cat": `bat "$@"`,
					},
				},
			},
		}
		warnings := sc.CheckTool(context.Background(), tool, projCfg)
		if len(warnings) != 1 {
			t.Fatalf("expected 1 warning, got %d: %+v", len(warnings), warnings)
		}
		expected := `[bash] Function "cat" shadows /usr/bin/cat`
		if warnings[0].Message != expected {
			t.Errorf("got %q, want %q", warnings[0].Message, expected)
		}
	})
}

func TestShadowChecker_IntentionalDelegationExemption(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/usr/bin", 0755)
	_ = memFS.WriteFile("/usr/bin/git", []byte("echo git"), 0755)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("db error: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	sc := NewShadowChecker(memFS, reg)
	sc.SetPath("/usr/bin")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/.generated/bin",
			HomeDir:      "/home/user",
			BinariesDir:  "/home/user/.generated/binaries",
		},
	}

	// 1. Tool with manual installation method pointing directly to /usr/bin/git
	tool := &config.ToolConfig{
		Name:               "git-wrapper",
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"binaryPath": "/usr/bin/git",
		},
		Binaries: []interface{}{
			config.BinaryConfig{Name: "git"},
		},
	}

	warnings := sc.CheckTool(ctx, tool, projCfg)
	if len(warnings) != 0 {
		t.Errorf("expected no warnings for intentional delegation, got: %+v", warnings)
	}

	// 2. Tool with manual binaryPath as bare command name "git"
	toolBare := &config.ToolConfig{
		Name:               "git-bare",
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"binaryPath": "git",
		},
		Binaries: []interface{}{
			config.BinaryConfig{Name: "git"},
		},
	}

	warningsBare := sc.CheckTool(ctx, toolBare, projCfg)
	if len(warningsBare) != 0 {
		t.Errorf("expected no warnings for bare binary delegation, got: %+v", warningsBare)
	}

	// 3. Tool with relative binaryPath and ConfigFilePath
	toolRel := &config.ToolConfig{
		Name:               "local-rel",
		InstallationMethod: "manual",
		ConfigFilePath:     "/home/user/tools/tool.ts",
		InstallParams: map[string]interface{}{
			"binaryPath": "../bin/local-rel",
		},
		Binaries: []interface{}{
			config.BinaryConfig{Name: "local-rel"},
		},
	}
	_ = memFS.MkdirAll("/home/user/bin", 0755)
	_ = memFS.WriteFile("/home/user/bin/local-rel", []byte("echo rel"), 0755)
	warningsRel := sc.CheckTool(ctx, toolRel, projCfg)
	if len(warningsRel) != 0 {
		t.Errorf("expected no warnings for relative manual binary, got: %+v", warningsRel)
	}

	// 4. Tool with registry record matching external binary path
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "brew-git",
			Version:     "1.0.0",
			InstallPath: "/opt/homebrew/Cellar/git/1.0.0",
			BinaryPaths: `["/usr/bin/git"]`,
		})
	})
	toolBrew := &config.ToolConfig{
		Name:               "brew-git",
		InstallationMethod: "brew",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "git"},
		},
	}
	warningsBrew := sc.CheckTool(ctx, toolBrew, projCfg)
	if len(warningsBrew) != 0 {
		t.Errorf("expected no warnings for registry-delegated tool, got: %+v", warningsBrew)
	}

	// 5. Tool without ConfigFilePath falling back to BinariesDir
	toolBinDir := &config.ToolConfig{
		Name:               "bin-dir-tool",
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"binaryPath": "rel/bin",
		},
		Binaries: []interface{}{
			config.BinaryConfig{Name: "bin"},
		},
	}
	_ = memFS.MkdirAll("/home/user/.generated/binaries/bin-dir-tool/current/rel", 0755)
	_ = memFS.WriteFile("/home/user/.generated/binaries/bin-dir-tool/current/rel/bin", []byte("echo bin"), 0755)
	warningsBinDir := sc.CheckTool(ctx, toolBinDir, projCfg)
	if len(warningsBinDir) != 0 {
		t.Errorf("expected no warnings for binDir resolved tool, got: %+v", warningsBinDir)
	}
}

func TestShadowChecker_IgnoreGeneratedAndTargetDirs(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/home/user/.generated/bin", 0755)
	_ = memFS.WriteFile("/home/user/.generated/bin/tool-bin", []byte("echo shim"), 0755)

	sc := NewShadowChecker(memFS, nil)
	sc.SetPath("/home/user/.generated/bin:~/.generated/bin")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "~/.generated/bin",
			HomeDir:      "/home/user",
		},
	}

	tool := &config.ToolConfig{
		Name: "test-tool",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "tool-bin"},
		},
	}

	warnings := sc.CheckTool(context.Background(), tool, projCfg)
	if len(warnings) != 0 {
		t.Errorf("expected no warnings for self-generated shims on PATH, got: %+v", warnings)
	}
}

func TestShadowChecker_FallbackDirs(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/opt/homebrew/bin", 0755)
	_ = memFS.WriteFile("/opt/homebrew/bin/brew-cmd", []byte("echo brew"), 0755)

	sc := NewShadowChecker(memFS, nil)
	sc.SetPath("/empty-path")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/.generated/bin",
			HomeDir:      "/home/user",
		},
	}

	tool := &config.ToolConfig{
		Name:               "custom-brew-cmd",
		InstallationMethod: "github-release",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "brew-cmd"},
		},
	}

	warnings := sc.CheckTool(context.Background(), tool, projCfg)
	if len(warnings) != 1 {
		t.Fatalf("expected 1 warning from fallback dirs, got %d: %+v", len(warnings), warnings)
	}
	expected := `Binary "brew-cmd" shadows /opt/homebrew/bin/brew-cmd`
	if warnings[0].Message != expected {
		t.Errorf("got %q, want %q", warnings[0].Message, expected)
	}
}

func TestShadowChecker_DisabledAndHostnameFiltering(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/usr/bin", 0755)
	_ = memFS.WriteFile("/usr/bin/git", []byte("echo git"), 0755)

	sc := NewShadowChecker(memFS, nil)
	sc.SetPath("/usr/bin")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/.generated/bin",
			HomeDir:      "/home/user",
		},
	}

	disabledTool := &config.ToolConfig{
		Name:     "git-disabled",
		Disabled: true,
		Binaries: []interface{}{
			config.BinaryConfig{Name: "git"},
		},
	}
	if warns := sc.CheckTool(context.Background(), disabledTool, projCfg); len(warns) != 0 {
		t.Errorf("expected 0 warnings for disabled tool, got %d", len(warns))
	}

	mismatchedHostnameTool := &config.ToolConfig{
		Name:     "git-wrong-host",
		Hostname: "non-existent-host-xyz-999",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "git"},
		},
	}
	if warns := sc.CheckTool(context.Background(), mismatchedHostnameTool, projCfg); len(warns) != 0 {
		t.Errorf("expected 0 warnings for hostname-mismatched tool, got %d", len(warns))
	}
}

func TestShadowChecker_ShimFalseExemption(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/usr/bin", 0755)
	_ = memFS.WriteFile("/usr/bin/tsc", []byte("echo tsc"), 0755)

	sc := NewShadowChecker(memFS, nil)
	sc.SetPath("/usr/bin")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/.generated/bin",
			HomeDir:      "/home/user",
		},
	}

	shimFalse := false
	tool := &config.ToolConfig{
		Name: "typescript",
		Binaries: []interface{}{
			config.BinaryConfig{
				Name: "tsc",
				Shim: &shimFalse,
			},
		},
	}

	warns := sc.CheckTool(context.Background(), tool, projCfg)
	if len(warns) != 0 {
		t.Errorf("expected 0 warnings for shim: false binary, got %d: %+v", len(warns), warns)
	}
}

func TestGenerateTools_EmitsShadowWarnings(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/usr/bin", 0755)
	_ = memFS.WriteFile("/usr/bin/ls", []byte("echo ls"), 0755)

	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	ctx := context.Background()
	orch := newTestOrchestrator(t, memFS, "")
	orch.logger = testLog
	orch.SetCustomPathEnv("/usr/bin")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
			HomeDir:         "/home/user",
			BinariesDir:     "/home/user/.generated/binaries",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name: "eza",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Aliases: map[string]string{
						"ls": "eza",
					},
				},
			},
		},
	}

	err := orch.GenerateTools(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools failed: %v", err)
	}

	output := logBuf.String()
	expectedWarn := `WARN	[eza] [zsh] Alias "ls" shadows /usr/bin/ls`
	if !strings.Contains(output, expectedWarn) {
		t.Errorf("expected log output to contain %q, got:\n%s", expectedWarn, output)
	}
}

func TestShadowChecker_CheckToolsAndContextCancellation(t *testing.T) {
	memFS := fs.NewMemFS()
	sc := NewShadowChecker(memFS, nil)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	tools := []*config.ToolConfig{
		{
			Name: "tool1",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Functions: map[string]string{"cd": "echo cd"},
				},
			},
		},
	}

	warns := sc.CheckTools(ctx, tools, nil)
	if len(warns) != 0 {
		t.Errorf("expected 0 warnings when context is cancelled, got %d", len(warns))
	}
}

func TestIsShellBuiltin_UnknownShell(t *testing.T) {
	if isShellBuiltin("fish", "cd") {
		t.Errorf("expected isShellBuiltin to return false for unsupported shell")
	}
}
