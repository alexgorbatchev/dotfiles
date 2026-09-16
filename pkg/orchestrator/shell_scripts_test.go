package orchestrator

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func newTestOrchestrator(t *testing.T, memFS fs.FS, configFilePath string) *Orchestrator {
	t.Helper()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(memFS, reg, log, "system").WithFileType("init")
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)
	orch.configFilePath = configFilePath
	return orch
}

func TestSourceFilesDirectEmission(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "test-tool",
			ConfigFilePath: "/home/user/tools/test-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					SourceFiles: []string{
						"shell.zsh",
					},
					Sources: []string{
						"echo inline-source-zsh",
					},
				},
				Bash: &config.ShellTypeConfig{
					SourceFiles: []string{
						"shell.sh",
					},
					Sources: []string{
						"echo inline-source-bash",
					},
				},
			},
		},
	}

	_ = memFS.MkdirAll("/home/user/tools", 0755)
	_ = memFS.WriteFile("/home/user/tools/shell.zsh", []byte("echo sourced-zsh"), 0644)
	_ = memFS.WriteFile("/home/user/tools/shell.sh", []byte("echo sourced-sh"), 0644)

	err := orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	// 1. Verify main.zsh
	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	zshData, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}
	zshContent := string(zshData)

	if !strings.Contains(zshContent, `[[ -f "/home/user/tools/shell.zsh" ]] && source "/home/user/tools/shell.zsh"`) {
		t.Errorf("expected main.zsh to contain direct source of shell.zsh, got:\n%s", zshContent)
	}
	if strings.Contains(zshContent, `source <(cat "/home/user/tools/shell.zsh")`) || strings.Contains(zshContent, `source <(cat /home/user/tools/shell.zsh)`) {
		t.Errorf("unexpected process substitution on shell.zsh in main.zsh")
	}
	if !strings.Contains(zshContent, "source <(__dotfiles_source_inline_test_tool_0)") {
		t.Errorf("expected main.zsh to contain process substitution for Sources block, got:\n%s", zshContent)
	}

	// 2. Verify main.bash
	mainBashPath := "/home/user/.generated/shell-scripts/main.bash"
	bashData, err := memFS.ReadFile(mainBashPath)
	if err != nil {
		t.Fatalf("failed to read main.bash: %v", err)
	}
	bashContent := string(bashData)

	if !strings.Contains(bashContent, `[[ -f "/home/user/tools/shell.sh" ]] && source "/home/user/tools/shell.sh"`) {
		t.Errorf("expected main.bash to contain direct source of shell.sh, got:\n%s", bashContent)
	}
	if strings.Contains(bashContent, `source <(cat "/home/user/tools/shell.sh")`) || strings.Contains(bashContent, `source <(cat /home/user/tools/shell.sh)`) {
		t.Errorf("unexpected process substitution on shell.sh in main.bash")
	}
	if !strings.Contains(bashContent, "source <(__dotfiles_source_inline_test_tool_0)") {
		t.Errorf("expected main.bash to contain process substitution for Sources block, got:\n%s", bashContent)
	}
}

func TestGenerateShellScripts_DeterministicOrder(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "test-tool",
			ConfigFilePath: "/home/user/tools/test-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Env: map[string]string{
						"ZEBRA": "z",
						"ALPHA": "a",
					},
					Aliases: map[string]string{
						"z_alias": "echo z",
						"a_alias": "echo a",
					},
				},
			},
		},
	}

	err := orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	zshData, _ := memFS.ReadFile("/home/user/.generated/shell-scripts/main.zsh")
	zshContent := string(zshData)

	alphaIdx := strings.Index(zshContent, "export ALPHA")
	zebraIdx := strings.Index(zshContent, "export ZEBRA")
	if alphaIdx == -1 || zebraIdx == -1 || alphaIdx > zebraIdx {
		t.Errorf("expected ALPHA before ZEBRA in main.zsh, got:\n%s", zshContent)
	}

	// Verify tool config path comment appears ONCE per tool, not once per environment variable
	toolHeaderCommentCount := strings.Count(zshContent, "# /home/user/tools/test-tool.tool.ts")
	// One in the hoisted env section, one in tool initializations
	envSectionIdx := strings.Index(zshContent, "Environment Variables")
	toolSectionIdx := strings.Index(zshContent, "Tool-Specific Initializations")
	if envSectionIdx != -1 && toolSectionIdx != -1 {
		envSectionContent := zshContent[envSectionIdx:toolSectionIdx]
		countInEnv := strings.Count(envSectionContent, "# /home/user/tools/test-tool.tool.ts")
		if countInEnv != 1 {
			t.Errorf("expected tool config comment to appear exactly once in Env section, got %d", countInEnv)
		}
	} else {
		t.Errorf("could not find Environment Variables and Tool-Specific sections, got:\n%s", zshContent)
	}
	if toolHeaderCommentCount < 2 {
		t.Errorf("expected at least 2 comment headers total in main.zsh, got %d", toolHeaderCommentCount)
	}
}

func TestGenerateShellScripts_PathModifications(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "fnm-tool",
			ConfigFilePath: "/home/user/tools/fnm.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Paths: []interface{}{
						"/home/user/.local/share/fnm/aliases/default/bin",
						map[string]interface{}{"path": "/home/user/.custom/bin"},
						"/home/user/.generated/user-bin", // Duplicate of TargetDir - should be deduplicated
					},
				},
				Bash: &config.ShellTypeConfig{
					Paths: []interface{}{
						"/home/user/.local/share/fnm/aliases/default/bin",
					},
				},
				Powershell: &config.ShellTypeConfig{
					Paths: []interface{}{
						"/home/user/.local/share/fnm/aliases/default/bin",
					},
				},
			},
		},
	}

	err := orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	// 1. Check Zsh
	zshData, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main.zsh")
	if err != nil {
		t.Fatalf("reading main.zsh: %v", err)
	}
	zshContent := string(zshData)
	if !strings.Contains(zshContent, `export PATH="/home/user/.local/share/fnm/aliases/default/bin:$PATH"`) {
		t.Errorf("expected main.zsh to export fnm path, got:\n%s", zshContent)
	}
	if !strings.Contains(zshContent, `export PATH="/home/user/.custom/bin:$PATH"`) {
		t.Errorf("expected main.zsh to export custom path from map, got:\n%s", zshContent)
	}
	// Count occurrences of TargetDir in PATH modifications
	targetOccurrences := strings.Count(zshContent, `export PATH="/home/user/.generated/user-bin:$PATH"`)
	if targetOccurrences != 1 {
		t.Errorf("expected TargetDir to appear exactly once, got %d occurrences", targetOccurrences)
	}

	// 2. Check Bash
	bashData, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main.bash")
	if err != nil {
		t.Fatalf("reading main.bash: %v", err)
	}
	bashContent := string(bashData)
	if !strings.Contains(bashContent, `export PATH="/home/user/.local/share/fnm/aliases/default/bin:$PATH"`) {
		t.Errorf("expected main.bash to export fnm path, got:\n%s", bashContent)
	}

	// 3. Check Powershell
	ps1Data, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main.ps1")
	if err != nil {
		t.Fatalf("reading main.ps1: %v", err)
	}
	ps1Content := string(ps1Data)
	if !strings.Contains(ps1Content, `$filtered = ($env:PATH -split [IO.Path]::PathSeparator | Where-Object { $_ -and $_ -ne "/home/user/.local/share/fnm/aliases/default/bin" }) -join [IO.Path]::PathSeparator`) {
		t.Errorf("expected main.ps1 to format path, got:\n%s", ps1Content)
	}
}

func TestGenerateShellScripts_PathResolutionAndNormalization(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "tool-a",
			ConfigFilePath: "/home/user/tools/tool-a/tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Paths: []interface{}{
						"~/custom-bin",
						"$HOME/.local/share/fnm/aliases/default/bin",
						"${HOME}/.cargo/bin",
						"./rel-bin",
						"   /home/user/spaced/bin/   ",
						"/home/user/spaced/bin", // Duplicate after trimming/cleaning
						"",                      // Empty string - skipped
						"   ",                   // Whitespace only - skipped
						map[string]interface{}{"path": "~/map-bin"},
						map[string]interface{}{"path": "$HOME/go/bin"},
						map[string]interface{}{"path": ""},     // Empty path key - skipped
						map[string]interface{}{},               // Missing path key - skipped
						map[string]interface{}{"other": "val"}, // Missing path key - skipped
						12345,                                  // Invalid type - skipped
						nil,                                    // Nil - skipped
						"/home/user/.generated/user-bin",       // TargetDir duplicate - skipped
					},
				},
			},
		},
	}

	err := orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	zshData, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main.zsh")
	if err != nil {
		t.Fatalf("reading main.zsh: %v", err)
	}
	zshContent := string(zshData)

	// Tilde expansion: ~/custom-bin -> /home/user/custom-bin
	if !strings.Contains(zshContent, `export PATH="/home/user/custom-bin:$PATH"`) {
		t.Errorf("expected tilde expansion for ~/custom-bin, got:\n%s", zshContent)
	}

	// $HOME expansion: $HOME/.local/share/fnm/aliases/default/bin -> /home/user/.local/share/fnm/aliases/default/bin
	if !strings.Contains(zshContent, `export PATH="/home/user/.local/share/fnm/aliases/default/bin:$PATH"`) {
		t.Errorf("expected $HOME expansion for fnm path, got:\n%s", zshContent)
	}

	// ${HOME} expansion: ${HOME}/.cargo/bin -> /home/user/.cargo/bin
	if !strings.Contains(zshContent, `export PATH="/home/user/.cargo/bin:$PATH"`) {
		t.Errorf("expected ${HOME} expansion for cargo path, got:\n%s", zshContent)
	}

	// Map path with $HOME: map[string]interface{}{"path": "$HOME/go/bin"} -> /home/user/go/bin
	if !strings.Contains(zshContent, `export PATH="/home/user/go/bin:$PATH"`) {
		t.Errorf("expected map path with $HOME to resolve to /home/user/go/bin, got:\n%s", zshContent)
	}

	// Relative path: ./rel-bin -> /home/user/tools/tool-a/rel-bin
	if !strings.Contains(zshContent, `export PATH="/home/user/tools/tool-a/rel-bin:$PATH"`) {
		t.Errorf("expected relative path resolution for ./rel-bin, got:\n%s", zshContent)
	}

	// Spaced path: '   /home/user/spaced/bin/   ' -> /home/user/spaced/bin (exactly once)
	if !strings.Contains(zshContent, `export PATH="/home/user/spaced/bin:$PATH"`) {
		t.Errorf("expected trimmed/cleaned path for spaced bin, got:\n%s", zshContent)
	}
	spacedCount := strings.Count(zshContent, `export PATH="/home/user/spaced/bin:$PATH"`)
	if spacedCount != 1 {
		t.Errorf("expected spaced path to be deduplicated to 1 occurrence, got %d", spacedCount)
	}

	// Map path with tilde: map[string]interface{}{"path": "~/map-bin"} -> /home/user/map-bin
	if !strings.Contains(zshContent, `export PATH="/home/user/map-bin:$PATH"`) {
		t.Errorf("expected map path with tilde to resolve to /home/user/map-bin, got:\n%s", zshContent)
	}

	// TargetDir appears only once
	targetCount := strings.Count(zshContent, `export PATH="/home/user/.generated/user-bin:$PATH"`)
	if targetCount != 1 {
		t.Errorf("expected TargetDir to appear exactly once, got %d", targetCount)
	}
}

func TestGenerateShellScripts_PowershellFullEmission(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "ps-tool",
			ConfigFilePath: "/home/user/tools/ps-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Powershell: &config.ShellTypeConfig{
					Env: map[string]string{
						"MY_ENV": "my_val",
					},
					Aliases: map[string]string{
						"ll": "Get-ChildItem",
					},
					Functions: map[string]string{
						"greet": "Write-Host 'Hello'",
					},
					SourceFiles: []string{
						"helpers.ps1",
					},
					Sources: []string{
						"Write-Output 'inline'",
					},
					SourceFunctions: []string{
						"greet",
					},
					Scripts: []config.ShellScript{
						{Kind: "always", Value: "Write-Host 'always'"},
						{Kind: "once", Value: "Write-Host 'once'"},
					},
				},
			},
		},
	}

	err := orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	ps1Data, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main.ps1")
	if err != nil {
		t.Fatalf("reading main.ps1: %v", err)
	}
	ps1Content := string(ps1Data)

	// Env
	if !strings.Contains(ps1Content, `$env:MY_ENV = "my_val"`) {
		t.Errorf("expected PowerShell env export, got:\n%s", ps1Content)
	}
	// Alias
	if !strings.Contains(ps1Content, `Set-Alias -Name ll -Value "Get-ChildItem"`) {
		t.Errorf("expected PowerShell alias, got:\n%s", ps1Content)
	}
	// Function
	if !strings.Contains(ps1Content, "function greet {\n  Write-Host 'Hello'\n}") {
		t.Errorf("expected PowerShell function, got:\n%s", ps1Content)
	}
	// SourceFile
	if !strings.Contains(ps1Content, `if (Test-Path "/home/user/tools/helpers.ps1") { . "/home/user/tools/helpers.ps1" }`) {
		t.Errorf("expected PowerShell SourceFile, got:\n%s", ps1Content)
	}
	// Sources
	if !strings.Contains(ps1Content, `function __dotfiles_source_inline_ps_tool_0`) ||
		!strings.Contains(ps1Content, `. (__dotfiles_source_inline_ps_tool_0)`) ||
		!strings.Contains(ps1Content, `Remove-Item Function:\__dotfiles_source_inline_ps_tool_0 -ErrorAction SilentlyContinue`) {
		t.Errorf("expected PowerShell inline source block, got:\n%s", ps1Content)
	}
	// SourceFunctions
	if !strings.Contains(ps1Content, `. (greet)`) {
		t.Errorf("expected PowerShell SourceFunction, got:\n%s", ps1Content)
	}
	// Script always
	if !strings.Contains(ps1Content, `Write-Host 'always'`) {
		t.Errorf("expected PowerShell always script, got:\n%s", ps1Content)
	}
	// Script once loop
	if !strings.Contains(ps1Content, `Get-ChildItem -Path "/home/user/.generated/shell-scripts/.once" -Filter "*.ps1"`) {
		t.Errorf("expected PowerShell once loop, got:\n%s", ps1Content)
	}

	// Verify once script content
	onceData, err := memFS.ReadFile("/home/user/.generated/shell-scripts/.once/once-001.ps1")
	if err != nil {
		t.Fatalf("reading once-001.ps1: %v", err)
	}
	onceContent := string(onceData)
	if !strings.Contains(onceContent, `Write-Host 'once'`) || !strings.Contains(onceContent, "Remove-Item $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue") {
		t.Errorf("unexpected once-001.ps1 content: %s", onceContent)
	}
}

func TestGenerateShellScripts_DisabledAndHostnameFiltering(t *testing.T) {
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "disabled-tool",
			Disabled:       true,
			ConfigFilePath: "/home/user/tools/disabled-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Env:     map[string]string{"DISABLED_ENV": "1"},
					Aliases: map[string]string{"disabled_alias": "echo disabled"},
					Paths:   []interface{}{"/home/user/disabled/bin"},
				},
			},
		},
		{
			Name:           "wrong-host-tool",
			Hostname:       "non-existent-hostname-xyz-987",
			ConfigFilePath: "/home/user/tools/wrong-host-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Env:     map[string]string{"WRONG_HOST_ENV": "1"},
					Aliases: map[string]string{"wrong_host_alias": "echo wrong_host"},
					Paths:   []interface{}{"/home/user/wrong_host/bin"},
				},
			},
		},
		{
			Name:           "active-tool",
			ConfigFilePath: "/home/user/tools/active-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Env:     map[string]string{"ACTIVE_ENV": "1"},
					Aliases: map[string]string{"active_alias": "echo active"},
					Paths:   []interface{}{"/home/user/active/bin"},
				},
			},
		},
	}

	err := orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	zshData, err := memFS.ReadFile("/home/user/.generated/shell-scripts/main.zsh")
	if err != nil {
		t.Fatalf("reading main.zsh: %v", err)
	}
	zshContent := string(zshData)

	// Active tool items must be present
	if !strings.Contains(zshContent, `export ACTIVE_ENV="1"`) {
		t.Errorf("expected ACTIVE_ENV to be present in main.zsh")
	}
	if !strings.Contains(zshContent, `alias active_alias='echo active'`) {
		t.Errorf("expected active_alias to be present in main.zsh")
	}
	if !strings.Contains(zshContent, `export PATH="/home/user/active/bin:$PATH"`) {
		t.Errorf("expected active tool path to be present in main.zsh")
	}

	// Disabled and wrong hostname tool items must NOT be present
	if strings.Contains(zshContent, "DISABLED_ENV") || strings.Contains(zshContent, "disabled_alias") || strings.Contains(zshContent, "/home/user/disabled/bin") {
		t.Errorf("unexpected presence of disabled-tool in main.zsh:\n%s", zshContent)
	}
	if strings.Contains(zshContent, "WRONG_HOST_ENV") || strings.Contains(zshContent, "wrong_host_alias") || strings.Contains(zshContent, "/home/user/wrong_host/bin") {
		t.Errorf("unexpected presence of wrong-host-tool in main.zsh:\n%s", zshContent)
	}
}

func TestGetShellTypeConfig(t *testing.T) {
	if got := getShellTypeConfig(nil, "zsh"); got != nil {
		t.Errorf("expected nil for nil tool, got %v", got)
	}
	if got := getShellTypeConfig(&config.ToolConfig{}, "zsh"); got != nil {
		t.Errorf("expected nil for nil ShellConfigs, got %v", got)
	}
	tc := &config.ToolConfig{
		ShellConfigs: &config.ShellConfigs{
			Zsh:        &config.ShellTypeConfig{},
			Bash:       &config.ShellTypeConfig{},
			Powershell: &config.ShellTypeConfig{},
		},
	}
	if got := getShellTypeConfig(tc, "zsh"); got != tc.ShellConfigs.Zsh {
		t.Errorf("expected zsh config, got %v", got)
	}
	if got := getShellTypeConfig(tc, "bash"); got != tc.ShellConfigs.Bash {
		t.Errorf("expected bash config, got %v", got)
	}
	if got := getShellTypeConfig(tc, "powershell"); got != tc.ShellConfigs.Powershell {
		t.Errorf("expected powershell config, got %v", got)
	}
	if got := getShellTypeConfig(tc, "unknown"); got != nil {
		t.Errorf("expected nil for unknown shell, got %v", got)
	}
}

func TestGenerateShellScripts_CliWrapperConfigFlag(t *testing.T) {
	ctx := context.Background()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	// 1. With configFilePath set
	memFS1 := fs.NewMemFS()
	orchWithConfig := newTestOrchestrator(t, memFS1, "/home/user/.dotfiles/dotfiles.config.ts")
	err := orchWithConfig.generateShellScripts(ctx, nil, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	zshData1, _ := memFS1.ReadFile("/home/user/.generated/shell-scripts/main.zsh")
	zshContent1 := string(zshData1)
	if !strings.Contains(zshContent1, `dotfiles() {\n  "/home/user/.generated/user-bin/dotfiles" --config "/home/user/.dotfiles/dotfiles.config.ts" "$@"\n}`) &&
		!strings.Contains(zshContent1, `"/home/user/.generated/user-bin/dotfiles" --config "/home/user/.dotfiles/dotfiles.config.ts"`) {
		t.Errorf("expected zsh wrapper to include --config flag, got:\n%s", zshContent1)
	}

	ps1Data1, _ := memFS1.ReadFile("/home/user/.generated/shell-scripts/main.ps1")
	ps1Content1 := string(ps1Data1)
	if !strings.Contains(ps1Content1, `& "/home/user/.generated/user-bin/dotfiles" --config "/home/user/.dotfiles/dotfiles.config.ts" $args`) {
		t.Errorf("expected powershell wrapper to include --config flag, got:\n%s", ps1Content1)
	}

	// 2. Without configFilePath
	memFS2 := fs.NewMemFS()
	orchWithoutConfig := newTestOrchestrator(t, memFS2, "")
	err = orchWithoutConfig.generateShellScripts(ctx, nil, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	zshData2, _ := memFS2.ReadFile("/home/user/.generated/shell-scripts/main.zsh")
	zshContent2 := string(zshData2)
	if !strings.Contains(zshContent2, `"/home/user/.generated/user-bin/dotfiles" "$@"`) {
		t.Errorf("expected zsh wrapper without --config flag, got:\n%s", zshContent2)
	}

	ps1Data2, _ := memFS2.ReadFile("/home/user/.generated/shell-scripts/main.ps1")
	ps1Content2 := string(ps1Data2)
	if !strings.Contains(ps1Content2, `& "/home/user/.generated/user-bin/dotfiles" $args`) {
		t.Errorf("expected powershell wrapper without --config flag, got:\n%s", ps1Content2)
	}
}
