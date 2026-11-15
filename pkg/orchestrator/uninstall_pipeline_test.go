package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestOrchestrator_UninstallTool(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	mockInst := &mockInstaller{
		name:     "custom-method",
		binaries: []string{"test-bin"},
	}
	_ = instReg.Register(mockInst)

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name:               "test-tool",
		InstallationMethod: "custom-method",
		Binaries:           testutil.DeclaredBinaries("test-bin"),
	}

	// Nil project config error
	if err := orch.UninstallTool(ctx, tool, nil); err == nil {
		t.Fatal("expected error with nil project config")
	}

	// 1. Install first to populate records
	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("unexpected install error: %v", err)
	}

	// Verify shim file was created
	shimPath := "/home/user/bin/test-bin"
	exists, err := fsys.Exists(shimPath)
	if err != nil || !exists {
		t.Fatalf("expected shim file %q to be created, got exists=%v err=%v", shimPath, exists, err)
	}

	// Verify installation record exists
	instRecord, err := reg.GetToolInstallation(ctx, "test-tool")
	if err != nil || instRecord == nil {
		t.Fatalf("expected installation record to exist: %v", err)
	}

	// 2. Perform uninstall
	if err := orch.UninstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("unexpected uninstall error: %v", err)
	}

	// Verify shim file is deleted
	exists, err = fsys.Exists(shimPath)
	if err != nil || exists {
		t.Fatalf("expected shim file %q to be deleted, got exists=%v", shimPath, exists)
	}

	// Verify records are removed from db
	rec, err := reg.GetToolInstallation(ctx, "test-tool")
	if err != nil {
		t.Fatalf("unexpected error querying DB: %v", err)
	}
	if rec != nil {
		t.Fatal("expected installation record to be deleted from DB, but got non-nil")
	}

	// 3. Perform uninstall AGAIN (verifies no errors on non-existent files or records)
	if err := orch.UninstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("unexpected error on second uninstall: %v", err)
	}
}

func TestOrchestrator_UninstallTool_FailingUninstallLeavesRecordsIntact(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	uninstallErr := errors.New("package manager refused removal")
	mockInst := &mockInstaller{
		name:         "custom-method",
		binaries:     []string{"test-bin"},
		uninstallErr: uninstallErr,
	}
	_ = instReg.Register(mockInst)

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name:               "test-tool",
		InstallationMethod: "custom-method",
		Binaries:           testutil.DeclaredBinaries("test-bin"),
	}

	// 1. Install first to populate records
	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("unexpected install error: %v", err)
	}

	shimPath := "/home/user/bin/test-bin"
	exists, err := fsys.Exists(shimPath)
	if err != nil || !exists {
		t.Fatalf("expected shim file %q to be created", shimPath)
	}

	rec, err := reg.GetToolInstallation(ctx, "test-tool")
	if err != nil || rec == nil {
		t.Fatalf("expected installation record to exist: %v", err)
	}

	// 2. Perform uninstall - should fail
	err = orch.UninstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected UninstallTool to fail when installer.Uninstall fails")
	}
	if !strings.Contains(err.Error(), "package manager refused removal") {
		t.Fatalf("expected error to contain %q, got %v", "package manager refused removal", err)
	}
	if !strings.Contains(err.Error(), "uninstalling test-tool with custom-method") {
		t.Fatalf("expected error to contain tool and method name, got %v", err)
	}

	// 3. Verify records and files remain intact
	exists, err = fsys.Exists(shimPath)
	if err != nil || !exists {
		t.Fatalf("expected shim file %q to remain intact after failed uninstall", shimPath)
	}

	rec, err = reg.GetToolInstallation(ctx, "test-tool")
	if err != nil {
		t.Fatalf("unexpected error querying DB: %v", err)
	}
	if rec == nil {
		t.Fatal("expected installation record to remain in DB after failed uninstall, got nil")
	}
}

func TestOrchestrator_UninstallTool_UnknownInstallationMethodFails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name:               "unknown-tool",
		InstallationMethod: "nonexistent-method",
	}

	err = orch.UninstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected UninstallTool to fail for unknown installation method")
	}
	if !strings.Contains(err.Error(), "uninstalling unknown-tool with nonexistent-method") {
		t.Fatalf("expected error to name tool and method, got %v", err)
	}
	if !strings.Contains(err.Error(), "installer \"nonexistent-method\" not found") {
		t.Fatalf("expected error to mention installer not found, got %v", err)
	}
}

func TestOrchestrator_UninstallTool_FallbackToRecordedInstallMethod(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	uninstallErr := errors.New("package manager uninstall failed")
	mockInst := &mockInstaller{
		name:         "recorded-method",
		binaries:     []string{"rec-bin"},
		uninstallErr: uninstallErr,
	}
	_ = instReg.Register(mockInst)

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	// Install with full tool config
	tool := &config.ToolConfig{
		Name:               "rec-tool",
		InstallationMethod: "recorded-method",
		Binaries:           testutil.DeclaredBinaries("rec-bin"),
	}
	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool: %v", err)
	}

	// Call UninstallTool with empty InstallationMethod (like orphan cleanup)
	orphanTool := &config.ToolConfig{
		Name: "rec-tool",
	}
	err = orch.UninstallTool(ctx, orphanTool, projCfg)
	if err == nil {
		t.Fatal("expected UninstallTool to fail using recorded method")
	}
	if !strings.Contains(err.Error(), "package manager uninstall failed") {
		t.Fatalf("expected error %v to contain %q", err, "package manager uninstall failed")
	}

	// Verify installation record is still intact
	rec, err := reg.GetToolInstallation(ctx, "rec-tool")
	if err != nil || rec == nil {
		t.Fatalf("expected installation record to survive failed uninstall: %v", err)
	}
}

func TestOrchestrator_UninstallTool_PurgeRemovalError(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	removeErr := errors.New("disk permission denied")
	customFS := &removeErrorFS{FS: fsys, err: removeErr}
	orch := NewOrchestrator(nil, customFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	// Seed a file state in registry
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "locked-tool",
			FilePath:      "/home/user/bin/locked-shim",
			OperationType: "create",
			FileType:      "shim",
		})
	}); err != nil {
		t.Fatalf("RecordFileOperation: %v", err)
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)
	if err := fsys.WriteFile("/home/user/bin/locked-shim", []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	tool := &config.ToolConfig{Name: "locked-tool"}
	err = orch.UninstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected UninstallTool to fail on file removal error")
	}
	if !strings.Contains(err.Error(), "disk permission denied") {
		t.Fatalf("expected error to contain %q, got %v", "disk permission denied", err)
	}
}

type removeAllErrorFS struct {
	fs.FS
	err error
}

func (r *removeAllErrorFS) RemoveAll(path string) error { return r.err }

func TestOrchestrator_UninstallTool_MoreBranches(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	t.Run("nil instRegistry with installation method", func(t *testing.T) {
		orch := &Orchestrator{
			fs:     fsys,
			runner: runner,
			logger: logger.New(logger.Config{}),
		}
		err := orch.UninstallTool(ctx, &config.ToolConfig{Name: "t", InstallationMethod: "brew"}, projCfg)
		if err == nil || !strings.Contains(err.Error(), "installer registry is nil") {
			t.Fatalf("expected installer registry is nil error, got %v", err)
		}
	})

	t.Run("nil reg succeeds and deletes binaries dir", func(t *testing.T) {
		instReg := installer.NewRegistry()
		_ = instReg.Register(&mockInstaller{name: "brew"})
		orch := &Orchestrator{
			fs:           fsys,
			runner:       runner,
			logger:       logger.New(logger.Config{}),
			instRegistry: instReg,
		}
		_ = fsys.MkdirAll("/home/user/binaries/t", 0755)
		err := orch.UninstallTool(ctx, &config.ToolConfig{Name: "t", InstallationMethod: "brew"}, projCfg)
		if err != nil {
			t.Fatalf("unexpected error with nil registry: %v", err)
		}
		exists, _ := fsys.Exists("/home/user/binaries/t")
		if exists {
			t.Fatal("expected binaries dir to be removed")
		}
	})

	t.Run("an unreadable registry reports the error", func(t *testing.T) {
		sqlDB, err := db.NewConnection(ctx, ":memory:")
		if err != nil {
			t.Fatalf("db: %v", err)
		}
		reg := registry.NewRegistry(sqlDB)
		orch := NewOrchestrator(nil, fsys, runner, reg, installer.NewRegistry())
		_ = sqlDB.Close()

		err = orch.removeToolArtifacts(ctx, "t", projCfg)
		if err == nil || !strings.Contains(err.Error(), "reading the installation record of t") {
			t.Fatalf("expected reading the installation record error, got %v", err)
		}
	})

	t.Run("RemoveAll failure reports error", func(t *testing.T) {
		rmErr := errors.New("cannot remove directory")
		errFS := &removeAllErrorFS{FS: fsys, err: rmErr}
		orch := NewOrchestrator(nil, errFS, runner, nil, installer.NewRegistry())
		_ = fsys.MkdirAll("/home/user/binaries/t", 0755)

		err := orch.removeToolArtifacts(ctx, "t", projCfg)
		if err == nil || !strings.Contains(err.Error(), "cannot remove directory") {
			t.Fatalf("expected cannot remove directory error, got %v", err)
		}
	})
}

func TestUninstallRejectsInvalidPackageIdentity(t *testing.T) {
	for _, value := range []string{"{", "null", `{}`, `{"name":""}`} {
		t.Run(value, func(t *testing.T) {
			ctx := context.Background()
			orch, _ := declFixture(t)
			method := "brew"
			record := &registry.ToolInstallationRecord{ToolName: "alias", Version: "1", InstallPath: "/home/user/binaries/alias", BinaryPaths: "[]", InstallMethod: &method, PackageIdentity: &value}
			if err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error { return orch.reg.RecordToolInstallation(ctx, tx, record) }); err != nil {
				t.Fatal(err)
			}
			err := orch.UninstallTool(ctx, &config.ToolConfig{Name: "alias", InstallationMethod: "brew"}, declProjectConfig())
			if err == nil || !strings.Contains(err.Error(), "package identity") {
				t.Fatalf("error=%v", err)
			}
			rec, err := orch.reg.GetToolInstallation(ctx, "alias")
			if err != nil || rec == nil {
				t.Fatalf("record lost on unsafe identity: %+v, %v", rec, err)
			}
		})
	}
}

func TestUninstallPreservesLegacyReceiptAfterMethodChange(t *testing.T) {
	ctx := context.Background()
	orch, _ := declFixture(t)
	method := "brew"
	rec := &registry.ToolInstallationRecord{ToolName: "alias", Version: "1", InstallPath: "/home/user/binaries/alias", BinaryPaths: "[]", InstallMethod: &method}
	if err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error { return orch.reg.RecordToolInstallation(ctx, tx, rec) }); err != nil {
		t.Fatal(err)
	}
	err := orch.UninstallTool(ctx, &config.ToolConfig{Name: "alias", InstallationMethod: "npm", InstallParams: map[string]interface{}{"package": "new-package"}}, declProjectConfig())
	if err == nil || !strings.Contains(err.Error(), "no package identity") {
		t.Fatalf("error=%v", err)
	}
	if rec, err := orch.reg.GetToolInstallation(ctx, "alias"); err != nil || rec == nil {
		t.Fatalf("legacy receipt lost: %+v %v", rec, err)
	}
}
