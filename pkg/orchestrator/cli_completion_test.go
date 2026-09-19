package orchestrator

import (
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const cliCompletionTestPath = "/home/user/.generated/shell-scripts/zsh/completions/_dotfiles"

func cliCompletionProjectConfig() *config.ProjectConfig {
	return &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}
}

func TestGenerateCLICompletion_WritesAndTracksUnderSystem(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	script := []byte("#compdef dotfiles\ncompdef _dotfiles dotfiles\n")

	if err := orch.GenerateCLICompletion(ctx, cliCompletionProjectConfig(), script); err != nil {
		t.Fatalf("GenerateCLICompletion: %v", err)
	}

	got, err := memFS.ReadFile(cliCompletionTestPath)
	if err != nil {
		t.Fatalf("reading %s: %v", cliCompletionTestPath, err)
	}
	if string(got) != string(script) {
		t.Fatalf("completion file = %q, want %q", got, script)
	}

	// Tracking under "system" keeps the file out of per-tool stale cleanup, which
	// only walks the tools present in the configuration.
	states, err := orch.reg.GetFileStatesForTool(ctx, "system")
	if err != nil {
		t.Fatalf("GetFileStatesForTool(system): %v", err)
	}
	found := false
	for _, state := range states {
		if strings.HasSuffix(state.FilePath, "/zsh/completions/_dotfiles") {
			found = true
			if state.FileType != "completion" {
				t.Fatalf("file type = %q, want %q", state.FileType, "completion")
			}
		}
	}
	if !found {
		t.Fatalf("no file state for _dotfiles under system, got %d states", len(states))
	}
}

func TestGenerateCLICompletion_FallsBackToGeneratedDir(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := cliCompletionProjectConfig()
	projCfg.Paths.ShellScriptsDir = ""

	if err := orch.GenerateCLICompletion(ctx, projCfg, []byte("#compdef dotfiles\n")); err != nil {
		t.Fatalf("GenerateCLICompletion: %v", err)
	}
	if exists, err := memFS.Exists(cliCompletionTestPath); err != nil || !exists {
		t.Fatalf("expected %s under <generatedDir>/shell-scripts, exists=%v err=%v", cliCompletionTestPath, exists, err)
	}
}

func TestGenerateCLICompletion_DryRunWritesNothing(t *testing.T) {
	t.Setenv("DOTFILES_DRY_RUN", "true")
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	if err := orch.GenerateCLICompletion(ctx, cliCompletionProjectConfig(), []byte("#compdef dotfiles\n")); err != nil {
		t.Fatalf("GenerateCLICompletion in dry-run: %v", err)
	}
	if exists, _ := memFS.Exists(cliCompletionTestPath); exists {
		t.Fatalf("dry-run must not write %s", cliCompletionTestPath)
	}
}

func TestGenerateCLICompletion_NilProjectConfig(t *testing.T) {
	t.Parallel()
	orch := newTestOrchestrator(t, fs.NewMemFS(), "")
	if err := orch.GenerateCLICompletion(context.Background(), nil, []byte("x")); err == nil {
		t.Fatal("expected an error for a nil project configuration")
	}
}
