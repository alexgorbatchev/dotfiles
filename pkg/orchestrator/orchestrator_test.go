package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
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
	"github.com/alexgorbatchev/dotfiles/pkg/usagelog"
)

// mockInstaller implements installer.Installer for testing
type mockInstaller struct {
	name         string
	supportsSudo bool
	lastTool     *config.ToolConfig
	binaries     []string
	err          error
	installCount int
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.supportsSudo
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	m.installCount++
	m.lastTool = tool
	if m.err != nil {
		return nil, m.err
	}
	return &installer.InstallResult{
		Binaries: m.binaries,
	}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

func TestMatchesHostname(t *testing.T) {
	t.Parallel()
	if !matchesHostname("") {
		t.Error("expected empty hostname pattern to match")
	}

	// Test regex hostname
	if !matchesHostname("/.*/") {
		t.Error("expected wild regex pattern to match")
	}

	// Test invalid regex fallback
	if matchesHostname("/[invalid/") {
		// Should do exact match, which should be false for any realistic hostname
	}

	// Test exact and substring match using actual hostname
	current, err := os.Hostname()
	if err == nil && current != "" {
		if !matchesHostname(current) {
			t.Errorf("expected exact match for current hostname %q", current)
		}
		if len(current) > 2 {
			substr := current[:len(current)-1]
			if !matchesHostname(substr) {
				// matchesHostname returns strings.Contains(current, pattern) so pattern is substr, current should contain pattern
				t.Errorf("expected substring match for %q in %q", substr, current)
			}
		}
	}

	// Test regex succeeding but failing to match target
	if matchesHostname("/^non_matching_regex_pattern_xyz_123$/") {
		t.Error("expected regex that compiles but mismatch to return false")
	}

	// Test very short slash pattern to prevent slicing panic (DUE_DILIGENCE)
	if matchesHostname("/") {
		// should safely return false and not panic
	}
}

func TestGetBinaryNames(t *testing.T) {
	t.Parallel()
	// A bare string is not a shape .bin() records, so it names no binary; the map is
	// what a loaded configuration holds and the typed forms are what Go code builds.
	binaries := []interface{}{
		"simple-bin",
		config.BinaryConfig{Name: "struct-bin", Pattern: "pat"},
		&config.BinaryConfig{Name: "pointer-bin", Pattern: "pat"},
		map[string]interface{}{"name": "map-bin"},
	}

	names := getBinaryNames(binaries)
	if len(names) != 3 {
		t.Fatalf("expected 3 names, got %d", len(names))
	}

	expected := []string{"struct-bin", "pointer-bin", "map-bin"}
	for i, name := range names {
		if name != expected[i] {
			t.Errorf("expected %q, got %q", expected[i], name)
		}
	}
}

func TestOrchestrator_Install(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

func TestOrchestrator_Install_UnversionedToolTimestamp(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	log := logger.New(logger.Config{Writer: io.Discard})

	mockInst := &mockInstaller{
		name:     "mock-unversioned",
		binaries: []string{"unversioned-bin"},
	}

	instReg := installer.NewRegistry()
	_ = instReg.Register(mockInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			DotfilesDir:     "/home/user/dotfiles",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, fsys, runner, reg, instReg)

	versionLatest := "latest"
	tool := &config.ToolConfig{
		Name:               "signal",
		InstallationMethod: "mock-unversioned",
		Version:            &versionLatest,
		Binaries:           testutil.DeclaredBinaries("signal-bin"),
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected pipeline failure: %v", err)
	}

	instRec, err := reg.GetToolInstallation(ctx, "signal")
	if err != nil {
		t.Fatalf("failed to get installation record: %v", err)
	}
	if instRec == nil {
		t.Fatal("expected tool installation record to be created, got nil")
	}

	// The version MUST be a timestamp (YYYY-MM-DD-HH-MM-SS) and NOT "latest" or "unknown"
	matched, err := regexp.MatchString(`^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$`, instRec.Version)
	if err != nil || !matched {
		t.Fatalf("expected unversioned tool installation to be timestamped YYYY-MM-DD-HH-MM-SS, got version: %q", instRec.Version)
	}
	if instRec.Version == "latest" || instRec.Version == "unknown" {
		t.Fatalf("version cannot be 'latest' or 'unknown', got %q", instRec.Version)
	}
}

func TestOrchestrator_Generate(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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
		name:     "custom-method",
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
	standardTool := &config.ToolConfig{
		Name:               "standard-tool",
		Version:            &versionStr,
		InstallationMethod: "custom-method",
		Binaries:           testutil.DeclaredBinaries("standard-bin"),
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/user/src", Target: "/home/user/dest"},
		},
	}

	autoTool := &config.ToolConfig{
		Name:               "auto-tool",
		Version:            &versionStr,
		InstallationMethod: "custom-method",
		Binaries:           testutil.DeclaredBinaries("auto-bin"),
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}

	// Make sure directories exist in memfs
	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/binaries", 0755)
	_ = fsys.MkdirAll("/home/user/src", 0755)

	// Run the generation pipeline!
	err = orch.GenerateTools(ctx, []*config.ToolConfig{standardTool, autoTool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected generation pipeline failure: %v", err)
	}

	// Verify standard tool shim was generated on filesystem
	standardShimExists, err := fsys.Exists("/home/user/bin/standard-bin")
	if err != nil || !standardShimExists {
		t.Error("expected standard shim script to be generated")
	}

	// Verify standard symlink was created
	symExists, err := fsys.Exists("/home/user/dest")
	if err != nil || !symExists {
		t.Error("expected standard symlink target to be created")
	}

	// Verify standard tool installation record does NOT exist in the database!
	rec, err := reg.GetToolInstallation(ctx, "standard-tool")
	if err != nil {
		t.Fatalf("failed to query standard tool installation: %v", err)
	}
	if rec != nil {
		t.Error("expected standard tool installation record to not exist in the database, but it does")
	}

	// Verify auto tool shim was generated for the binary it declares. The installer
	// reports "test-bin", which auto-tool never declared with .bin(): shimming that
	// would only be undone by the next generate's stale-shim cleanup.
	autoShimExists, err := fsys.Exists("/home/user/bin/auto-bin")
	if err != nil || !autoShimExists {
		t.Error("expected auto shim script (auto-bin) to be generated")
	}
	if undeclaredShim, _ := fsys.Exists("/home/user/bin/test-bin"); undeclaredShim {
		t.Error("expected no shim for the installer-reported binary auto-tool does not declare")
	}

	// Verify auto tool installation record DOES exist in the database!
	autoRec, err := reg.GetToolInstallation(ctx, "auto-tool")
	if err != nil || autoRec == nil {
		t.Fatal("expected auto tool installation record to exist in the database, but it does not")
	}
	if autoRec.Version != "1.2.3" {
		t.Errorf("expected auto tool version to be '1.2.3', got %s", autoRec.Version)
	}

	// Now write expected binaries to filesystem so that the installation is healthy
	_ = fsys.MkdirAll("/home/user/binaries/auto-tool/current", 0755)
	_ = fsys.WriteFile("/home/user/binaries/auto-tool/current/auto-bin", []byte("bin content"), 0755)

	// Run GenerateTools a second time
	err = orch.GenerateTools(ctx, []*config.ToolConfig{standardTool, autoTool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected generation pipeline failure on second run: %v", err)
	}

	// Verify that mockInst.Install was NOT called again (installCount should remain 1)
	if mockInst.installCount != 1 {
		t.Errorf("expected mockInst.Install to only be called once, but was called %d times", mockInst.installCount)
	}
}

func TestOrchestrator_Errors(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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
	fsys := fs.NewMemFS()
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

func TestOrchestrator_UninstallTool(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

func TestOrchestrator_InstallSudoMismatch(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

func TestOrchestrator_OnceScriptSelfDeletionAndPruning(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
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
			GeneratedDir: "/home/user/.generated",
		},
	}

	stc := &config.ShellTypeConfig{
		Scripts: []config.ShellScript{
			{Kind: "once", Value: "echo 'hello once'"},
		},
	}
	tool := &config.ToolConfig{
		Name: "once-tool",
		ShellConfigs: &config.ShellConfigs{
			Zsh:        stc,
			Bash:       stc,
			Powershell: stc,
		},
	}

	_ = fsys.MkdirAll("/home/user/bin", 0755)

	// Generate shell scripts
	err = orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected failure generating tools: %v", err)
	}

	onceDir := "/home/user/.generated/shell-scripts/.once"

	// 1. Verify files exist in onceDir
	zshOncePath := filepath.Join(onceDir, "once-001.zsh")
	bashOncePath := filepath.Join(onceDir, "once-001.sh")
	ps1OncePath := filepath.Join(onceDir, "once-001.ps1")

	for _, p := range []string{zshOncePath, bashOncePath, ps1OncePath} {
		exists, err := fsys.Exists(p)
		if err != nil || !exists {
			t.Fatalf("expected once script %q to exist", p)
		}
	}

	// 2. Verify self-deletion statements inside once files
	zshBytes, _ := fsys.ReadFile(zshOncePath)
	zshContent := string(zshBytes)
	if !strings.Contains(zshContent, `rm -f "${(%):-%x}"`) {
		t.Errorf("expected zsh once script to contain self-deletion command, got:\n%s", zshContent)
	}

	bashBytes, _ := fsys.ReadFile(bashOncePath)
	bashContent := string(bashBytes)
	if !strings.Contains(bashContent, `rm -f "${BASH_SOURCE[0]}"`) {
		t.Errorf("expected bash once script to contain self-deletion command, got:\n%s", bashContent)
	}

	ps1Bytes, _ := fsys.ReadFile(ps1OncePath)
	ps1Content := string(ps1Bytes)
	if !strings.Contains(ps1Content, `Remove-Item $MyInvocation.MyCommand.Path`) {
		t.Errorf("expected ps1 once script to contain self-deletion command, got:\n%s", ps1Content)
	}

	// 3. Verify consecutive generate prunes the once directory
	// Let's write a stray file inside onceDir
	strayPath := filepath.Join(onceDir, "once-002.zsh")
	_ = fsys.WriteFile(strayPath, []byte("echo stray"), 0755)

	err = orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected failure on consecutive generate: %v", err)
	}

	exists, err := fsys.Exists(strayPath)
	if err != nil || exists {
		t.Errorf("expected stray once script to be pruned on consecutive generate, but it still exists")
	}
}

func TestOrchestratorNativeShellGeneration(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(memFS, reg, log, "system").WithFileType("init")
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:           "test-tool",
			ConfigFilePath: "/home/user/tools/test-tool.tool.ts",
			ShellConfigs: &config.ShellConfigs{
				Zsh: &config.ShellTypeConfig{
					Env: map[string]string{
						"MY_ENV": "value1",
					},
					Aliases: map[string]string{
						"my-alias": "my-cmd",
					},
					Functions: map[string]string{
						"my-func": "echo hello",
					},
					Scripts: []config.ShellScript{
						{Kind: "sourceFile", Value: "shell.zsh"},
						{Kind: "source", Value: "echo inline-source"},
						{Kind: "sourceFunction", Value: "my-func"},
					},
				},
			},
		},
	}

	// Create test source file inside sandbox
	_ = memFS.MkdirAll("/home/user/tools", 0755)
	_ = memFS.WriteFile("/home/user/tools/shell.zsh", []byte("echo sourced"), 0644)

	err = orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	data, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}

	scriptContent := string(data)
	t.Logf("Generated scriptContent:\n%s", scriptContent)

	if !strings.Contains(scriptContent, "export MY_ENV=\"value1\"") {
		t.Errorf("expected script to contain MY_ENV variable")
	}
	if !strings.Contains(scriptContent, "alias my-alias='my-cmd'") {
		t.Errorf("expected script to contain my-alias alias")
	}
	if !strings.Contains(scriptContent, "my_func() {") && !strings.Contains(scriptContent, "my-func() {") {
		t.Errorf("expected script to contain function definition")
	}
	if !strings.Contains(scriptContent, "[[ -f \"/home/user/tools/shell.zsh\" ]] && source \"/home/user/tools/shell.zsh\"") {
		t.Errorf("expected script to contain sourceFile direct emission")
	}
	if !strings.Contains(scriptContent, "echo inline-source") {
		t.Errorf("expected script to contain sources block")
	}
	if !strings.Contains(scriptContent, "source <(my-func)") {
		t.Errorf("expected script to contain source <(my-func)")
	}
}

func TestOrchestrator_GetCliCommand(t *testing.T) {
	fsys := fs.NewMemFS()
	reg := registry.NewRegistry(nil)
	orch := NewOrchestrator(nil, fsys, nil, reg, nil)

	// Case 1: DOTFILES_CLI_COMMAND is set
	t.Setenv("DOTFILES_CLI_COMMAND", "custom-cli-command")
	cmd := orch.getCliCommand()
	if cmd != "custom-cli-command" {
		t.Errorf("expected custom-cli-command, got %q", cmd)
	}

	// Case 2: DOTFILES_CLI_COMMAND is not set, but DOTFILES_E2E_TEST is true
	t.Setenv("DOTFILES_CLI_COMMAND", "")
	t.Setenv("DOTFILES_E2E_TEST", "true")
	cmd = orch.getCliCommand()
	execPath, _ := os.Executable()
	if cmd != execPath {
		t.Errorf("expected %q, got %q", execPath, cmd)
	}
}

func TestOrchestrator_FormatCliCommandForShell(t *testing.T) {
	fsys := fs.NewMemFS()
	reg := registry.NewRegistry(nil)
	orch := NewOrchestrator(nil, fsys, nil, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			TargetDir: "/home/user/.generated/bin",
		},
	}

	t.Run("multi-token go run without spaces", func(t *testing.T) {
		t.Setenv("DOTFILES_CLI_COMMAND", "go run /path/to/cmd/dotfiles")
		if got := orch.formatCliCommandForShell("zsh", projCfg); got != "go run /path/to/cmd/dotfiles" {
			t.Errorf("expected %q, got %q", "go run /path/to/cmd/dotfiles", got)
		}
		if got := orch.formatCliCommandForShell("powershell", projCfg); got != "go run /path/to/cmd/dotfiles" {
			t.Errorf("expected %q, got %q", "go run /path/to/cmd/dotfiles", got)
		}
	})

	t.Run("multi-token go run with space in package path", func(t *testing.T) {
		t.Setenv("DOTFILES_CLI_COMMAND", "go run /path with spaces/cmd/dotfiles")
		want := `go run "/path with spaces/cmd/dotfiles"`
		if got := orch.formatCliCommandForShell("zsh", projCfg); got != want {
			t.Errorf("expected %q, got %q", want, got)
		}
	})

	t.Run("windows backslashes converted for all shells", func(t *testing.T) {
		t.Setenv("DOTFILES_CLI_COMMAND", `C:\Users\bin\dotfiles`)
		if got := orch.formatCliCommandForShell("zsh", projCfg); got != "C:/Users/bin/dotfiles" {
			t.Errorf("expected forward slashes for zsh, got %q", got)
		}
		if got := orch.formatCliCommandForShell("powershell", projCfg); got != "C:/Users/bin/dotfiles" {
			t.Errorf("expected forward slashes for powershell, got %q", got)
		}
	})

	t.Run("bare dotfiles prevents recursion with command in bash and zsh", func(t *testing.T) {
		t.Setenv("DOTFILES_CLI_COMMAND", "dotfiles")
		if got := orch.formatCliCommandForShell("zsh", projCfg); got != "command dotfiles" {
			t.Errorf("expected 'command dotfiles' for zsh, got %q", got)
		}
		if got := orch.formatCliCommandForShell("bash", projCfg); got != "command dotfiles" {
			t.Errorf("expected 'command dotfiles' for bash, got %q", got)
		}
		if got := orch.formatCliCommandForShell("powershell", projCfg); got != `"/home/user/.generated/bin/dotfiles"` {
			t.Errorf("expected target bin for powershell, got %q", got)
		}
	})

	t.Run("path with spaces quoted even if not on host disk", func(t *testing.T) {
		t.Setenv("DOTFILES_CLI_COMMAND", "/virtual/dir with spaces/bin/dotfiles")
		want := `"/virtual/dir with spaces/bin/dotfiles"`
		if got := orch.formatCliCommandForShell("zsh", projCfg); got != want {
			t.Errorf("expected %q, got %q", want, got)
		}
		if got := orch.formatCliCommandForShell("powershell", projCfg); got != want {
			t.Errorf("expected %q, got %q", want, got)
		}
	})

	t.Run("existing file with spaces quoted", func(t *testing.T) {
		tmpDir := t.TempDir()
		spacedDir := filepath.Join(tmpDir, "spaced dir")
		if err := os.MkdirAll(spacedDir, 0755); err != nil {
			t.Fatal(err)
		}
		dummyBin := filepath.Join(spacedDir, "dotfiles")
		if err := os.WriteFile(dummyBin, []byte("#!/bin/sh\n"), 0755); err != nil {
			t.Fatal(err)
		}

		t.Setenv("DOTFILES_CLI_COMMAND", dummyBin)
		want := fmt.Sprintf(`"%s"`, filepath.ToSlash(dummyBin))
		if got := orch.formatCliCommandForShell("zsh", projCfg); got != want {
			t.Errorf("expected quoted path %s, got %s", want, got)
		}
	})
}

func TestGenerateShellScripts_ZshPlugin(t *testing.T) {
	t.Parallel()
	log := logger.New(logger.Config{})
	memFS := fs.NewMemFS()
	trackedFS := fs.NewTrackedFileSystem(memFS, nil, log, "system")
	runner := exec.NewMockRunner()
	dbConn, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	defer dbConn.Close()

	reg := registry.NewRegistry(dbConn)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(log, trackedFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			TargetDir:       "/home/user/.generated/user-bin",
			BinariesDir:     "/home/user/.generated/binaries",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:               "my-plugin",
			InstallationMethod: "zsh-plugin",
			InstallParams: map[string]interface{}{
				"repo": "user/my-plugin",
			},
		},
	}

	// Create dynamic plugin file inside sandbox
	pluginPath := "/home/user/.generated/binaries/my-plugin/current"
	_ = memFS.MkdirAll(pluginPath, 0755)
	_ = memFS.WriteFile(filepath.Join(pluginPath, "my-plugin.plugin.zsh"), []byte("echo hello"), 0644)

	err = orch.generateShellScripts(context.Background(), tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	data, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}

	scriptContent := string(data)
	expectedSource := `source "/home/user/.generated/binaries/my-plugin/current/my-plugin.plugin.zsh"`
	if !strings.Contains(scriptContent, expectedSource) {
		t.Errorf("expected script to contain %q, got %q", expectedSource, scriptContent)
	}
}

func TestZshPlugin_UnclonedFallbackSource(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, memFS, runner, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	tools := []*config.ToolConfig{
		{
			Name:               "uncloned-plugin",
			InstallationMethod: "zsh-plugin",
			InstallParams: map[string]interface{}{
				"repo": "user/uncloned-plugin",
			},
		},
	}

	// Do NOT create plugin file on memFS — test uncloned fallback!
	err = orch.generateShellScripts(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("failed to generate shell scripts: %v", err)
	}

	mainZshPath := "/home/user/.generated/shell-scripts/main.zsh"
	data, err := memFS.ReadFile(mainZshPath)
	if err != nil {
		t.Fatalf("failed to read main.zsh: %v", err)
	}

	scriptContent := string(data)
	expectedGuard := `if [ ! -f "/home/user/.generated/binaries/uncloned-plugin/current/uncloned-plugin/uncloned-plugin.plugin.zsh" ]; then`
	expectedSource := `source "/home/user/.generated/binaries/uncloned-plugin/current/uncloned-plugin/uncloned-plugin.plugin.zsh"`
	if !strings.Contains(scriptContent, expectedGuard) {
		t.Errorf("expected script to contain lazy install guard %q, got:\n%s", expectedGuard, scriptContent)
	}
	if !strings.Contains(scriptContent, expectedSource) {
		t.Errorf("expected script to contain fallback source %q, got:\n%s", expectedSource, scriptContent)
	}
}

func TestUnindentString(t *testing.T) {
	t.Parallel()
	input := `
          # Initialize Hermit shell hooks
          eval "$(test -x $HERMIT_ROOT_BIN && $HERMIT_ROOT_BIN shell-hooks --print --zsh)"
        `
	got := unindentString(input)
	expected := "# Initialize Hermit shell hooks\neval \"$(test -x $HERMIT_ROOT_BIN && $HERMIT_ROOT_BIN shell-hooks --print --zsh)\""
	if got != expected {
		t.Errorf("unindentString() =\n%q\nwant:\n%q", got, expected)
	}
}

func TestFormatFunctionBody(t *testing.T) {
	t.Parallel()
	input := `
            if (( CURRENT == 2 )) && [[ "${words[CURRENT]}" != -* ]]; then
              local -a recipes
              recipes=(
                ${(f)"$(command just --summary 2>/dev/null | tr ' ' '
')"}
              )
            fi
          `
	got := formatFunctionBody(input)
	expected := "  if (( CURRENT == 2 )) && [[ \"${words[CURRENT]}\" != -* ]]; then\n    local -a recipes\n    recipes=(\n      ${(f)\"$(command just --summary 2>/dev/null | tr ' ' '\n  ')\"}\n    )\n  fi"
	if got != expected {
		t.Errorf("formatFunctionBody() =\n%q\nwant:\n%q", got, expected)
	}
}

func TestOrchestrator_CleanupOrphanedTools(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

func TestOrchestrator_CleanupStaleShims(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

	tool := &config.ToolConfig{
		Name:     "my-tool",
		Binaries: testutil.DeclaredBinaries("bin1", "bin2"),
	}

	if err := orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("initial GenerateTools failed: %v", err)
	}

	if exists, _ := fsys.Exists("/home/user/bin/bin1"); !exists {
		t.Error("expected bin1 shim to exist")
	}
	if exists, _ := fsys.Exists("/home/user/bin/bin2"); !exists {
		t.Error("expected bin2 shim to exist")
	}

	// Remove bin2 from tool config
	toolUpdated := &config.ToolConfig{
		Name:     "my-tool",
		Binaries: testutil.DeclaredBinaries("bin1"),
	}

	if err := orch.GenerateTools(ctx, []*config.ToolConfig{toolUpdated}, projCfg); err != nil {
		t.Fatalf("second GenerateTools failed: %v", err)
	}

	if exists, _ := fsys.Exists("/home/user/bin/bin2"); exists {
		t.Error("expected bin2 shim to be removed as stale")
	}
	if exists, _ := fsys.Exists("/home/user/bin/bin1"); !exists {
		t.Error("expected bin1 shim to remain")
	}
}

func TestOrchestrator_CleanupStaleSymlinks(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

func TestOrchestrator_CleanupStaleCopies(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
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

func TestGenerateCompletionsForTool_SkipMissingSource(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, fsys, runner, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	tool := &config.ToolConfig{
		Name:               "cargo--eza",
		Binaries:           testutil.DeclaredBinaries("eza"),
		ConfigFilePath:     "/home/user/tools/eza.tool.ts",
		InstallationMethod: "cargo",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: "/home/user/.generated/binaries/cargo--eza/current/completions/zsh/_eza",
			},
		},
	}

	// When source file does NOT exist, GenerateCompletionsForTool must skip creating a broken symlink
	err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed: %v", err)
	}

	compPath := "/home/user/.generated/shell-scripts/zsh/completions/_eza"
	exists, _ := fsys.Exists(compPath)
	if exists {
		t.Errorf("Expected completion symlink NOT to exist when source file is missing")
	}

	// Now create source file and re-run: symlink should be created
	_ = fsys.MkdirAll("/home/user/.generated/binaries/cargo--eza/current/completions/zsh", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/cargo--eza/current/completions/zsh/_eza", []byte("# completion"), 0644)

	err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed on second run: %v", err)
	}

	exists, _ = fsys.Exists(compPath)
	if !exists {
		t.Errorf("Expected completion symlink to exist after source file was created")
	}
}

func TestGenerateCompletionsForTool_CmdCompletion(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()
	runner.Register("mytool", []byte("# mytool zsh completion"), nil)
	runner.Register("/home/user/.generated/binaries/mytool/current/mytool", []byte("# mytool zsh completion"), nil)
	runner.Register("slowtool", nil, fmt.Errorf("context deadline exceeded"))
	runner.Register("/home/user/.generated/binaries/slowtool/current/slowtool", nil, fmt.Errorf("context deadline exceeded"))

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, fsys, runner, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	// 1. Tool with successful completion command
	_ = fsys.MkdirAll("/home/user/.generated/binaries/mytool/current", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/mytool/current/mytool", []byte("dummy bin"), 0755)
	_ = fsys.MkdirAll("/home/user/.generated/binaries/slowtool/current", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/slowtool/current/slowtool", []byte("dummy bin"), 0755)

	toolSuccess := &config.ToolConfig{
		Name:               "mytool",
		Binaries:           testutil.DeclaredBinaries("mytool"),
		ConfigFilePath:     "/home/user/tools/mytool.tool.ts",
		InstallationMethod: "github-release",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "mytool completion zsh",
				},
			},
		},
	}

	err = orch.GenerateCompletionsForTool(ctx, toolSuccess, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed on success tool: %v", err)
	}

	compPath := "/home/user/.generated/shell-scripts/zsh/completions/_mytool"
	content, err := fsys.ReadFile(compPath)
	if err != nil {
		t.Fatalf("expected completion file to exist: %v", err)
	}
	if string(content) != "# mytool zsh completion" {
		t.Errorf("expected completion content '# mytool zsh completion', got %q", string(content))
	}

	// 2. Tool with failing/timing-out completion command (should recover gracefully)
	toolSlow := &config.ToolConfig{
		Name:               "slowtool",
		Binaries:           testutil.DeclaredBinaries("slowtool"),
		ConfigFilePath:     "/home/user/tools/slowtool.tool.ts",
		InstallationMethod: "github-release",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "slowtool completion zsh",
				},
			},
		},
	}

	err = orch.GenerateCompletionsForTool(ctx, toolSlow, projCfg)
	if err != nil {
		t.Fatalf("expected GenerateCompletionsForTool to recover gracefully from timeout, got error: %v", err)
	}
}

// A completion command that exceeds completionCommandTimeout must be reported as a
// timeout rather than as a generic failure, because the two call for different fixes:
// a timeout means the binary was too slow to respond, not that the command is wrong.
func TestGenerateCompletionsForTool_CmdTimeoutIsReportedAsTimeout(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()
	runner.Register("/home/user/.generated/binaries/stalledtool/current/stalledtool", nil, context.DeadlineExceeded)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()

	orch := NewOrchestrator(log, fsys, runner, registry.NewRegistry(sqlDB), nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	_ = fsys.MkdirAll("/home/user/.generated/binaries/stalledtool/current", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/stalledtool/current/stalledtool", []byte("dummy bin"), 0755)

	tool := &config.ToolConfig{
		Name:               "stalledtool",
		Binaries:           testutil.DeclaredBinaries("stalledtool"),
		ConfigFilePath:     "/home/user/tools/stalledtool.tool.ts",
		InstallationMethod: "github-release",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "stalledtool completion zsh",
				},
			},
		},
	}

	if err := orch.GenerateCompletionsForTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("expected a completion timeout to be non-fatal, got error: %v", err)
	}

	if logged := logBuf.String(); !strings.Contains(logged, "timed out after") {
		t.Errorf("expected a timeout to be reported as such, got log: %s", logged)
	}
	if exists, _ := fsys.Exists("/home/user/.generated/shell-scripts/zsh/completions/_stalledtool"); exists {
		t.Error("expected no completion file to be written when the command times out")
	}
}

// A manual tool that declares .bin() but has neither a binaryPath nor a before-install
// hook gets no shim, as in v1: nothing could ever put a binary where the shim would
// point, so the command is expected to come from shell functions and the author is
// told so. Generation and the stale-shim cleanup derive the expected set from the
// same rule, so a second generate has nothing to remove and nothing to regenerate,
// and an installer result cannot smuggle a shim in either.
func TestManualToolWithoutBinaryPath_NoShimAndWarning(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	if err := instReg.Register(&mockInstaller{name: "manual", binaries: []string{"/home/user/.generated/binaries/tmux-sessionx/current/tmux-sessionx"}}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}

	orch := NewOrchestrator(log, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	toolManual := &config.ToolConfig{
		Name:               "tmux-sessionx",
		Binaries:           testutil.DeclaredBinaries("tmux-sessionx"),
		ConfigFilePath:     "/home/user/tools/tmux-sessionx.tool.ts",
		InstallationMethod: "manual",
	}
	const shimPath = "/home/user/bin/tmux-sessionx"

	for run := 1; run <= 2; run++ {
		if err := orch.GenerateTools(ctx, []*config.ToolConfig{toolManual}, projCfg); err != nil {
			t.Fatalf("GenerateTools run %d: %v", run, err)
		}
		if exists, _ := fsys.Exists(shimPath); exists {
			t.Fatalf("run %d generated a shim for a manual tool without binaryPath", run)
		}
	}
	if err := orch.InstallTool(ctx, toolManual, projCfg); err != nil {
		t.Fatalf("InstallTool: %v", err)
	}
	if exists, _ := fsys.Exists(shimPath); exists {
		t.Errorf("install generated a shim for a manual tool without binaryPath")
	}

	logs := logBuf.String()
	if !strings.Contains(logs, "Skipping shim generation") {
		t.Errorf("expected a warning that .bin() produced no shim, got:\n%s", logs)
	}
	if strings.Contains(logs, "Removing stale shim") {
		t.Errorf("generation and cleanup disagree: a shim was removed as stale:\n%s", logs)
	}
}

// shimBinaries is the one place that decides which binaries a tool gets shims for,
// shared by generation and the stale cleanup.
func TestShimBinaries(t *testing.T) {
	t.Parallel()
	bins := testutil.DeclaredBinaries("foo", "bar")
	tests := []struct {
		name string
		tool *config.ToolConfig
		want string
	}{
		{
			name: "manual without binaryPath",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins},
		},
		{
			name: "manual with only an after-install hook",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins, InstallParams: map[string]interface{}{"hooks": []any{"after-install"}}},
		},
		{
			name: "manual with binaryPath",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins, InstallParams: map[string]interface{}{"binaryPath": "./foo"}},
			want: "foo,bar",
		},
		{
			name: "manual staged by a before-install hook",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins, InstallParams: map[string]interface{}{"hooks": []any{"before-install"}}},
			want: "foo,bar",
		},
		{
			name: "github release",
			tool: &config.ToolConfig{InstallationMethod: "github", Binaries: bins},
			want: "foo,bar",
		},
		{
			name: "no installation method",
			tool: &config.ToolConfig{Binaries: bins},
			want: "foo,bar",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := strings.Join(shimBinaries(tt.tool), ","); got != tt.want {
				t.Errorf("shimBinaries() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestManualToolWithTildeBinaryPath_GenerateToolAndInstall(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	rfs := fs.NewResolvedFS(fs.NewMemFS(), "/home/user")
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	instReg := installer.NewRegistry()
	manualInst := installer.NewManualInstaller(rfs, nil)
	manualInst.BinDir = "/home/user/.generated/binaries/claude-code/current"
	instReg.Register(manualInst)

	orch := NewOrchestrator(log, rfs, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	_ = rfs.MkdirAll("/home/user/.local/bin", 0755)
	_ = rfs.WriteFile("/home/user/.local/bin/claude", []byte("#!/bin/sh\necho claude"), 0755)

	toolClaude := &config.ToolConfig{
		Name:               "claude-code",
		Binaries:           testutil.DeclaredBinaries("claude"),
		ConfigFilePath:     "/home/user/dotfiles/tools/claude.tool.ts",
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"binaryPath": "~/.local/bin/claude",
			"symlink":    true,
		},
	}

	err = orch.GenerateTool(ctx, toolClaude, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool failed: %v", err)
	}

	shimContent, err := rfs.ReadFile("/home/user/bin/claude")
	if err != nil {
		t.Fatalf("expected shim to exist: %v", err)
	}

	// TOOL_EXECUTABLE in shim should NOT contain /current/~/.local/bin/claude
	if strings.Contains(string(shimContent), "/current/~/.local/bin/claude") {
		t.Errorf("shim contains unexpanded tilde path: %s", string(shimContent))
	}
	if !strings.Contains(string(shimContent), "TOOL_EXECUTABLE=\"/home/user/.local/bin/claude\"") {
		t.Errorf("expected TOOL_EXECUTABLE to be /home/user/.local/bin/claude, got: %s", string(shimContent))
	}

	// Now run InstallTool
	err = orch.InstallTool(ctx, toolClaude, projCfg)
	if err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	// Verify symlink was created under binariesDir
	destLink := "/home/user/.generated/binaries/claude-code/current/claude"
	linkTarget, err := rfs.Readlink(destLink)
	if err != nil {
		t.Fatalf("expected binary symlink at %s: %v", destLink, err)
	}
	if linkTarget != "/home/user/.local/bin/claude" {
		t.Errorf("expected symlink target /home/user/.local/bin/claude, got %s", linkTarget)
	}
}

// bootstrapTestBinName is deliberately unique: MemFS.Exists falls back to the
// host filesystem, so a common name such as "htop" could be satisfied by a real
// PATH entry on the machine running the tests and make the outcome host-dependent.
const bootstrapTestBinName = "dotfiles-bootstrap-shim-bin-7c3e"

func TestGenerateTool_ExternalToolBootstrapShimTargetsCurrentEntrypoint(t *testing.T) {
	t.Parallel()
	methods := []string{"brew", "apt", "dnf", "pacman", "npm", "pkg", "dmg"}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles.config.ts")

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/bin",
					BinariesDir:  "/home/user/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}
			tool := &config.ToolConfig{
				Name:               method + "--" + bootstrapTestBinName,
				InstallationMethod: method,
				Binaries:           testutil.DeclaredBinaries(bootstrapTestBinName),
			}

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("GenerateTool failed: %v", err)
			}

			shimBytes, err := memFS.ReadFile(filepath.Join("/home/user/bin", bootstrapTestBinName))
			if err != nil {
				t.Fatalf("expected bootstrap shim to exist: %v", err)
			}
			shim := string(shimBytes)

			// v1 pointed every shim at the dotfiles-managed entrypoint; the install
			// pipeline materialises it as a symlink to the real binary on success.
			wantExecutable := fmt.Sprintf("TOOL_EXECUTABLE=%q", filepath.Join("/home/user/binaries", tool.Name, "current", bootstrapTestBinName))
			if !strings.Contains(shim, wantExecutable) {
				t.Errorf("bootstrap shim must target the current entrypoint, want %s in:\n%s", wantExecutable, shim)
			}
			if strings.Contains(shim, "/usr/bin/"+bootstrapTestBinName) {
				t.Errorf("bootstrap shim must never guess a system path:\n%s", shim)
			}
		})
	}
}

func TestInstallTool_ExternalToolShimTarget(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		// binaryExists controls whether the path the installer reports is present
		// on disk, as it is after a real install, or missing, as when an installer
		// could only guess where the package manager put the binary.
		binaryExists bool
	}{
		{name: "installer reports a real binary", binaryExists: true},
		{name: "installer reports a missing binary", binaryExists: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewMemFS()
			runner := exec.NewMockRunner()
			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})

			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("failed to open sqlite DB: %v", err)
			}
			defer sqlDB.Close()
			reg := registry.NewRegistry(sqlDB)
			instReg := installer.NewRegistry()

			reportedBinary := filepath.Join("/home/user/external-prefix/bin", bootstrapTestBinName)
			if tt.binaryExists {
				_ = memFS.MkdirAll(filepath.Dir(reportedBinary), 0755)
				_ = memFS.WriteFile(reportedBinary, []byte("binary-content"), 0755)
			}
			_ = instReg.Register(&mockInstaller{name: "brew", binaries: []string{reportedBinary}})

			orch := NewOrchestrator(log, memFS, runner, reg, instReg)
			orch.SetSymlinkFS(memFS)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/bin",
					BinariesDir:  "/home/user/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}
			tool := &config.ToolConfig{
				Name:               "brew--" + bootstrapTestBinName,
				InstallationMethod: "brew",
				Binaries:           testutil.DeclaredBinaries(bootstrapTestBinName),
			}

			if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("InstallTool failed: %v", err)
			}

			shimBytes, err := memFS.ReadFile(filepath.Join("/home/user/bin", bootstrapTestBinName))
			if err != nil {
				t.Fatalf("expected shim to exist: %v", err)
			}
			shim := string(shimBytes)

			toolDir := filepath.Join("/home/user/binaries", tool.Name)
			currentEntrypoint := filepath.Join(toolDir, "current", bootstrapTestBinName)

			wantExecutable := fmt.Sprintf("TOOL_EXECUTABLE=%q", currentEntrypoint)
			if tt.binaryExists {
				wantExecutable = fmt.Sprintf("TOOL_EXECUTABLE=%q", reportedBinary)
			}
			if !strings.Contains(shim, wantExecutable) {
				t.Errorf("want %s in shim:\n%s", wantExecutable, shim)
			}
			if strings.Contains(shim, "/usr/bin/"+bootstrapTestBinName) {
				t.Errorf("shim must never guess a system path:\n%s", shim)
			}

			// The bootstrap shim re-checks its baked-in current entrypoint after a
			// successful install, so the install pipeline must have linked that
			// entrypoint to the binary the installer reported.
			currentTarget, err := memFS.Readlink(filepath.Join(toolDir, "current"))
			if err != nil {
				t.Fatalf("expected current symlink for external tool: %v", err)
			}
			if currentTarget != "external" {
				t.Errorf("expected current -> external, got %q", currentTarget)
			}
			entrypointTarget, err := memFS.Readlink(filepath.Join(toolDir, "external", bootstrapTestBinName))
			if err != nil {
				t.Fatalf("expected external entrypoint symlink: %v", err)
			}
			if entrypointTarget != reportedBinary {
				t.Errorf("expected entrypoint -> %s, got %q", reportedBinary, entrypointTarget)
			}
		})
	}
}

// writeHookedManualTool puts a manual .tool.ts on disk whose before-install hook runs
// the given body and whose after-install hook records where the tool ended up. The
// file has to be on the real disk because hooks are re-evaluated from it.
func writeHookedManualTool(t *testing.T, toolName, beforeInstallBody string) *config.ToolConfig {
	t.Helper()
	toolPath := filepath.Join(t.TempDir(), toolName+".tool.ts")
	body := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual")
				.hook("before-install", async ({ stagingDir, fileSystem, log }) => {
					` + beforeInstallBody + `
				})
				.hook("after-install", async ({ installedDir, fileSystem }) => {
					await fileSystem.mkdir("/home/user/markers");
					await fileSystem.writeFile("/home/user/markers/after-install", installedDir);
				}),
		);
	`
	if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}
	return &config.ToolConfig{
		Name:               toolName,
		ConfigFilePath:     toolPath,
		InstallationMethod: "manual",
		InstallParams:      map[string]interface{}{"hooks": []any{"before-install", "after-install"}},
	}
}

// A manual tool without binaryPath has nothing but its before-install hook to put
// files into stagingDir. When the hook does so the staged files are promoted and
// after-install runs; when it leaves the directory empty the install fails outright
// instead of promoting an empty directory, and after-install never runs.
func TestInstallTool_BeforeInstallHookStagesThePayload(t *testing.T) {
	t.Parallel()
	const toolName = "tmux-plugin"
	stagingDir := "/home/user/.generated/binaries/" + toolName + "/.staging"
	currentDir := "/home/user/.generated/binaries/" + toolName + "/current"
	afterInstallMarker := "/home/user/markers/after-install"

	tests := []struct {
		name              string
		beforeInstallBody string
		wantErrContains   string
	}{
		{
			name:              "hook stages files into stagingDir",
			beforeInstallBody: `await fileSystem.writeFile(stagingDir + "/plugin.tmux", "payload");`,
		},
		{
			name:              "hook leaves stagingDir empty",
			beforeInstallBody: `log.info("staging nothing");`,
			wantErrContains:   "staging directory " + stagingDir + " is empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewMemFS()
			runner := exec.NewMockRunner()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("failed creating DB: %v", err)
			}
			defer sqlDB.Close()
			reg := registry.NewRegistry(sqlDB)

			instReg := installer.NewRegistry()
			_ = instReg.Register(installer.NewManualInstaller(memFS, nil))
			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
			orch := NewOrchestrator(log, memFS, runner, reg, instReg)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:         "/home/user",
					DotfilesDir:     "/home/user/dotfiles",
					TargetDir:       "/home/user/bin",
					BinariesDir:     "/home/user/.generated/binaries",
					ShellScriptsDir: "/home/user/.generated/shell-scripts",
					GeneratedDir:    "/home/user/.generated",
				},
			}
			tool := writeHookedManualTool(t, toolName, tt.beforeInstallBody)

			err = orch.InstallTool(ctx, tool, projCfg)

			if stagingExists, _ := memFS.Exists(stagingDir); stagingExists {
				t.Errorf("staging directory %s was left behind", stagingDir)
			}
			markerExists, _ := memFS.Exists(afterInstallMarker)
			currentExists, _ := memFS.Exists(currentDir)
			record, recordErr := reg.GetToolInstallation(ctx, toolName)
			if recordErr != nil {
				t.Fatalf("reading installation record: %v", recordErr)
			}

			if tt.wantErrContains != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErrContains) {
					t.Fatalf("InstallTool error = %v, want it to contain %q", err, tt.wantErrContains)
				}
				if currentExists {
					t.Errorf("%s exists: an empty staging directory must not be promoted", currentDir)
				}
				if markerExists {
					t.Errorf("after-install ran for an install that failed")
				}
				if record != nil {
					t.Errorf("a failed install was recorded as installed: %+v", record)
				}
				return
			}

			if err != nil {
				t.Fatalf("InstallTool failed: %v", err)
			}
			payload, readErr := memFS.ReadFile(currentDir + "/plugin.tmux")
			if readErr != nil {
				t.Fatalf("staged file was not promoted to %s: %v", currentDir, readErr)
			}
			if string(payload) != "payload" {
				t.Errorf("promoted file contents = %q, want %q", string(payload), "payload")
			}
			marker, readErr := memFS.ReadFile(afterInstallMarker)
			if readErr != nil {
				t.Fatalf("after-install did not run: %v", readErr)
			}
			if string(marker) != currentDir {
				t.Errorf("after-install installedDir = %q, want %q", string(marker), currentDir)
			}
			if record == nil {
				t.Errorf("successful install was not recorded")
			}
		})
	}
}

const (
	copyToolDir    = "/home/user/tools/copy-tool"
	copyToolTarget = "/home/user/.config/copy-tool/config.toml"
)

// writeMemFile writes content at path, creating the parent directories MemFS insists on.
func writeMemFile(t *testing.T, memFS fs.FS, path, content string) {
	t.Helper()
	if err := memFS.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("creating %s: %v", filepath.Dir(path), err)
	}
	if err := memFS.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
}

func newCopyTool(copies ...config.CopyConfig) *config.ToolConfig {
	return &config.ToolConfig{
		Name:           "copy-tool",
		ConfigFilePath: copyToolDir + "/copy-tool.tool.ts",
		Copies:         copies,
	}
}

func copyProjectConfig() *config.ProjectConfig {
	return &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/.generated/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
}

// recordedCopy returns the live registry state of path as a "copy" of toolName, or nil.
func recordedCopy(t *testing.T, orch *Orchestrator, toolName, path string) *registry.FileState {
	t.Helper()
	states, err := orch.reg.GetFileStatesForTool(context.Background(), toolName)
	if err != nil {
		t.Fatalf("reading file states: %v", err)
	}
	for i := range states {
		if states[i].FilePath == path && states[i].FileType == "copy" && states[i].LastOperation != "rm" {
			return states[i]
		}
	}
	return nil
}

// .copy(src, dst) places the source at the target on generate, as v1 did. A target
// that already holds something else is moved aside to a backup, an older backup being
// kept rather than replaced, and a target that already matches the source is left
// untouched so a repeated generate makes no new backup at all.
func TestGenerateTool_AppliesCopies(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		existing   map[string]string
		wantBackup string
		// wantSecond is the numbered backup made when the plain name was taken.
		wantSecond string
	}{
		{name: "target absent"},
		{
			name:       "target holds a foreign file",
			existing:   map[string]string{copyToolTarget: "user"},
			wantBackup: "user",
		},
		{
			name:       "a previous backup is kept and the new one goes beside it",
			existing:   map[string]string{copyToolTarget: "user", copyToolTarget + ".bak": "older"},
			wantBackup: "older",
			wantSecond: "user",
		},
		{
			name:       "an identical target is left alone",
			existing:   map[string]string{copyToolTarget: "managed", copyToolTarget + ".bak": "older"},
			wantBackup: "older",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed")
			for path, content := range tt.existing {
				writeMemFile(t, memFS, path, content)
			}

			tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
			if err := orch.GenerateTool(ctx, tool, copyProjectConfig()); err != nil {
				t.Fatalf("GenerateTool: %v", err)
			}

			got, err := memFS.ReadFile(copyToolTarget)
			if err != nil {
				t.Fatalf("copy target was not written: %v", err)
			}
			if string(got) != "managed" {
				t.Errorf("copy target = %q, want %q", string(got), "managed")
			}

			backup, err := memFS.ReadFile(copyToolTarget + ".bak")
			switch {
			case tt.wantBackup == "" && err == nil:
				t.Errorf("unexpected backup %q", string(backup))
			case tt.wantBackup != "" && err != nil:
				t.Errorf("expected backup %q: %v", tt.wantBackup, err)
			case tt.wantBackup != "" && string(backup) != tt.wantBackup:
				t.Errorf("backup = %q, want %q", string(backup), tt.wantBackup)
			}

			second, secondErr := memFS.ReadFile(copyToolTarget + ".bak.2")
			switch {
			case tt.wantSecond == "" && secondErr == nil:
				t.Errorf("unexpected second backup %q", string(second))
			case tt.wantSecond != "" && secondErr != nil:
				t.Errorf("expected second backup %q: %v", tt.wantSecond, secondErr)
			case tt.wantSecond != "" && string(second) != tt.wantSecond:
				t.Errorf("second backup = %q, want %q", string(second), tt.wantSecond)
			}

			if recordedCopy(t, orch, "copy-tool", copyToolTarget) == nil {
				t.Errorf("target %s was not recorded as a copy of copy-tool", copyToolTarget)
			}
		})
	}
}

// A directory source is copied as a tree. Its members sit inside the declared target,
// so the stale-copy cleanup keeps them while the declaration stands and removes them
// once it is gone.
func TestGenerateTool_CopiesDirectoryTree(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "dark")
	writeMemFile(t, memFS, copyToolDir+"/themes/extra/light.toml", "light")

	tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes"})
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	copied := map[string]string{
		"/home/user/.config/copy-tool/themes/dark.toml":        "dark",
		"/home/user/.config/copy-tool/themes/extra/light.toml": "light",
	}
	for path, want := range copied {
		got, err := memFS.ReadFile(path)
		if err != nil {
			t.Fatalf("%s was not copied: %v", path, err)
		}
		if string(got) != want {
			t.Errorf("%s = %q, want %q", path, string(got), want)
		}
		if recordedCopy(t, orch, "copy-tool", path) == nil {
			t.Errorf("%s was not recorded as a copy", path)
		}
	}

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies: %v", err)
	}
	for path := range copied {
		if exists, _ := memFS.Exists(path); !exists {
			t.Errorf("%s was removed while its directory is still declared", path)
		}
	}

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{newCopyTool()}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies without declaration: %v", err)
	}
	for path := range copied {
		if exists, _ := memFS.Exists(path); exists {
			t.Errorf("%s survived the removal of its declaration", path)
		}
	}
}

func TestGenerateTool_CopyMissingSourceFails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	tool := newCopyTool(config.CopyConfig{Source: "./missing.toml", Target: "~/.config/copy-tool/config.toml"})
	err := orch.GenerateTool(ctx, tool, copyProjectConfig())
	if err == nil {
		t.Fatal("expected an error for a missing copy source")
	}
	if !strings.Contains(err.Error(), "./missing.toml") {
		t.Errorf("error %q does not name the source", err)
	}
	if exists, _ := memFS.Exists(copyToolTarget); exists {
		t.Errorf("target was created from a missing source")
	}
}

// The install pipeline applies copies too, so a tool installed for the first time
// gets its configuration files without a separate generate.
func TestInstallTool_AppliesCopies(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	if err := orch.instRegistry.Register(&mockInstaller{name: "mock-copy"}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed")

	tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
	tool.InstallationMethod = "mock-copy"
	if err := orch.InstallTool(ctx, tool, copyProjectConfig()); err != nil {
		t.Fatalf("InstallTool: %v", err)
	}

	got, err := memFS.ReadFile(copyToolTarget)
	if err != nil {
		t.Fatalf("copy target was not written by install: %v", err)
	}
	if string(got) != "managed" {
		t.Errorf("copy target = %q, want %q", string(got), "managed")
	}
}

// A copied directory follows the same policy as a file: an identical tree is left
// alone on a repeated generate, and any other content at the target, whether a
// diverged tree, a plain file or a symlink, is moved aside to <target>.bak first.
func TestGenerateTool_CopyDirectoryPolicy(t *testing.T) {
	t.Parallel()
	const themesTarget = "/home/user/.config/copy-tool/themes"

	tests := []struct {
		name         string
		beforeSecond func(t *testing.T, memFS fs.FS)
		wantBackup   func(t *testing.T, memFS fs.FS)
	}{
		{
			name:         "identical tree is left alone",
			beforeSecond: func(t *testing.T, memFS fs.FS) {},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				if exists, _ := memFS.Exists(themesTarget + ".bak"); exists {
					t.Errorf("an unchanged tree was backed up")
				}
			},
		},
		{
			name: "a changed source member displaces the old tree",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "darker")
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				old, err := memFS.ReadFile(themesTarget + ".bak/dark.toml")
				if err != nil || string(old) != "dark" {
					t.Errorf("backup dark.toml = %q, %v; want %q", string(old), err, "dark")
				}
				got, _ := memFS.ReadFile(themesTarget + "/dark.toml")
				if string(got) != "darker" {
					t.Errorf("target dark.toml = %q, want %q", string(got), "darker")
				}
			},
		},
		{
			name: "an extra member at the target displaces the tree",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				writeMemFile(t, memFS, themesTarget+"/user.toml", "mine")
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				mine, err := memFS.ReadFile(themesTarget + ".bak/user.toml")
				if err != nil || string(mine) != "mine" {
					t.Errorf("backup user.toml = %q, %v; want %q", string(mine), err, "mine")
				}
				if exists, _ := memFS.Exists(themesTarget + "/user.toml"); exists {
					t.Errorf("foreign member survived inside the managed tree")
				}
			},
		},
		{
			name: "a file where the directory belongs is backed up",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				if err := memFS.RemoveAll(themesTarget); err != nil {
					t.Fatalf("removing tree: %v", err)
				}
				writeMemFile(t, memFS, themesTarget, "not a directory")
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				old, err := memFS.ReadFile(themesTarget + ".bak")
				if err != nil || string(old) != "not a directory" {
					t.Errorf("backup = %q, %v; want %q", string(old), err, "not a directory")
				}
			},
		},
		{
			name: "a symlink where the directory belongs is backed up",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				if err := memFS.RemoveAll(themesTarget); err != nil {
					t.Fatalf("removing tree: %v", err)
				}
				if err := memFS.Symlink(copyToolDir+"/themes", themesTarget); err != nil {
					t.Fatalf("creating symlink: %v", err)
				}
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				info, err := memFS.Lstat(themesTarget + ".bak")
				if err != nil || info.Mode()&os.ModeSymlink == 0 {
					t.Errorf("expected the symlink to be kept as the backup, got %v, %v", info, err)
				}
				info, err = memFS.Lstat(themesTarget)
				if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
					t.Errorf("expected a real directory at the target, got %v, %v", info, err)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			projCfg := copyProjectConfig()
			writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "dark")
			writeMemFile(t, memFS, copyToolDir+"/themes/extra/light.toml", "light")
			tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes"})

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("first GenerateTool: %v", err)
			}
			tt.beforeSecond(t, memFS)
			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("second GenerateTool: %v", err)
			}

			light, err := memFS.ReadFile(themesTarget + "/extra/light.toml")
			if err != nil || string(light) != "light" {
				t.Errorf("target extra/light.toml = %q, %v; want %q", string(light), err, "light")
			}
			if recordedCopy(t, orch, "copy-tool", themesTarget+"/extra/light.toml") == nil {
				t.Errorf("extra/light.toml is not recorded as a copy after the second run")
			}
			tt.wantBackup(t, memFS)
		})
	}
}

func TestIsWithin(t *testing.T) {
	t.Parallel()
	tests := []struct {
		dir, path string
		want      bool
	}{
		{"/home/user/.config/tool", "/home/user/.config/tool", true},
		{"/home/user/.config/tool", "/home/user/.config/tool/themes/dark.toml", true},
		{"/home/user/.config/tool", "/home/user/.config/tool.bak", false},
		{"/home/user/.config/tool", "/home/user/.config/other", false},
		{"/home/user/.config/tool", "/home/user", false},
		{"/home/user/.config/tool", "relative/path", false},
	}
	for _, tt := range tests {
		if got := isWithin(tt.dir, tt.path); got != tt.want {
			t.Errorf("isWithin(%q, %q) = %v, want %v", tt.dir, tt.path, got, tt.want)
		}
	}
}

// Symlink targets already holding a regular file or directory are moved aside to a
// backup before the link is created, instead of being deleted. An older backup is
// kept and the displaced content goes beside it, and a repeated run leaves the
// backup alone because the link is already correct.
func TestSymlinkTargetIsBackedUpNotDeleted(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		pipeline   string
		existing   map[string]string
		runs       int
		wantBackup map[string]string
	}{
		{
			name:       "a regular file at the target is kept as .bak",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml": "user"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak": "user"},
		},
		{
			name:       "an older backup is kept and the displaced file goes beside it",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml": "user", "config.yml.bak": "older"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak": "older", "config.yml.bak.2": "user"},
		},
		{
			name:       "a directory at the target is kept whole",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml/inner.yml": "inside"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak/inner.yml": "inside"},
		},
		{
			name:       "a repeated generate leaves the backup alone",
			pipeline:   "generate",
			existing:   map[string]string{"config.yml": "user"},
			runs:       2,
			wantBackup: map[string]string{"config.yml.bak": "user"},
		},
		{
			name:       "the install pipeline backs up too",
			pipeline:   "install",
			existing:   map[string]string{"config.yml": "user"},
			runs:       1,
			wantBackup: map[string]string{"config.yml.bak": "user"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			root := t.TempDir()
			home := filepath.Join(root, "home")
			toolDir := filepath.Join(root, "tools", "link-tool")
			targetDir := filepath.Join(home, ".config", "link-tool")
			source := filepath.Join(toolDir, "config.yml")
			target := filepath.Join(targetDir, "config.yml")

			osFS := fs.NewResolvedFS(fs.NewOSFS(), home)
			orch := newTestOrchestrator(t, osFS, "")
			if err := orch.instRegistry.Register(&mockInstaller{name: "mock-link"}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}
			writeMemFile(t, osFS, source, "managed")
			for rel, content := range tt.existing {
				writeMemFile(t, osFS, filepath.Join(targetDir, rel), content)
			}

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      home,
					TargetDir:    filepath.Join(root, ".generated", "user-bin"),
					BinariesDir:  filepath.Join(root, ".generated", "binaries"),
					GeneratedDir: filepath.Join(root, ".generated"),
				},
			}
			tool := &config.ToolConfig{
				Name:           "link-tool",
				ConfigFilePath: filepath.Join(toolDir, "link-tool.tool.ts"),
				Symlinks:       []config.SymlinkConfig{{Source: "./config.yml", Target: "~/.config/link-tool/config.yml"}},
			}
			if tt.pipeline == "install" {
				tool.InstallationMethod = "mock-link"
			}

			for run := 1; run <= tt.runs; run++ {
				var err error
				if tt.pipeline == "install" {
					err = orch.InstallTool(ctx, tool, projCfg)
				} else {
					err = orch.GenerateTool(ctx, tool, projCfg)
				}
				if err != nil {
					t.Fatalf("%s run %d: %v", tt.pipeline, run, err)
				}
			}

			info, err := os.Lstat(target)
			if err != nil || info.Mode()&os.ModeSymlink == 0 {
				t.Fatalf("expected a symlink at %s, got %v, %v", target, info, err)
			}
			if linkTarget, _ := os.Readlink(target); linkTarget != source {
				t.Errorf("symlink points at %q, want %q", linkTarget, source)
			}
			for rel, want := range tt.wantBackup {
				got, err := os.ReadFile(filepath.Join(targetDir, rel))
				if err != nil {
					t.Fatalf("backup %s is missing: %v", rel, err)
				}
				if string(got) != want {
					t.Errorf("backup %s = %q, want %q", rel, string(got), want)
				}
			}
		})
	}
}

// Install and generate have to agree on the set of shims a tool owns. The declared
// .bin() set is that set: an installer-reported binary the tool never declared used to
// get a shim on install and lose it to the next generate's stale-shim cleanup, which
// an install would then put back.
func TestOrchestrator_InstallTool_ShimsOnlyDeclaredBinaries(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	// The installer reports a binary the tool declares, one it does not, and an
	// absolute path for a declared binary it placed outside the tool's current dir.
	_ = instReg.Register(&mockInstaller{
		name:     "custom-method",
		binaries: []string{"declared-bin", "extra-bin", "/opt/vendor/bin/elsewhere-bin"},
	})

	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	orch := NewOrchestrator(log, fsys, runner, reg, instReg)
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
	_ = fsys.MkdirAll("/home/user/binaries/reporting-tool/current", 0755)
	_ = fsys.WriteFile("/home/user/binaries/reporting-tool/current/declared-bin", []byte("bin"), 0755)
	_ = fsys.MkdirAll("/opt/vendor/bin", 0755)
	_ = fsys.WriteFile("/opt/vendor/bin/elsewhere-bin", []byte("bin"), 0755)

	version := "1.2.3"
	tool := &config.ToolConfig{
		Name:               "reporting-tool",
		Version:            &version,
		InstallationMethod: "custom-method",
		Binaries:           testutil.DeclaredBinaries("declared-bin", "elsewhere-bin"),
	}
	tools := []*config.ToolConfig{tool}

	if err := orch.InstallTools(ctx, tools, projCfg); err != nil {
		t.Fatalf("InstallTools failed: %v", err)
	}

	for _, bin := range []string{"declared-bin", "elsewhere-bin"} {
		if exists, _ := fsys.Exists(filepath.Join("/home/user/bin", bin)); !exists {
			t.Errorf("expected a shim for the declared binary %q", bin)
		}
	}
	if exists, _ := fsys.Exists("/home/user/bin/extra-bin"); exists {
		t.Error("expected no shim for the installer-reported binary the tool does not declare")
	}

	warning := `Installer reported binaries the tool does not declare with .bin(): extra-bin`
	if !strings.Contains(logBuf.String(), warning) {
		t.Errorf("expected a warning naming the undeclared binary, got:\n%s", logBuf.String())
	}

	// A declared binary the installer placed elsewhere is shimmed at the path it
	// reported, not at the tool's current directory.
	shim, err := fsys.ReadFile("/home/user/bin/elsewhere-bin")
	if err != nil {
		t.Fatalf("reading the elsewhere-bin shim: %v", err)
	}
	if !strings.Contains(string(shim), "/opt/vendor/bin/elsewhere-bin") {
		t.Errorf("expected the shim to target the installer-reported path, got:\n%s", shim)
	}

	logBuf.Reset()
	if err := orch.GenerateTools(ctx, tools, projCfg); err != nil {
		t.Fatalf("GenerateTools failed: %v", err)
	}
	for _, line := range strings.Split(logBuf.String(), "\n") {
		if strings.Contains(line, "Removing stale shim") && strings.Contains(line, "~/bin/") {
			t.Errorf("generate removed a shim install had just written: %s", strings.TrimSpace(line))
		}
	}
	for _, bin := range []string{"declared-bin", "elsewhere-bin"} {
		if exists, _ := fsys.Exists(filepath.Join("/home/user/bin", bin)); !exists {
			t.Errorf("expected the shim for %q to survive generate", bin)
		}
	}
	if exists, _ := fsys.Exists("/home/user/bin/extra-bin"); exists {
		t.Error("expected generate not to produce a shim for the undeclared binary either")
	}
}

// A tool that dependsOn a disabled tool's binary must not take the rest of the
// configuration down with it: the bin-name registry lists disabled tools on purpose,
// so the reference type-checks and has to load. "dotfilesnosuchbin" is deliberately
// nonsensical so no platform has it on PATH.
func TestOrchestrator_GenerateTools_DependencyOnDisabledProvider(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open DB: %v", err)
	}
	defer sqlDB.Close()

	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	orch := NewOrchestrator(log, fsys, runner, registry.NewRegistry(sqlDB), installer.NewRegistry())

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
	_ = fsys.MkdirAll("/home/user/bin", 0755)

	tools := []*config.ToolConfig{
		{Name: "provider", Binaries: testutil.DeclaredBinaries("dotfilesnosuchbin"), Disabled: true},
		{Name: "consumer", Binaries: testutil.DeclaredBinaries("consumerbin"), Dependencies: []string{"dotfilesnosuchbin"}},
		{Name: "unrelated", Binaries: testutil.DeclaredBinaries("unrelatedbin")},
	}

	if err := orch.GenerateTools(ctx, tools, projCfg); err != nil {
		t.Fatalf("GenerateTools failed: %v", err)
	}

	for _, bin := range []string{"unrelatedbin", "consumerbin"} {
		if exists, _ := fsys.Exists(filepath.Join("/home/user/bin", bin)); !exists {
			t.Errorf("expected a shim for %q to be generated", bin)
		}
	}
	if exists, _ := fsys.Exists("/home/user/bin/dotfilesnosuchbin"); exists {
		t.Error("expected no shim for the disabled provider's binary")
	}

	output := logBuf.String()
	want := `Tool "consumer" depends on "dotfilesnosuchbin", provided by disabled tool "provider": continuing without it`
	if !strings.Contains(output, want) {
		t.Errorf("expected the log to name the disabled provider with %q, got:\n%s", want, output)
	}
	if strings.Contains(output, "missing dependency") {
		t.Errorf("expected the disabled provider not to be reported as missing, got:\n%s", output)
	}
}

// The target directory and the usage-log directory belong to the project, not to
// whichever tool happened to be installed first: both hold artifacts of every tool.
// Recorded as one tool's shims they become stale shims of that tool the moment it is
// generated, and the cleanup deletes them, taking the usage log with them as soon as
// the directory is empty enough for Remove to succeed.
func TestInstallThenGenerate_SystemDirectoriesAreNotToolOwnedShims(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	if err := instReg.Register(&mockInstaller{name: "manual"}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}

	orch := NewOrchestrator(log, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/.generated/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	if err := fsys.MkdirAll("/opt/probe", 0755); err != nil {
		t.Fatalf("creating binary directory: %v", err)
	}
	if err := fsys.WriteFile("/opt/probe/probe", []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}

	tool := &config.ToolConfig{
		Name:               "probe",
		Binaries:           testutil.DeclaredBinaries("probe"),
		ConfigFilePath:     "/home/user/tools/probe.tool.ts",
		InstallationMethod: "manual",
		InstallParams:      map[string]interface{}{"binaryPath": "/opt/probe/probe"},
	}

	// A fresh project: nothing pre-creates the directories the install pipeline needs.
	if err := orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("InstallTools: %v", err)
	}
	if exists, _ := fsys.Exists(filepath.Join(projCfg.Paths.TargetDir, "probe")); !exists {
		t.Fatal("expected install to generate a shim for the declared binary")
	}

	usageDir := usagelog.Dir(projCfg.Paths.GeneratedDir)
	usageLogPath := usagelog.Path(projCfg.Paths.GeneratedDir)
	if err := fsys.WriteFile(usageLogPath, []byte("v1\t1700000000\tprobe\tprobe\n"), 0644); err != nil {
		t.Fatalf("writing usage log: %v", err)
	}

	systemDirs := map[string]bool{}
	for _, dir := range []string{projCfg.Paths.TargetDir, usageDir} {
		systemDirs[dir] = true
		systemDirs[orch.formatPath(projCfg, dir)] = true
	}

	states, err := reg.GetFileStatesForTool(ctx, tool.Name)
	if err != nil {
		t.Fatalf("reading file states: %v", err)
	}
	for _, state := range states {
		if systemDirs[state.FilePath] {
			t.Errorf("install recorded the shared directory %s as a file of tool %q (type %q)", state.FilePath, tool.Name, state.FileType)
		}
	}

	logBuf.Reset()
	if err := orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("GenerateTools: %v", err)
	}

	const marker = "Removing stale shim: "
	for _, line := range strings.Split(logBuf.String(), "\n") {
		idx := strings.Index(line, marker)
		if idx < 0 {
			continue
		}
		if named := strings.TrimSpace(line[idx+len(marker):]); systemDirs[named] {
			t.Errorf("generate reported removing the shared directory %s as a stale shim", named)
		}
	}

	if exists, _ := fsys.Exists(usageLogPath); !exists {
		t.Error("expected the usage log written before generate to survive it")
	}
	for dir := range systemDirs {
		if strings.HasPrefix(dir, "~") {
			continue
		}
		if exists, _ := fsys.Exists(dir); !exists {
			t.Errorf("expected %s to survive generate", dir)
		}
	}
}

// removeErrorFS fails every Remove, standing in for a shim the process may not delete.
type removeErrorFS struct {
	fs.FS
	err error
}

func (r *removeErrorFS) Remove(path string) error { return r.err }

// A registry written before shim generation stopped creating the shared directories
// still names them as some tool's shims. Cleanup must leave any recorded directory
// alone rather than rely on Remove refusing to empty it, and must report a Remove it
// could not carry out instead of discarding the error.
func TestCleanupStaleShims_DirectoriesAndRemoveFailures(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/.generated/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}
	tool := &config.ToolConfig{Name: "probe", Binaries: testutil.DeclaredBinaries("probe")}
	usageDir := usagelog.Dir(projCfg.Paths.GeneratedDir)
	staleShim := filepath.Join(projCfg.Paths.TargetDir, "gone")

	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	removeErr := errors.New("permission denied")
	orch := NewOrchestrator(log, &removeErrorFS{FS: fsys, err: removeErr}, runner, reg, installer.NewRegistry())

	// The registry as an older version left it: an empty shared directory and a shim
	// for a binary the tool no longer declares, both owned by the tool.
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		toolFS := orch.getTrackedFS(ctx, tx, tool.Name, "shim")
		if err := toolFS.MkdirAll(usageDir, 0755); err != nil {
			return err
		}
		if err := toolFS.MkdirAll(projCfg.Paths.TargetDir, 0755); err != nil {
			return err
		}
		return toolFS.WriteFile(staleShim, []byte("# Generated by Dotfiles Management Tool\n"), 0755)
	}); err != nil {
		t.Fatalf("seeding the registry: %v", err)
	}

	if err := orch.CleanupStaleShims(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleShims: %v", err)
	}

	if exists, _ := fsys.Exists(usageDir); !exists {
		t.Errorf("expected the recorded directory %s to survive cleanup", usageDir)
	}
	logged := logBuf.String()
	if strings.Contains(logged, "Removing stale shim: "+orch.formatPath(projCfg, usageDir)) {
		t.Errorf("expected cleanup not to treat the recorded directory as a shim, got:\n%s", logged)
	}
	if !strings.Contains(logged, "Failed to remove stale shim") || !strings.Contains(logged, removeErr.Error()) {
		t.Errorf("expected the failed removal of %s to be reported, got:\n%s", staleShim, logged)
	}
}

// TestGenerateToolsRejectsUnresolvablePlaceholderInRecordedPath pins that a recorded
// path holding a placeholder nothing can fill stops the run instead of being resolved
// against the directory the command was run from.
//
// {configFileDir} is a setting of the paths block that ResolvePlaceholders does not
// know, so it survives substitution; joined by fs.Abs it lands under the working
// directory, and whatever sits there is what the cleanup then removes.
func TestGenerateToolsRejectsUnresolvablePlaceholderInRecordedPath(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		fileType string
	}{
		{name: "recorded symlink", fileType: "symlink"},
		{name: "recorded copy", fileType: "copy"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			fsys := fs.NewMemFS()
			runner := exec.NewMockRunner()

			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening the registry database: %v", err)
			}
			defer sqlDB.Close()

			reg := registry.NewRegistry(sqlDB)
			orch := NewOrchestrator(nil, fsys, runner, reg, installer.NewRegistry())
			orch.SetSymlinkFS(fsys)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/.generated/bin",
					BinariesDir:  "/home/user/.generated/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}

			const recordedPath = "{configFileDir}/bat.conf"

			// What the cleanup reaches when the placeholder is left in place: the
			// recorded path is relative, so it resolves under the working directory.
			cwdPath, err := fsys.Abs(recordedPath)
			if err != nil {
				t.Fatalf("resolving %q against the working directory: %v", recordedPath, err)
			}
			if err := fsys.MkdirAll(filepath.Dir(cwdPath), 0755); err != nil {
				t.Fatalf("creating %s: %v", filepath.Dir(cwdPath), err)
			}
			if err := fsys.WriteFile(cwdPath, []byte("not the CLI's file\n"), 0644); err != nil {
				t.Fatalf("writing %s: %v", cwdPath, err)
			}

			if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
				return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
					ToolName:      "bat",
					OperationType: "symlink",
					FilePath:      recordedPath,
					FileType:      tt.fileType,
					CreatedAt:     1,
				})
			}); err != nil {
				t.Fatalf("seeding the registry: %v", err)
			}

			// The tool no longer declares the path, so the cleanup judges it stale.
			tool := &config.ToolConfig{Name: "bat", Binaries: testutil.DeclaredBinaries("bat")}

			err = orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg)
			if err == nil {
				t.Error("GenerateTools() = nil, want it to fail on the unresolvable placeholder")
			} else {
				for _, want := range []string{"bat", tt.fileType, "{configFileDir}"} {
					if !strings.Contains(err.Error(), want) {
						t.Errorf("GenerateTools() = %v, want it to name %q", err, want)
					}
				}
			}

			if exists, _ := fsys.Exists(cwdPath); !exists {
				t.Errorf("expected %s under the working directory to be left alone", cwdPath)
			}
		})
	}
}

// TestManualBinaryPathRejectsUnresolvablePlaceholder pins that a manual tool whose
// binaryPath holds a placeholder nothing can fill stops the run. Left in place the token
// makes binaryPath relative, and both pipelines would shim whatever the directory the
// command was run from happens to hold.
func TestManualBinaryPathRejectsUnresolvablePlaceholder(t *testing.T) {
	t.Parallel()
	run := map[string]func(*Orchestrator, context.Context, *config.ToolConfig, *config.ProjectConfig) error{
		"generate": func(o *Orchestrator, ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.GenerateTool(ctx, tool, projCfg)
		},
		"install": func(o *Orchestrator, ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.InstallTool(ctx, tool, projCfg)
		},
	}

	for _, pipeline := range []string{"generate", "install"} {
		t.Run(pipeline, func(t *testing.T) {
			ctx := context.Background()
			fsys := fs.NewMemFS()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening the registry database: %v", err)
			}
			defer sqlDB.Close()

			instReg := installer.NewRegistry()
			if err := instReg.Register(&mockInstaller{name: "manual"}); err != nil {
				t.Fatalf("registering the installer: %v", err)
			}
			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
			orch := NewOrchestrator(log, fsys, exec.NewMockRunner(), registry.NewRegistry(sqlDB), instReg)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:         "/home/user",
					TargetDir:       "/home/user/.generated/bin",
					BinariesDir:     "/home/user/.generated/binaries",
					ShellScriptsDir: "/home/user/.generated/shell-scripts",
					GeneratedDir:    "/home/user/.generated",
				},
			}

			tool := &config.ToolConfig{
				Name:               "bat",
				Binaries:           testutil.DeclaredBinaries("bat"),
				ConfigFilePath:     "/home/user/tools/bat.tool.ts",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "{configFileDir}/bat"},
			}

			err = run[pipeline](orch, ctx, tool, projCfg)
			if err == nil {
				t.Fatalf("%s = nil, want it to fail on the unresolvable placeholder", pipeline)
			}
			for _, want := range []string{"bat", "binaryPath", "{configFileDir}"} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("%s = %v, want it to name %q", pipeline, err, want)
				}
			}
		})
	}
}

// TestGenerateCompletionsForToolRejectsUnresolvablePlaceholder pins that a completion
// declaration holding a placeholder nothing can fill is reported rather than quietly
// producing no completion. The generate pipeline decides how loud that is; what matters
// here is that the resolver's answer reaches it.
func TestGenerateCompletionsForToolRejectsUnresolvablePlaceholder(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		completions interface{}
		wantErr     string
	}{
		{
			name:        "source path",
			completions: "{configFileDir}/_bat",
			wantErr:     "completions source",
		},
		{
			name:        "source path in a declaration object",
			completions: map[string]interface{}{"source": "{configFileDir}/_bat"},
			wantErr:     "completions source",
		},
		{
			name:        "command",
			completions: map[string]interface{}{"cmd": "{paths.homeDir} completion zsh"},
			wantErr:     "completions command",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			fsys := fs.NewMemFS()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening the registry database: %v", err)
			}
			defer sqlDB.Close()

			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
			orch := NewOrchestrator(log, fsys, exec.NewMockRunner(), registry.NewRegistry(sqlDB), nil)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:         "/home/user",
					TargetDir:       "/home/user/.generated/bin",
					BinariesDir:     "/home/user/.generated/binaries",
					ShellScriptsDir: "/home/user/.generated/shell-scripts",
					GeneratedDir:    "/home/user/.generated",
				},
			}
			// A command is resolvable text, so it takes a cycle rather than an unknown
			// name to make it unresolvable.
			if tt.wantErr == "completions command" {
				projCfg.Paths.HomeDir = "{paths.dotfilesDir}/sub"
				projCfg.Paths.DotfilesDir = "{paths.homeDir}/dot"
			}

			tool := &config.ToolConfig{
				Name:           "bat",
				Binaries:       testutil.DeclaredBinaries("bat"),
				ConfigFilePath: "/home/user/tools/bat.tool.ts",
				ShellConfigs: &config.ShellConfigs{
					Zsh: &config.ShellTypeConfig{Completions: tt.completions},
				},
			}

			err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
			if err == nil {
				t.Fatal("GenerateCompletionsForTool() = nil, want it to report the unresolvable placeholder")
			}
			for _, want := range []string{"bat", "zsh", tt.wantErr} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("GenerateCompletionsForTool() = %v, want it to name %q", err, want)
				}
			}
		})
	}
}

// TestSymlinkAndCopyPlaceholdersResolved pins that createSymlinks and applyCopies
// resolve path placeholders (such as {paths.homeDir}) in target paths rather than
// treating them as literal relative paths under the cwd, and expands leading ~.
func TestSymlinkAndCopyPlaceholdersResolved(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		pipeline string
		op       string // "symlink" or "copy"
		target   string
		wantPath string
	}{
		{
			name:     "generate symlink with {paths.homeDir}",
			pipeline: "generate",
			op:       "symlink",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "install symlink with {paths.homeDir}",
			pipeline: "install",
			op:       "symlink",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "generate symlink with tilde",
			pipeline: "generate",
			op:       "symlink",
			target:   "~/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "generate copy with {paths.homeDir}",
			pipeline: "generate",
			op:       "copy",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "install copy with {paths.homeDir}",
			pipeline: "install",
			op:       "copy",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "generate copy with tilde",
			pipeline: "generate",
			op:       "copy",
			target:   "~/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			if err := orch.instRegistry.Register(&mockInstaller{name: "mock-method"}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}

			sourcePath := "/home/user/tools/test-tool/config.yml"
			writeMemFile(t, memFS, sourcePath, "managed content")

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/.generated/bin",
					BinariesDir:  "/home/user/.generated/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}

			tool := &config.ToolConfig{
				Name:           "test-tool",
				ConfigFilePath: "/home/user/tools/test-tool/test-tool.tool.ts",
			}
			if tt.pipeline == "install" {
				tool.InstallationMethod = "mock-method"
			}

			if tt.op == "symlink" {
				tool.Symlinks = []config.SymlinkConfig{{Source: "./config.yml", Target: tt.target}}
			} else {
				tool.Copies = []config.CopyConfig{{Source: "./config.yml", Target: tt.target}}
			}

			var err error
			if tt.pipeline == "install" {
				err = orch.InstallTool(ctx, tool, projCfg)
			} else {
				err = orch.GenerateTool(ctx, tool, projCfg)
			}
			if err != nil {
				t.Fatalf("%s failed: %v", tt.pipeline, err)
			}

			// The file/symlink should exist at tt.wantPath
			exists, err := memFS.Exists(tt.wantPath)
			if err != nil || !exists {
				t.Fatalf("expected file at %s, exists=%v, err=%v", tt.wantPath, exists, err)
			}

			// It should NOT exist under cwd relative path like {paths.homeDir}/...
			cwdTarget, err := memFS.Abs(tt.target)
			if err == nil && cwdTarget != tt.wantPath {
				if exists, _ := memFS.Exists(cwdTarget); exists {
					t.Errorf("found artifact at cwd path %s", cwdTarget)
				}
			}

			// CleanupStale should not consider it stale
			if tt.op == "symlink" {
				if err := orch.CleanupStaleSymlinks(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
					t.Fatalf("CleanupStaleSymlinks failed: %v", err)
				}
			} else {
				if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
					t.Fatalf("CleanupStaleCopies failed: %v", err)
				}
			}
			if exists, _ := memFS.Exists(tt.wantPath); !exists {
				t.Errorf("cleanup removed valid artifact at %s", tt.wantPath)
			}
		})
	}
}

// TestSymlinkAndCopyRejectsUnresolvablePlaceholder pins that an unresolvable placeholder
// in .symlink() or .copy() target fails the pipeline naming the tool, target, and token.
func TestSymlinkAndCopyRejectsUnresolvablePlaceholder(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		pipeline string
		op       string // "symlink" or "copy"
		target   string
	}{
		{name: "generate symlink", pipeline: "generate", op: "symlink", target: "{configFileDir}/tool.conf"},
		{name: "install symlink", pipeline: "install", op: "symlink", target: "{configFileDir}/tool.conf"},
		{name: "generate copy", pipeline: "generate", op: "copy", target: "{configFileDir}/tool.conf"},
		{name: "install copy", pipeline: "install", op: "copy", target: "{configFileDir}/tool.conf"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			if err := orch.instRegistry.Register(&mockInstaller{name: "mock-method"}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}

			sourcePath := "/home/user/tools/test-tool/config.yml"
			writeMemFile(t, memFS, sourcePath, "managed content")

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/.generated/bin",
					BinariesDir:  "/home/user/.generated/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}

			tool := &config.ToolConfig{
				Name:           "test-tool",
				ConfigFilePath: "/home/user/tools/test-tool/test-tool.tool.ts",
			}
			if tt.pipeline == "install" {
				tool.InstallationMethod = "mock-method"
			}

			if tt.op == "symlink" {
				tool.Symlinks = []config.SymlinkConfig{{Source: "./config.yml", Target: tt.target}}
			} else {
				tool.Copies = []config.CopyConfig{{Source: "./config.yml", Target: tt.target}}
			}

			var err error
			if tt.pipeline == "install" {
				err = orch.InstallTool(ctx, tool, projCfg)
			} else {
				err = orch.GenerateTool(ctx, tool, projCfg)
			}
			if err == nil {
				t.Fatalf("%s = nil, want it to fail on unresolvable placeholder in target", tt.pipeline)
			}

			for _, want := range []string{"test-tool", "{configFileDir}"} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("%s error = %v, want it to contain %q", tt.pipeline, err, want)
				}
			}

			cwdTarget, _ := memFS.Abs(tt.target)
			if exists, _ := memFS.Exists(cwdTarget); exists {
				t.Errorf("artifact was created under cwd at %s", cwdTarget)
			}
		})
	}
}
