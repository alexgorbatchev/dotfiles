package orchestrator

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestOrchestrator_CleanupStaleCopies(t *testing.T) {
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
	_ = fsys.WriteFile("/home/user/copy1", []byte("data"), 0644)

	// Record a copy file operation manually in registry
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		now := int64(12345678)
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "copy-tool",
			OperationType: "write",
			FilePath:      "/home/user/copy1",
			FileType:      "copy",
			CreatedAt:     now,
		})
	})

	tool := &config.ToolConfig{
		Name: "copy-tool",
	}

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies failed: %v", err)
	}

	if exists, _ := fsys.Exists("/home/user/copy1"); exists {
		t.Error("expected stale copy1 to be removed")
	}
}

func TestStaleCopiesPreserveUnreadableFilesAndReceipts(t *testing.T) {
	for _, operation := range []string{"read", "lstat"} {
		t.Run(operation, func(t *testing.T) {
			o, mem := declFixture(t)
			ctx := context.Background()
			root, path := "/home/user/copied", "/home/user/copied/obsolete"
			seedStaleArtifact(t, o, mem, "bad", path, "copy")
			writeDecl(t, mem, path, "user changes")
			seedStaleArtifact(t, o, mem, "good", "/home/user/good", "copy")
			if err := mem.MkdirAll("/home/user/source", 0755); err != nil {
				t.Fatal(err)
			}
			faultPath := path
			if operation == "lstat" {
				faultPath = root
			}
			fault := &artifactFailureFS{FS: mem, operation: operation, path: faultPath, err: os.ErrPermission}
			o.fs = fault
			tools := []*config.ToolConfig{
				{Name: "bad", Copies: []config.CopyConfig{{Source: "/home/user/source", Target: root}}},
				{Name: "good"},
			}
			if err := o.CleanupStaleArtifacts(ctx, tools, declProjectConfig()); err == nil || !strings.Contains(err.Error(), "bad") {
				t.Fatalf("missing failed tool: %v", err)
			}
			if got := readDecl(t, mem, path); got != "user changes" {
				t.Fatalf("unreadable content lost: %q", got)
			}
			states, err := o.reg.GetFileStatesForTool(ctx, "bad")
			if err != nil || len(states) != 1 || states[0].LastOperation == "rm" {
				t.Fatalf("uninspectable copy forgotten: %+v, %v", states, err)
			}
			assertGone(t, mem, "/home/user/good")
			assertRemovalRecorded(t, o, "good", "/home/user/good")
			fault.operation = ""
			if err := o.CleanupStaleArtifacts(ctx, tools, declProjectConfig()); err != nil {
				t.Fatalf("retry: %v", err)
			}
			assertGone(t, mem, path)
			if got := readDecl(t, mem, path+".bak"); got != "user changes" {
				t.Fatalf("retry lost user changes: %q", got)
			}
			assertRemovalRecorded(t, o, "bad", path)
		})
	}
}

func TestCleanupStaleCopiesErrorsAndFiltering(t *testing.T) {
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  "/home/user/dotfiles",
			GeneratedDir: "/home/user/.generated",
		},
	}

	// 1. Error on bad placeholder in copy target
	toolBadCopy := &config.ToolConfig{
		Name: "bad-copy",
		Copies: []config.CopyConfig{
			{Source: "/src", Target: "{unknown_placeholder}"},
		},
	}
	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{toolBadCopy}, projCfg); err == nil {
		t.Error("expected CleanupStaleCopies to return error on bad copy placeholder")
	}

	// 2. Error on bad placeholder in template target
	toolBadTmpl := &config.ToolConfig{
		Name: "bad-tmpl",
		Templates: []config.TemplateConfig{
			{Source: "/src", Target: "{unknown_placeholder}"},
		},
	}
	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{toolBadTmpl}, projCfg); err == nil {
		t.Error("expected CleanupStaleCopies to return error on bad template placeholder")
	}

	// 3. Disabled tool and mismatched hostname tool are skipped
	toolSkipped := &config.ToolConfig{
		Name:     "skipped-tool",
		Disabled: true,
		Copies: []config.CopyConfig{
			{Source: "/src", Target: "/home/user/dst"},
		},
	}
	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{toolSkipped}, projCfg); err != nil {
		t.Fatalf("unexpected error for disabled tool in CleanupStaleCopies: %v", err)
	}
}
