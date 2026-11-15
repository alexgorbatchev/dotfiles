package orchestrator

import (
	"context"
	"fmt"
	"io"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestOrchestratorSettersAndHelpers(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})

	instReg := installer.NewRegistry()
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}
	_ = projCfg.Paths.HomeDir

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// SetLogger and SetConfigFilePath
	orch.SetLogger(log)
	orch.SetConfigFilePath("/home/test/dotfiles/dotfiles.config.ts")

	if orch.getConfigFilePath() != "/home/test/dotfiles/dotfiles.config.ts" {
		t.Errorf("getConfigFilePath mismatch: %q", orch.getConfigFilePath())
	}

	// shouldOverwrite helper
	ctxOverwrite := config.WithOverwrite(ctx, true)
	if !shouldOverwrite(ctxOverwrite) {
		t.Errorf("shouldOverwrite(ctxOverwrite) = false, want true")
	}

	ctxNoOverwrite := config.WithOverwrite(ctx, false)
	if shouldOverwrite(ctxNoOverwrite) {
		t.Errorf("shouldOverwrite(ctxNoOverwrite) = true, want false")
	}

	// getStringParam
	params := map[string]interface{}{
		"valid":   "hello",
		"invalid": 12345,
	}
	if got := getStringParam(params, "valid", "def"); got != "hello" {
		t.Errorf("getStringParam(valid) = %q, want 'hello'", got)
	}
	if got := getStringParam(params, "invalid", "def"); got != "def" {
		t.Errorf("getStringParam(invalid) = %q, want 'def'", got)
	}
	if got := getStringParam(params, "missing", "def"); got != "def" {
		t.Errorf("getStringParam(missing) = %q, want 'def'", got)
	}
	if got := getStringParam(nil, "any", "def"); got != "def" {
		t.Errorf("getStringParam(nil) = %q, want 'def'", got)
	}
}
