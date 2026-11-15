package orchestrator

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

func TestInstallBatchSkipsFailedDependencies(t *testing.T) {
	mem := newMemFS()
	o := newTestOrchestrator(t, mem, "")
	consumerInstaller := &mockInstaller{name: "consumer-installer"}
	if err := o.instRegistry.Register(consumerInstaller); err != nil {
		t.Fatal(err)
	}
	if err := o.instRegistry.Register(&mockInstaller{name: "healthy-installer"}); err != nil {
		t.Fatal(err)
	}
	project := &config.ProjectConfig{Paths: config.PathsConfig{HomeDir: "/home/user", GeneratedDir: "/generated", TargetDir: "/target", BinariesDir: "/binaries"}}
	tools := []*config.ToolConfig{
		{Name: "shared", InstallationMethod: "healthy-installer", Binaries: testutil.DeclaredBinaries("different-bin")},
		{Name: "provider", Binaries: testutil.DeclaredBinaries("shared"), Symlinks: []config.SymlinkConfig{{Source: "/missing", Target: "/link"}}},
		{Name: "consumer", InstallationMethod: "consumer-installer", Dependencies: []string{"shared"}},
		{Name: "unrelated", Directories: []config.DirectoryConfig{{Path: "/unrelated"}}},
	}
	err := o.InstallTools(context.Background(), tools, project)
	if err == nil || !strings.Contains(err.Error(), `dependency "provider" failed`) {
		t.Errorf("error = %v, want consumer's failed binary provider reported", err)
	}
	if consumerInstaller.installCount != 0 {
		t.Error("consumer was installed despite its dependency's failure")
	}
	if exists, _ := mem.Exists("/unrelated"); !exists {
		t.Error("independent tool was not processed")
	}
}

func TestOrchestrator_Install(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	// Initialize sqlite connection and registry
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	mockInst := &mockInstaller{
		name:     "brew",
		binaries: []string{"test-bin"},
	}
	_ = instReg.Register(mockInst)

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

	versionStr := "1.2.3"
	tool := &config.ToolConfig{
		Name:               "test-tool",
		Version:            &versionStr,
		InstallationMethod: "brew",
		Binaries:           testutil.DeclaredBinaries("test-bin"),
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/user/src", Target: "/home/user/dest"},
		},
	}

	// Make sure directories exist in memfs
	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/binaries", 0755)
	_ = fsys.MkdirAll("/home/user/src", 0755)
	_ = fsys.MkdirAll("/home/user/.generated/usage", 0755)

	// Run the installer pipeline!
	err = orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected pipeline failure: %v", err)
	}

	// Verify installer was invoked
	if mockInst.lastTool != tool {
		t.Error("expected installer to be called with correct tool config")
	}

	// Verify shim was generated on filesystem
	shimExists, err := fsys.Exists("/home/user/bin/test-bin")
	if err != nil {
		t.Fatalf("failed to check shim: %v", err)
	}
	if !shimExists {
		t.Error("expected shim script to be generated")
	}

	// Verify symlink was created in filesystem
	symExists, err := fsys.Exists("/home/user/dest")
	if err != nil {
		t.Fatalf("failed to check symlink: %v", err)
	}
	if !symExists {
		t.Error("expected symlink target to be created")
	}

	// Verify database entries
	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: "test-tool"})
	if err != nil {
		t.Fatalf("failed to get operations: %v", err)
	}
	for _, op := range ops {
		t.Logf("OP: %s at %s target %v", op.OperationType, op.FilePath, op.TargetPath)
	}
	if len(ops) < 3 {
		t.Fatalf("expected at least 3 operations (shim write, shim chmod, symlink), got %d", len(ops))
	}

	instRec, err := reg.GetToolInstallation(ctx, "test-tool")
	if err != nil {
		t.Fatalf("failed to get installation record: %v", err)
	}
	if instRec == nil {
		t.Fatal("expected tool installation record to be created, got nil")
	}
	if instRec.Version != "1.2.3" {
		t.Errorf("expected version to be '1.2.3', got %s", instRec.Version)
	}
}

func TestOrchestrator_Errors(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{}

	// Test projCfg == nil
	err := orch.InstallTool(ctx, &config.ToolConfig{Name: "test-tool"}, nil)
	if err == nil {
		t.Fatal("expected error with nil project config")
	}

	// Test missing installation method
	tool := &config.ToolConfig{Name: "test-tool", Binaries: testutil.DeclaredBinaries("test-bin")}
	err = orch.InstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected error with missing installation method")
	}

	// Test unregistered installer
	tool.InstallationMethod = "unregistered"
	err = orch.InstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected error with unregistered installer")
	}

	// Test installer returning error
	errInst := &mockInstaller{
		name: "err-method",
		err:  fmt.Errorf("installation failed"),
	}
	_ = instReg.Register(errInst)
	tool.InstallationMethod = "err-method"
	err = orch.InstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected error when installer fails")
	}

	// Test shim generation failure
	okInst := &mockInstaller{
		name:     "ok-method",
		binaries: []string{"test-bin"},
	}
	_ = instReg.Register(okInst)
	tool.InstallationMethod = "ok-method"
	// To trigger shim generation failure, set targetDir to something invalid or make fsys fail
	// Write a file at root to ensure it successfully writes (root / always exists in MemFS)
	if err := fsys.WriteFile("/target-is-a-file", []byte("file-content"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}
	badProjCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			TargetDir: "/target-is-a-file/bin", // /target-is-a-file is a file, so MkdirAll will fail!
		},
	}
	err = orch.InstallTool(ctx, tool, badProjCfg)
	if err == nil {
		t.Fatal("expected error on shim generation failure (MkdirAll on file path)")
	}
}

func TestOrchestrator_AdditionalBranches(t *testing.T) {
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
	if orch.Evaluator() != nil {
		t.Error("expected default evaluator to be nil")
	}
	dummyEval := vm.NewEvaluator(nil, nil)
	orch.SetEvaluator(dummyEval)
	if orch.Evaluator() != dummyEval {
		t.Errorf("expected evaluator %v, got %v", dummyEval, orch.Evaluator())
	}

	// Do not set symlinkFS to cover the o.symlinkFS == nil path in getSymlinkEvaluator
	eval := orch.getSymlinkEvaluator()
	if eval == nil {
		t.Error("expected default symlink evaluator to be non-nil")
	}

	projCfg := &config.ProjectConfig{}

	// 1. Disabled tool
	disabledTool := &config.ToolConfig{
		Name:               "disabled-tool",
		InstallationMethod: "custom-method",
		Disabled:           true,
	}
	err := orch.InstallTools(ctx, []*config.ToolConfig{disabledTool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 2. Mismatched hostname
	mismatchedTool := &config.ToolConfig{
		Name:               "mismatched-tool",
		InstallationMethod: "custom-method",
		Hostname:           "non-existent-hostname-123456",
	}
	err = orch.InstallTools(ctx, []*config.ToolConfig{mismatchedTool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 3. Dependency resolution error (cycle)
	cyclicToolA := &config.ToolConfig{Name: "A", Dependencies: []string{"B"}}
	cyclicToolB := &config.ToolConfig{Name: "B", Dependencies: []string{"A"}}
	err = orch.InstallTools(ctx, []*config.ToolConfig{cyclicToolA, cyclicToolB}, projCfg)
	if err == nil {
		t.Fatal("expected topological sort error for cycle")
	}

	// 4. Install tool failure (unregistered)
	unregisteredTool := &config.ToolConfig{
		Name:               "unregistered-tool",
		InstallationMethod: "missing-method",
	}
	err = orch.InstallTools(ctx, []*config.ToolConfig{unregisteredTool}, projCfg)
	if err == nil {
		t.Fatal("expected install tools to fail when installation fails")
	}
}

func TestOrchestrator_InstallSudoMismatch(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	// Register a mock installer that returns SupportsSudo() == false
	mockInst := &mockInstaller{
		name:         "npm",
		supportsSudo: false,
	}
	_ = instReg.Register(mockInst)

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name:               "unsupported-sudo-tool",
		InstallationMethod: "npm",
		Sudo:               true, // Requires sudo
	}

	err = orch.InstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected error when installing tool with sudo: true on installer that does not support sudo, but got nil")
	}

	expectedErr := `installer "npm" does not support sudo elevation`
	if !strings.Contains(err.Error(), expectedErr) {
		t.Errorf("expected error %q, got %q", expectedErr, err.Error())
	}
}

func TestInstallToolErrorBranches(t *testing.T) {
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

	// 1. Nil projCfg
	err = orch.InstallTool(ctx, &config.ToolConfig{Name: "t"}, nil)
	if err == nil || !strings.Contains(err.Error(), "project configuration is nil") {
		t.Errorf("expected project configuration is nil error, got %v", err)
	}

	// 2. Missing installation method with binaries
	tMissingMethod := &config.ToolConfig{
		Name:     "t-missing",
		Binaries: testutil.DeclaredBinaries("bin"),
	}
	err = orch.InstallTool(ctx, tMissingMethod, projCfg)
	if err == nil || !strings.Contains(err.Error(), "installation method not specified") {
		t.Errorf("expected installation method not specified error, got %v", err)
	}

	// 3. Unknown installation method
	tUnknownMethod := &config.ToolConfig{
		Name:               "t-unknown",
		InstallationMethod: "unknown-method-12345",
	}
	err = orch.InstallTool(ctx, tUnknownMethod, projCfg)
	if err == nil || !strings.Contains(err.Error(), "getting installer") {
		t.Errorf("expected getting installer error, got %v", err)
	}

	// 4. Shell-only tool without installation method and no binaries -> calls GenerateTool
	tShellOnly := &config.ToolConfig{
		Name: "t-shell",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases: map[string]string{"sh": "echo"},
			},
		},
	}
	err = orch.InstallTool(ctx, tShellOnly, projCfg)
	if err != nil {
		t.Fatalf("shell-only tool InstallTool failed: %v", err)
	}
}

func TestInstallToolsWorkflow(t *testing.T) {
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

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/manual-tool/current/mbin"},
	}
	_ = instReg.Register(mInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tool := &config.ToolConfig{
		Name:               "manual-tool",
		InstallationMethod: "manual",
		Binaries:           testutil.DeclaredBinaries("mbin"),
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("InstallTools failed: %v", err)
	}

	if mInst.installCount != 1 {
		t.Errorf("expected mock installer to be called once, got %d", mInst.installCount)
	}
}

func TestInstallToolNonExternalSuccessAndError(t *testing.T) {
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

	failingInst := &mockInstaller{
		name: "failing-method",
		err:  fmt.Errorf("installation failed"),
	}
	_ = instReg.Register(failingInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tFail := &config.ToolConfig{
		Name:               "fail-tool",
		InstallationMethod: "failing-method",
		Binaries:           testutil.DeclaredBinaries("failbin"),
	}

	err = orch.InstallTool(ctx, tFail, projCfg)
	if err == nil || !strings.Contains(err.Error(), "installation failed") {
		t.Errorf("expected installation failed error, got %v", err)
	}

	succeedInst := &mockInstaller{
		name:     "succeed-method",
		binaries: []string{"/home/test/.binaries/succ-tool/current/succbin"},
	}
	_ = instReg.Register(succeedInst)

	_ = memFS.MkdirAll("/home/test/.binaries/succ-tool", 0755)

	tSucc := &config.ToolConfig{
		Name:               "succ-tool",
		InstallationMethod: "succeed-method",
		Binaries:           testutil.DeclaredBinaries("succbin"),
	}

	err = orch.InstallTool(ctx, tSucc, projCfg)
	if err != nil {
		t.Fatalf("InstallTool non-external succeed failed: %v", err)
	}

	instRec, err := reg.GetToolInstallation(ctx, "succ-tool")
	if err != nil || instRec == nil {
		t.Fatalf("expected tool installation record in DB, got %v, err=%v", instRec, err)
	}
}

func TestInstallToolConflictingShimWarning(t *testing.T) {
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

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/conflict-tool/current/cbin"},
	}
	_ = instReg.Register(mInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	_ = memFS.MkdirAll("/home/test/.bin", 0755)
	_ = memFS.WriteFile("/home/test/.bin/cbin", []byte("not a shim file content"), 0755)

	tConflict := &config.ToolConfig{
		Name:               "conflict-tool",
		InstallationMethod: "manual",
		Binaries:           testutil.DeclaredBinaries("cbin"),
		InstallParams:      map[string]interface{}{"binaryPath": "./cbin"},
	}

	err = orch.InstallTool(ctx, tConflict, projCfg)
	if err != nil {
		t.Fatalf("InstallTool with conflicting shim failed: %v", err)
	}
}

func TestInstallTools_DisabledAndHostnameFiltering(t *testing.T) {
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			DotfilesDir:     "/home/user/dotfiles",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/binaries",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:     "disabled-tool",
			Disabled: true,
			Binaries: []interface{}{"disabled-bin"},
		},
		{
			Name:     "wrong-host-tool",
			Hostname: "non-existent-hostname-xyz-999",
			Binaries: []interface{}{"wrong-host-bin"},
		},
	}

	if err := orch.InstallTools(ctx, tools, projCfg); err != nil {
		t.Fatalf("InstallTools failed: %v", err)
	}

	// Verify neither tool generated shims
	if exists, _ := memFS.Exists("/home/user/bin/disabled-bin"); exists {
		t.Error("disabled tool should not be installed")
	}
	if exists, _ := memFS.Exists("/home/user/bin/wrong-host-bin"); exists {
		t.Error("wrong host tool should not be installed")
	}
}
