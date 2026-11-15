package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestCleanupContinuesAfterToolFailure(t *testing.T) {
	mem := newMemFS()
	o := newTestOrchestrator(t, mem, "")
	ctx := context.Background()
	project := &config.ProjectConfig{Paths: config.PathsConfig{HomeDir: "/home/user", TargetDir: "/target", GeneratedDir: "/generated"}}
	for _, tool := range []string{"a-broken", "z-good"} {
		path := "/stale-" + tool
		if tool == "a-broken" {
			path = "{unknown}/unsafe"
		}
		if err := mem.WriteFile("/stale-"+tool, []byte("old"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			return o.reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
				ToolName: tool, FilePath: path, FileType: "copy", OperationType: "write", CreatedAt: 1,
			})
		}); err != nil {
			t.Fatal(err)
		}
	}
	tools := []*config.ToolConfig{{Name: "a-broken"}, {Name: "z-good"}}
	err := o.CleanupStaleArtifacts(ctx, tools, project)
	if err == nil || !strings.Contains(err.Error(), "{unknown}") {
		t.Fatalf("error = %v, want unsafe recorded path reported", err)
	}
	if exists, _ := mem.Exists("/stale-z-good"); exists {
		t.Error("cleanup stopped before removing the healthy tool's stale copy")
	}
}

func TestOrchestrator_CleanupOrphanedTools(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/.generated/usage", 0755)

	toolA := &config.ToolConfig{Name: "tool-a", Binaries: testutil.DeclaredBinaries("bin-a")}
	toolB := &config.ToolConfig{Name: "tool-b", Binaries: testutil.DeclaredBinaries("bin-b")}

	// First generation: tool-a and tool-b
	if err := orch.GenerateTools(ctx, []*config.ToolConfig{toolA, toolB}, projCfg); err != nil {
		t.Fatalf("initial GenerateTools failed: %v", err)
	}

	// Verify shims for both exist
	if exists, _ := fsys.Exists("/home/user/bin/bin-a"); !exists {
		t.Error("expected bin-a shim to exist")
	}
	if exists, _ := fsys.Exists("/home/user/bin/bin-b"); !exists {
		t.Error("expected bin-b shim to exist")
	}

	// Second generation: only tool-a
	if err := orch.GenerateTools(ctx, []*config.ToolConfig{toolA}, projCfg); err != nil {
		t.Fatalf("second GenerateTools failed: %v", err)
	}

	// Verify tool-b shim was cleaned up
	if exists, _ := fsys.Exists("/home/user/bin/bin-b"); exists {
		t.Error("expected bin-b shim to be removed as orphaned tool")
	}
	if exists, _ := fsys.Exists("/home/user/bin/bin-a"); !exists {
		t.Error("expected bin-a shim to remain")
	}
}

func TestCleanupUvUsesRecordedIdentityOrWarns(t *testing.T) {
	for _, tc := range []struct{ recorded, dryRun bool }{{}, {recorded: true}, {recorded: true, dryRun: true}} {
		t.Run(fmt.Sprintf("recorded=%t/dryRun=%t", tc.recorded, tc.dryRun), func(t *testing.T) {
			ctx := config.WithDryRun(context.Background(), tc.dryRun)
			orch, memFS := declFixture(t)
			runner := exec.NewMockRunner()
			instances := installer.NewRegistry()
			if err := instances.Register(installer.NewUvInstaller(runner, memFS, nil)); err != nil {
				t.Fatal(err)
			}
			orch.instRegistry = instances
			var logs bytes.Buffer
			orch.logger = logger.New(logger.Config{Writer: &logs})
			method := "uv"
			rec := &registry.ToolInstallationRecord{ToolName: "http", Version: "1", InstallPath: "/home/user/.generated/binaries/http", BinaryPaths: "[]", InstallMethod: &method}
			if tc.recorded {
				identity := `{"name":"httpie"}`
				rec.PackageIdentity = &identity
			}
			writeDecl(t, memFS, rec.InstallPath+"/current/http", "launcher")
			if err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error { return orch.reg.RecordToolInstallation(ctx, tx, rec) }); err != nil {
				t.Fatal(err)
			}
			if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
				t.Fatal(err)
			}
			if tc.dryRun {
				if len(runner.History) != 0 {
					t.Fatalf("dry run invoked native uninstall: %+v", runner.History)
				}
			} else if tc.recorded {
				if len(runner.History) != 1 || runner.History[0].Name != "uv" || strings.Join(runner.History[0].Args, " ") != "tool uninstall httpie" {
					t.Fatalf("uninstall=%+v", runner.History)
				}
			} else if len(runner.History) != 0 || !strings.Contains(logs.String(), "uv tool uninstall") {
				t.Fatalf("legacy receipt must warn without uninstall: commands=%+v logs=%s", runner.History, logs.String())
			}
			assertGone(t, memFS, rec.InstallPath)
			assertForgotten(t, orch, "http")
		})
	}
}
