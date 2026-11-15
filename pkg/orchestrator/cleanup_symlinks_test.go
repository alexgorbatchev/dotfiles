package orchestrator

import (
	"context"
	"database/sql"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestOrchestrator_CleanupStaleSymlinks(t *testing.T) {
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
	orch.SetSymlinkFS(fsys)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/src1", 0755)
	_ = fsys.MkdirAll("/home/user/src2", 0755)
	_ = fsys.MkdirAll("/home/user/.generated/usage", 0755)

	tool := &config.ToolConfig{
		Name: "sym-tool",
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/user/src1", Target: "/home/user/dest1"},
			{Source: "/home/user/src2", Target: "/home/user/dest2"},
		},
	}

	if err := orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("initial GenerateTools failed: %v", err)
	}

	if exists, _ := fsys.Exists("/home/user/dest1"); !exists {
		t.Error("expected dest1 symlink to exist")
	}
	if exists, _ := fsys.Exists("/home/user/dest2"); !exists {
		t.Error("expected dest2 symlink to exist")
	}

	// Update tool to drop dest2
	toolUpdated := &config.ToolConfig{
		Name: "sym-tool",
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/user/src1", Target: "/home/user/dest1"},
		},
	}

	if err := orch.GenerateTools(ctx, []*config.ToolConfig{toolUpdated}, projCfg); err != nil {
		t.Fatalf("second GenerateTools failed: %v", err)
	}

	if exists, _ := fsys.Exists("/home/user/dest2"); exists {
		t.Error("expected dest2 symlink to be removed as stale")
	}
	if exists, _ := fsys.Exists("/home/user/dest1"); !exists {
		t.Error("expected dest1 symlink to remain")
	}
}

func TestOrchestrator_CleanupStaleSymlinks_Guardrails(t *testing.T) {
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
	orch.SetSymlinkFS(fsys)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:        "/home/user",
			DotfilesDir:    "/home/user/.dotfiles",
			ToolConfigsDir: "/home/user/.dotfiles/tools",
			TargetDir:      "/home/user/bin",
			BinariesDir:    "/home/user/binaries",
			GeneratedDir:   "/home/user/.generated",
		},
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/.dotfiles/tools/custom", 0755)
	_ = fsys.MkdirAll("/home/user/.config", 0755)

	// File 1: Regular file in DotfilesDir recorded with FileType "symlink" and LastOperation "symlink"
	repoFile := "/home/user/.dotfiles/tools/custom/repo_file"
	writeMemFile(t, fsys, repoFile, "repo content")

	// File 2: Regular file outside DotfilesDir recorded with FileType "symlink" and LastOperation "chmod"
	outsideChmod := "/home/user/.config/chmod_file"
	writeMemFile(t, fsys, outsideChmod, "outside chmod content")

	// File 3: Regular file outside DotfilesDir recorded with FileType "symlink" and LastOperation "symlink" (not a symlink on disk)
	outsideRegular := "/home/user/.config/regular_file"
	writeMemFile(t, fsys, outsideRegular, "outside regular content")

	// File 4: Real symlink outside DotfilesDir that IS stale
	outsideStaleLink := "/home/user/.config/stale_link"
	if err := fsys.Symlink(repoFile, outsideStaleLink); err != nil {
		t.Fatalf("creating symlink: %v", err)
	}

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		// Record 1: repoFile
		if err := reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "custom",
			FilePath:      repoFile,
			FileType:      "symlink",
			OperationType: "symlink",
		}); err != nil {
			return err
		}
		// Record 2: outsideChmod with LastOperation "chmod"
		if err := reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "custom",
			FilePath:      outsideChmod,
			FileType:      "symlink",
			OperationType: "chmod",
		}); err != nil {
			return err
		}
		// Record 3: outsideRegular with LastOperation "symlink"
		if err := reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "custom",
			FilePath:      outsideRegular,
			FileType:      "symlink",
			OperationType: "symlink",
		}); err != nil {
			return err
		}
		// Record 4: outsideStaleLink with LastOperation "symlink"
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "custom",
			FilePath:      outsideStaleLink,
			FileType:      "symlink",
			OperationType: "symlink",
		})
	})
	if err != nil {
		t.Fatalf("failed recording file operations: %v", err)
	}

	tool := &config.ToolConfig{
		Name: "custom",
		// No symlinks declared -> all 4 recorded paths are undeclared
	}

	if err := orch.CleanupStaleSymlinks(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleSymlinks failed: %v", err)
	}

	// Guardrail checks:
	// 1. repoFile must still exist (inside DotfilesDir / ToolConfigsDir, plus not a symlink)
	if exists, _ := fsys.Exists(repoFile); !exists {
		t.Errorf("repoFile in DotfilesDir was deleted!")
	}
	// 2. outsideChmod must still exist (LastOperation != "symlink", plus not a symlink)
	if exists, _ := fsys.Exists(outsideChmod); !exists {
		t.Errorf("outsideChmod was deleted!")
	}
	// 3. outsideRegular must still exist (regular file, not a symlink)
	if exists, _ := fsys.Exists(outsideRegular); !exists {
		t.Errorf("outsideRegular was deleted!")
	}
	// 4. outsideStaleLink MUST be removed (real symlink outside repo and not expected)
	if exists, _ := fsys.Exists(outsideStaleLink); exists {
		t.Errorf("outsideStaleLink was NOT removed!")
	}
}
