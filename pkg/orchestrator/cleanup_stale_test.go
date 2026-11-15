package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestStaleCleanupErrorsPreserveReceiptsAndAllowRetry(t *testing.T) {
	for _, kind := range []string{"shim", "symlink", "copy"} {
		for _, failure := range []string{"remove", "record", "already absent"} {
			t.Run(kind+"/"+failure, func(t *testing.T) {
				o, mem := declFixture(t)
				ctx := context.Background()
				path := "/home/user/stale-" + kind
				seedStaleArtifact(t, o, mem, "obsolete", path, kind)
				fault := &artifactFailureFS{FS: mem, operation: failure, path: path, err: os.ErrPermission}
				o.fs = fault
				if failure == "record" {
					if err := o.reg.WithTx(ctx, func(tx *sql.Tx) error {
						_, err := tx.ExecContext(ctx, `CREATE TRIGGER reject_removal BEFORE INSERT ON file_operations WHEN NEW.operation_type = 'rm' BEGIN SELECT RAISE(FAIL, 'receipt unavailable'); END`)
						return err
					}); err != nil {
						t.Fatal(err)
					}
				}
				if failure == "already absent" {
					if err := mem.Remove(path); err != nil {
						t.Fatal(err)
					}
				}
				cleanup := map[string]func(context.Context, []*config.ToolConfig, *config.ProjectConfig) error{
					"shim": o.CleanupStaleShims, "symlink": o.CleanupStaleSymlinks, "copy": o.CleanupStaleCopies,
				}[kind]
				tools := []*config.ToolConfig{{Name: "obsolete"}}
				err := cleanup(ctx, tools, declProjectConfig())
				if failure == "already absent" {
					if err != nil {
						t.Fatal(err)
					}
					assertRemovalRecorded(t, o, "obsolete", path)
					return
				}
				if err == nil || !strings.Contains(err.Error(), "obsolete") {
					t.Fatalf("missing tool failure: %v", err)
				}
				if failure == "remove" && !errors.Is(err, os.ErrPermission) {
					t.Fatalf("lost cause: %v", err)
				}
				if failure == "record" && !strings.Contains(err.Error(), "receipt unavailable") {
					t.Fatalf("lost transaction error: %v", err)
				}
				states, err := o.reg.GetFileStatesForTool(ctx, "obsolete")
				if err != nil || len(states) != 1 || states[0].LastOperation == "rm" {
					t.Fatalf("failed removal was forgotten: %+v, %v", states, err)
				}
				if failure == "remove" {
					if _, err := mem.Lstat(path); err != nil {
						t.Fatalf("failed path lost: %v", err)
					}
				}
				fault.operation = ""
				if failure == "record" {
					if err := o.reg.WithTx(ctx, func(tx *sql.Tx) error { _, err := tx.ExecContext(ctx, "DROP TRIGGER reject_removal"); return err }); err != nil {
						t.Fatal(err)
					}
				}
				if err := cleanup(ctx, tools, declProjectConfig()); err != nil {
					t.Fatalf("retry: %v", err)
				}
				assertGone(t, mem, path)
				assertRemovalRecorded(t, o, "obsolete", path)
			})
		}
	}
}

func TestStaleCleanupReportsUnreadableRegistry(t *testing.T) {
	for _, kind := range []string{"shim", "symlink", "copy"} {
		t.Run(kind, func(t *testing.T) {
			o, _ := declFixture(t)
			ctx := context.Background()
			closed, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			if err := closed.Close(); err != nil {
				t.Fatal(err)
			}
			o.reg = registry.NewRegistry(closed)
			cleanup := map[string]func(context.Context, []*config.ToolConfig, *config.ProjectConfig) error{
				"shim": o.CleanupStaleShims, "symlink": o.CleanupStaleSymlinks, "copy": o.CleanupStaleCopies,
			}[kind]
			if err := cleanup(ctx, []*config.ToolConfig{{Name: "unreadable"}}, declProjectConfig()); err == nil || !strings.Contains(err.Error(), "unreadable") || !strings.Contains(err.Error(), "closed") {
				t.Fatalf("missing registry error: %v", err)
			}
		})
	}
}

func TestStaleCleanupInspectionFailureContinuesOtherTools(t *testing.T) {
	for _, kind := range []string{"shim", "symlink"} {
		t.Run(kind, func(t *testing.T) {
			o, mem := declFixture(t)
			bad, good := "/home/user/bad", "/home/user/good"
			seedStaleArtifact(t, o, mem, "bad", bad, kind)
			seedStaleArtifact(t, o, mem, "good", good, kind)
			o.fs = &artifactFailureFS{FS: mem, operation: "lstat", path: bad, err: os.ErrPermission}
			err := o.CleanupStaleArtifacts(context.Background(), []*config.ToolConfig{{Name: "bad"}, {Name: "good"}}, declProjectConfig())
			if err == nil || !strings.Contains(err.Error(), "bad") {
				t.Fatalf("missing failed tool: %v", err)
			}
			if _, err := mem.Lstat(bad); err != nil {
				t.Fatalf("uninspectable artifact lost: %v", err)
			}
			assertGone(t, mem, good)
			assertRemovalRecorded(t, o, "good", good)
			states, err := o.reg.GetFileStatesForTool(context.Background(), "bad")
			if err != nil || len(states) != 1 || states[0].LastOperation == "rm" {
				t.Fatalf("failed tool forgotten: %+v, %v", states, err)
			}
		})
	}
}

func TestCleanupStaleArtifactsAndCopies(t *testing.T) {
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

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)
	orch.SetLogger(log)

	tool := &config.ToolConfig{
		Name: "bat",
		Copies: []config.CopyConfig{
			{Source: "/src/c1", Target: "/home/test/.config/c1"},
		},
		Symlinks: []config.SymlinkConfig{
			{Source: "/src/s1", Target: "/home/test/.bin/s1"},
		},
	}

	// 1. CleanupStaleCopies
	err = orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleCopies failed: %v", err)
	}

	// 2. CleanupStaleArtifacts
	err = orch.CleanupStaleArtifacts(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleArtifacts failed: %v", err)
	}
}

func TestCleanupStaleArtifactsWithStaleFiles(t *testing.T) {
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

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// Create stale copy file and stale symlink on disk & record in DB
	_ = memFS.MkdirAll("/home/test/.config", 0755)
	_ = memFS.WriteFile("/home/test/.config/stale.conf", []byte("stale"), 0644)

	_ = memFS.MkdirAll("/home/test/.bin", 0755)
	_ = memFS.Symlink("/opt/stale/bin", "/home/test/.bin/stale_sym")

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "old-tool",
			OperationType: "copy",
			FilePath:      "/home/test/.config/stale.conf",
			FileType:      "copy",
			CreatedAt:     1000,
			OperationID:   "op-stale-copy",
		})
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "old-tool",
			OperationType: "symlink",
			FilePath:      "/home/test/.bin/stale_sym",
			FileType:      "symlink",
			CreatedAt:     1001,
			OperationID:   "op-stale-sym",
		})
	})

	activeTool := &config.ToolConfig{
		Name: "active-tool",
	}

	err = orch.CleanupStaleArtifacts(ctx, []*config.ToolConfig{activeTool}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleArtifacts failed: %v", err)
	}

	// Verify stale copy and symlink were removed from disk
	existsCopy, _ := memFS.Exists("/home/test/.config/stale.conf")
	if existsCopy {
		t.Errorf("expected stale copy file to be removed")
	}

	existsSym, _ := memFS.Exists("/home/test/.bin/stale_sym")
	if existsSym {
		t.Errorf("expected stale symlink to be removed")
	}
}

func TestCleanupStaleArtifacts_FullPipeline(t *testing.T) {
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/home/user/.generated",
			TargetDir:    "/home/user/bin",
			HomeDir:      "/home/user",
		},
	}

	err := orch.CleanupStaleArtifacts(ctx, nil, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleArtifacts failed: %v", err)
	}
}
