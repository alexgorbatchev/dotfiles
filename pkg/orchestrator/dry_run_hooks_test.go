package orchestrator

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

// Lifecycle hooks run arbitrary shell, so a dry run must not reach them: the
// fixture's Homebrew bootstrap hook is a `curl | bash` that prompts for a
// password and blocks. runHooks used to decide this from os.Args, which meant
// the skip never happened for anything driving the orchestrator in-process.
func TestRunHooksSkippedOnDryRun(t *testing.T) {
	t.Setenv("DOTFILES_DRY_RUN", "")

	writeTool := func(t *testing.T) *config.ToolConfig {
		t.Helper()
		dir := t.TempDir()
		toolPath := filepath.Join(dir, "sample.tool.ts")
		body := `
			import { defineTool } from "@alexgorbatchev/dotfiles";
			export default defineTool((install) =>
				install("manual").hook("before-install", async ({ fileSystem }) => {
					await fileSystem.writeFile("/hook-ran", "yes");
				}),
			);
		`
		if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
			t.Fatalf("writing tool file: %v", err)
		}
		return &config.ToolConfig{
			Name:           "sample",
			ConfigFilePath: toolPath,
			InstallParams:  map[string]any{"hooks": []any{vm.HookBeforeInstall}},
		}
	}

	root := t.TempDir()
	projCfg := &config.ProjectConfig{ConfigFileDir: root}
	projCfg.Paths.DotfilesDir = root
	projCfg.Paths.GeneratedDir = filepath.Join(root, ".generated")

	t.Run("hook runs on a normal run", func(t *testing.T) {
		memFS := fs.NewMemFS()
		orch := newTestOrchestrator(t, memFS, "")
		ctx := config.WithDryRun(context.Background(), false)

		if err := orch.runHooks(ctx, vm.HookBeforeInstall, writeTool(t), projCfg, vm.HookContext{}); err != nil {
			t.Fatalf("runHooks returned error: %v", err)
		}
		if exists, _ := memFS.Exists("/hook-ran"); !exists {
			t.Error("the hook did not run, so this test cannot prove the dry-run case skips it")
		}
	})

	t.Run("hook is skipped on a dry run", func(t *testing.T) {
		memFS := fs.NewMemFS()
		orch := newTestOrchestrator(t, memFS, "")
		ctx := config.WithDryRun(context.Background(), true)

		if err := orch.runHooks(ctx, vm.HookBeforeInstall, writeTool(t), projCfg, vm.HookContext{}); err != nil {
			t.Fatalf("runHooks returned error: %v", err)
		}
		if exists, _ := memFS.Exists("/hook-ran"); exists {
			t.Error("the hook ran during a dry run")
		}
	})
}
