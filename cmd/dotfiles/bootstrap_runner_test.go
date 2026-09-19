package main

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	execRunner "github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// Lifecycle hooks execute arbitrary shell through the orchestrator's command
// runner. BootstrapServices already substitutes every installer under test so
// nothing reaches a real endpoint; the runner has to be substituted for the same
// reason, or a hook such as the fixture's Homebrew bootstrap runs `curl | bash`
// for real, prompts for a password and blocks until the test times out.
func TestBootstrapServicesMocksTheRunnerUnderTest(t *testing.T) {
	absConfig := filepath.Join(findRepoRoot(), "test-project/dotfiles.config.ts")

	services, err := BootstrapServices(context.Background(), absConfig)
	if err != nil {
		t.Fatalf("BootstrapServices returned error: %v", err)
	}
	defer services.Close()

	if _, ok := services.Runner.(*execRunner.MockRunner); !ok {
		t.Fatalf("runner is %T, want *exec.MockRunner: hooks would execute real commands", services.Runner)
	}
}

// The installation the fixture describes must complete without running anything
// real, including for a tool whose before-install hook shells out.
func TestInstallFixtureRunsNoRealCommands(t *testing.T) {
	absConfig := filepath.Join(findRepoRoot(), "test-project/dotfiles.config.ts")

	services, err := BootstrapServices(context.Background(), absConfig)
	if err != nil {
		t.Fatalf("BootstrapServices returned error: %v", err)
	}
	defer services.Close()

	mock, ok := services.Runner.(*execRunner.MockRunner)
	if !ok {
		t.Fatalf("runner is %T, want *exec.MockRunner", services.Runner)
	}

	// A real (not dry-run) install of every tool the fixture declares, driven through
	// the very services this test holds so the recorded history is the one it inspects.
	ctx := config.WithDryRun(context.Background(), false)
	if err := services.Orchestrator.InstallTools(ctx, services.ToolConfigs, services.ProjectConfig); err != nil {
		t.Fatalf("InstallTools returned error: %v", err)
	}

	// The fixture has a before-install hook that shells out (brew.tool.ts runs the
	// Homebrew bootstrap). It has to have reached the runner, or this test proves
	// nothing about hooks being mocked rather than simply never running.
	var shellCommands int
	for _, cmd := range mock.History {
		if cmd.Name == "bash" {
			shellCommands++
		}
	}
	if shellCommands == 0 {
		t.Fatal("no hook shell reached the runner: the test cannot show hooks are mocked")
	}
	t.Logf("%d hook shell commands recorded instead of executed", shellCommands)
}
