package orchestrator

import (
	"context"
	"io"
	"path/filepath"
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

func TestGenerateShellScripts_ZshPlugin(t *testing.T) {
	t.Parallel()
	log := logger.New(logger.Config{})
	memFS := newMemFS()
	trackedFS := fs.NewTrackedFileSystem(memFS, nil, log, "system")
	runner := exec.NewMockRunner()
	dbConn, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	defer dbConn.Close()

	reg := registry.NewRegistry(dbConn)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
			BinariesDir:     "/home/user/.generated/binaries",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:               "my-plugin",
			InstallationMethod: "zsh-plugin",
			InstallParams: map[string]interface{}{
				"repo": "user/my-plugin",
			},
		},
	}

	// Create dynamic plugin file inside sandbox
	pluginPath := "/home/user/.generated/binaries/my-plugin/current"
	_ = memFS.MkdirAll(pluginPath, 0755)
	_ = memFS.WriteFile(filepath.Join(pluginPath, "my-plugin.plugin.zsh"), []byte("echo hello"), 0644)

	err = orch.generateShellScripts(context.Background(), tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	data, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}

	scriptContent := string(data)
	expectedSource := `source /home/user/.generated/binaries/my-plugin/current/my-plugin.plugin.zsh`
	if !strings.Contains(scriptContent, expectedSource) {
		t.Errorf("expected script to contain %q, got %q", expectedSource, scriptContent)
	}
}

func TestZshPlugin_UnclonedFallbackSource(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	memFS := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, memFS, runner, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:               "uncloned-plugin",
			InstallationMethod: "zsh-plugin",
			InstallParams: map[string]interface{}{
				"repo": "user/uncloned-plugin",
			},
		},
	}

	// Do NOT create plugin file on memFS — test uncloned fallback!
	err = orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	data, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}

	scriptContent := string(data)
	expectedGuard := `if [ ! -f /home/user/.generated/binaries/uncloned-plugin/current/uncloned-plugin/uncloned-plugin.plugin.zsh ]; then`
	expectedSource := `source /home/user/.generated/binaries/uncloned-plugin/current/uncloned-plugin/uncloned-plugin.plugin.zsh`
	if !strings.Contains(scriptContent, expectedGuard) {
		t.Errorf("expected script to contain lazy install guard %q, got:\n%s", expectedGuard, scriptContent)
	}
	if !strings.Contains(scriptContent, expectedSource) {
		t.Errorf("expected script to contain fallback source %q, got:\n%s", expectedSource, scriptContent)
	}
}
