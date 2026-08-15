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

func TestSourceFilesDirectEmission(t *testing.T) {
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(memFS, reg, log, "system").WithFileType("init")
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)

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

	err = orch.generateShellScripts(ctx, tools, projCfg)
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
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(memFS, reg, log, "system").WithFileType("init")
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)

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

	err = orch.generateShellScripts(ctx, tools, projCfg)
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
}
