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
		expected := `Binary 'git' shadows '/usr/bin/git'`
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

func TestShadowChecker_FalsePositiveExemptions(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/.generated/bin",
			HomeDir:      "/home/user",
			BinariesDir:  "/home/user/.generated/binaries",
		},
	}

	sc := NewShadowChecker(memFS, nil)
	sc.SetPath("/opt/homebrew/bin:/home/user/.orbstack/bin:/usr/bin")

	// 1. Brew tool whose binary is in Homebrew prefix should NOT warn
	_ = memFS.MkdirAll("/opt/homebrew/bin", 0755)
	_ = memFS.WriteFile("/opt/homebrew/bin/gpg", []byte("echo gpg"), 0755)

	toolGPG := &config.ToolConfig{
		Name:               "gpg",
		InstallationMethod: "brew",
		InstallParams: map[string]interface{}{
			"formula": "gnupg",
		},
		Binaries: []interface{}{
			config.BinaryConfig{Name: "gpg"},
		},
	}
	warningsGPG := sc.CheckTool(ctx, toolGPG, projCfg)
	if len(warningsGPG) != 0 {
		t.Errorf("expected no warnings for brew tool with binary in Homebrew prefix, got: %+v", warningsGPG)
	}

	// 2. Tool with shell.path and existing shim targeting that path should NOT warn
	_ = memFS.MkdirAll("/home/user/.orbstack/bin", 0755)
	_ = memFS.WriteFile("/home/user/.orbstack/bin/docker", []byte("echo docker"), 0755)
	_ = memFS.MkdirAll("/home/user/.generated/bin", 0755)
	shimContent := `#!/usr/bin/env bash
# Shim for docker
# Generated by Dotfiles Management Tool
TOOL_NAME="orbstack"
BINARY_NAME="docker"
TOOL_EXECUTABLE="/home/user/.orbstack/bin/docker"
exec "$TOOL_EXECUTABLE" "$@"
`
	_ = memFS.WriteFile("/home/user/.generated/bin/docker", []byte(shimContent), 0755)

	toolOrbstack := &config.ToolConfig{
		Name:               "orbstack",
		InstallationMethod: "brew",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "docker"},
		},
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Paths: []interface{}{"$HOME/.orbstack/bin"},
			},
		},
	}
	warningsOrbstack := sc.CheckTool(ctx, toolOrbstack, projCfg)
	if len(warningsOrbstack) != 0 {
		t.Errorf("expected no warnings for tool with matching shell.path and shim target, got: %+v", warningsOrbstack)
	}

	// 3. Symlink equivalence: instRecord has opt path, PATH has bin path, both point to same Cellar file
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("db error: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	scWithReg := NewShadowChecker(memFS, reg)
	scWithReg.SetPath("/opt/homebrew/bin")

	_ = memFS.MkdirAll("/opt/homebrew/Cellar/tool/1.0/bin", 0755)
	_ = memFS.WriteFile("/opt/homebrew/Cellar/tool/1.0/bin/symtool", []byte("echo symtool"), 0755)
	_ = memFS.MkdirAll("/opt/homebrew/opt/tool/bin", 0755)
	_ = memFS.Symlink("/opt/homebrew/Cellar/tool/1.0/bin/symtool", "/opt/homebrew/opt/tool/bin/symtool")
	_ = memFS.Symlink("/opt/homebrew/Cellar/tool/1.0/bin/symtool", "/opt/homebrew/bin/symtool")

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "symtool",
			Version:     "1.0",
			InstallPath: "/opt/homebrew/Cellar/tool/1.0",
			BinaryPaths: `["/opt/homebrew/opt/tool/bin/symtool"]`,
		})
	})

	toolSym := &config.ToolConfig{
		Name:               "symtool",
		InstallationMethod: "brew",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "symtool"},
		},
	}
	warningsSym := scWithReg.CheckTool(ctx, toolSym, projCfg)
	if len(warningsSym) != 0 {
		t.Errorf("expected no warnings for symlink-equivalent target, got: %+v", warningsSym)
	}

	// 4. Genuine shadow: github-release tool shadowing /usr/bin/jq MUST STILL WARN
	_ = memFS.MkdirAll("/usr/bin", 0755)
	_ = memFS.WriteFile("/usr/bin/jq", []byte("echo system-jq"), 0755)
	toolJQ := &config.ToolConfig{
		Name:               "jq",
		InstallationMethod: "github-release",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "jq"},
		},
	}
	warningsJQ := sc.CheckTool(ctx, toolJQ, projCfg)
	if len(warningsJQ) != 1 {
		t.Errorf("expected 1 warning for jq shadowing /usr/bin/jq, got: %+v", warningsJQ)
	}

	// 5. Genuine shadow: brew tool git shadowing /usr/bin/git (system, not brew) MUST STILL WARN
	_ = memFS.WriteFile("/usr/bin/git", []byte("echo apple-git"), 0755)
	toolGit := &config.ToolConfig{
		Name:               "git",
		InstallationMethod: "brew",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "git"},
		},
	}
	warningsGit := sc.CheckTool(ctx, toolGit, projCfg)
	if len(warningsGit) != 1 {
		t.Errorf("expected 1 warning for brew git shadowing /usr/bin/git, got: %+v", warningsGit)
	}

	// 6. Tool without existing shim where toolHasShellPath matches without brew
	_ = memFS.MkdirAll("/home/user/custom/bin", 0755)
	_ = memFS.WriteFile("/home/user/custom/bin/custom-cli", []byte("echo custom"), 0755)
	sc.SetPath("/home/user/custom/bin")
	toolCustom := &config.ToolConfig{
		Name:               "custom-tool",
		InstallationMethod: "pkg",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "custom-cli"},
		},
		ShellConfigs: &config.ShellConfigs{
			Bash: &config.ShellTypeConfig{
				Paths: []interface{}{"~/custom/bin", 123},
			},
		},
	}
	warningsCustom := sc.CheckTool(ctx, toolCustom, projCfg)
	if len(warningsCustom) != 0 {
		t.Errorf("expected no warnings for tool with matching shell.path, got: %+v", warningsCustom)
	}

	// 7. current entrypoint in BinariesDir
	_ = memFS.MkdirAll("/home/user/.generated/binaries/pass/current", 0755)
	_ = memFS.MkdirAll("/opt/homebrew/bin", 0755)
	_ = memFS.WriteFile("/opt/homebrew/bin/pass", []byte("echo pass"), 0755)
	_ = memFS.Symlink("/opt/homebrew/bin/pass", "/home/user/.generated/binaries/pass/current/pass")
	sc.SetPath("/opt/homebrew/bin")
	toolPass := &config.ToolConfig{
		Name:               "pass",
		InstallationMethod: "github-release",
		Binaries: []interface{}{
			config.BinaryConfig{Name: "pass"},
		},
	}
	warningsPass := sc.CheckTool(ctx, toolPass, projCfg)
	if len(warningsPass) != 0 {
		t.Errorf("expected no warnings for tool with matching current entrypoint, got: %+v", warningsPass)
	}
}

func TestShadowChecker_HelperCoverage(t *testing.T) {
	memFS := fs.NewMemFS()
	sc := NewShadowChecker(memFS, nil)

	// isSameBinary edge cases
	if sc.isSameBinary("", "/some/path") {
		t.Error("expected false for empty pathA")
	}
	if sc.isSameBinary("/some/path", "") {
		t.Error("expected false for empty pathB")
	}
	if !sc.isSameBinary("/a/b/../c", "/a/c") {
		t.Error("expected true for clean path equality")
	}

	// parseShimMetadata edge cases
	if _, _, ok := parseShimMetadata(memFS, "/non/existent"); ok {
		t.Error("expected false for non-existent shim")
	}
	_ = memFS.WriteFile("/not-a-shim", []byte("just a regular script"), 0755)
	if _, _, ok := parseShimMetadata(memFS, "/not-a-shim"); ok {
		t.Error("expected false for file missing dotfiles marker")
	}
	incompleteShim := `#!/usr/bin/env bash
# Generated by Dotfiles Management Tool
SOME_VAR="val"
`
	_ = memFS.WriteFile("/incomplete-shim", []byte(incompleteShim), 0755)
	if _, _, ok := parseShimMetadata(memFS, "/incomplete-shim"); ok {
		t.Error("expected false for shim missing TOOL_NAME/TOOL_EXECUTABLE")
	}

	// isHomebrewBin coverage
	t.Setenv("HOMEBREW_PREFIX", "/custom/brew")
	if !isHomebrewBin("/custom/brew/bin/tool") {
		t.Error("expected true for custom HOMEBREW_PREFIX")
	}
	if !isHomebrewBin("/opt/homebrew/Caskroom/app/1.0/bin/tool") {
		t.Error("expected true for Caskroom path")
	}
	if isHomebrewBin("/usr/bin/tool") {
		t.Error("expected false for /usr/bin/tool")
	}

	// toolHasShellPath edge cases
	if toolHasShellPath(nil, "/some/bin", nil) {
		t.Error("expected false for nil tool")
	}
	toolNoShell := &config.ToolConfig{Name: "no-shell"}
	if toolHasShellPath(toolNoShell, "/some/bin", nil) {
		t.Error("expected false for tool without shell configs")
	}
	toolPowershell := &config.ToolConfig{
		Name: "ps-tool",
		ShellConfigs: &config.ShellConfigs{
			Powershell: &config.ShellTypeConfig{
				Paths: []interface{}{"/opt/ps/bin"},
			},
		},
	}
	if !toolHasShellPath(toolPowershell, "/opt/ps/bin/tool", nil) {
		t.Error("expected true for powershell path")
	}
	if toolHasShellPath(toolPowershell, "/different/bin/tool", nil) {
		t.Error("expected false for mismatched path")
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
	expected := `Binary 'brew-cmd' shadows '/opt/homebrew/bin/brew-cmd'`
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
