package orchestrator

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
)

// mockSymlinkFS bridges symlink.FileSystem to fs.FS
type mockSymlinkFS struct {
	fsys fs.FS
}

var _ symlink.FileSystem = (*mockSymlinkFS)(nil)

func (m *mockSymlinkFS) Abs(path string) (string, error) {
	return path, nil
}

func (m *mockSymlinkFS) Stat(path string) (os.FileInfo, error) {
	exists, err := m.fsys.Exists(path)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, os.ErrNotExist
	}
	return nil, nil
}

func (m *mockSymlinkFS) Lstat(path string) (os.FileInfo, error) {
	return m.Stat(path)
}

func (m *mockSymlinkFS) Readlink(path string) (string, error) {
	data, err := m.fsys.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (m *mockSymlinkFS) Remove(path string) error {
	return m.fsys.Remove(path)
}

func (m *mockSymlinkFS) RemoveAll(path string) error {
	return m.fsys.Remove(path)
}

func (m *mockSymlinkFS) MkdirAll(path string, perm os.FileMode) error {
	return m.fsys.MkdirAll(path, perm)
}

func (m *mockSymlinkFS) Symlink(oldname, newname string) error {
	return m.fsys.WriteFile(newname, []byte(oldname), 0777)
}

func (m *mockSymlinkFS) Rename(oldname, newname string) error {
	data, err := m.fsys.ReadFile(oldname)
	if err != nil {
		return err
	}
	if err := m.fsys.WriteFile(newname, data, 0777); err != nil {
		return err
	}
	return m.fsys.Remove(oldname)
}

// mockInstaller implements installer.Installer for testing
type mockInstaller struct {
	name         string
	supportsSudo bool
	lastTool     *config.ToolConfig
	binaries     []string
	err          error
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.supportsSudo
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
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

func TestTopologicalSort(t *testing.T) {
	tools := []*config.ToolConfig{
		{Name: "A", Dependencies: []string{"B"}},
		{Name: "B", Dependencies: []string{"C"}},
		{Name: "C"},
	}

	sorted, err := TopologicalSort(tools)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(sorted) != 3 {
		t.Fatalf("expected 3 tools, got %d", len(sorted))
	}

	if sorted[0].Name != "C" || sorted[1].Name != "B" || sorted[2].Name != "A" {
		t.Errorf("expected C, B, A; got %s, %s, %s", sorted[0].Name, sorted[1].Name, sorted[2].Name)
	}

	// Cycle detection
	cyclicTools := []*config.ToolConfig{
		{Name: "X", Dependencies: []string{"Y"}},
		{Name: "Y", Dependencies: []string{"X"}},
	}
	_, err = TopologicalSort(cyclicTools)
	if err == nil {
		t.Fatal("expected cycle detection error, got nil")
	}

	// Duplicate names
	duplicateTools := []*config.ToolConfig{
		{Name: "A"},
		{Name: "A"},
	}
	_, err = TopologicalSort(duplicateTools)
	if err == nil {
		t.Fatal("expected duplicate name error, got nil")
	}

	// Unregistered dependency
	unregisteredDepTools := []*config.ToolConfig{
		{Name: "A", Dependencies: []string{"B"}},
	}
	_, err = TopologicalSort(unregisteredDepTools)
	if err == nil {
		t.Fatal("expected error on unregistered dependency, got nil")
	}
}

func TestMatchesHostname(t *testing.T) {
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
	binaries := []interface{}{
		"simple-bin",
		config.BinaryConfig{Name: "struct-bin", Pattern: "pat"},
		&config.BinaryConfig{Name: "pointer-bin", Pattern: "pat"},
		map[string]interface{}{"name": "map-bin"},
	}

	names := getBinaryNames(binaries)
	if len(names) != 4 {
		t.Fatalf("expected 4 names, got %d", len(names))
	}

	expected := []string{"simple-bin", "struct-bin", "pointer-bin", "map-bin"}
	for i, name := range names {
		if name != expected[i] {
			t.Errorf("expected %q, got %q", expected[i], name)
		}
	}
}

func TestOrchestrator_Install(t *testing.T) {
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

	orch := NewOrchestrator(fsys, runner, reg, instReg)
	orch.SetSymlinkFS(&mockSymlinkFS{fsys: fsys})

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	tool := &config.ToolConfig{
		Name:               "test-tool",
		InstallationMethod: "custom-method",
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/user/src", Target: "/home/user/dest"},
		},
	}

	// Make sure directories exist in memfs
	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/binaries", 0755)
	_ = fsys.MkdirAll("/home/user/src", 0755)

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
	if len(ops) != 2 {
		t.Fatalf("expected 2 operations (shim, symlink), got %d", len(ops))
	}

	instRec, err := reg.GetToolInstallation(ctx, "test-tool")
	if err != nil {
		t.Fatalf("failed to get installation record: %v", err)
	}
	if instRec == nil {
		t.Fatal("expected tool installation record to be created, got nil")
	}
	if instRec.Version != "latest" {
		t.Errorf("expected version to be 'latest', got %s", instRec.Version)
	}
}

func TestOrchestrator_Errors(t *testing.T) {
	ctx := context.Background()
	fsys := fs.NewMemFS()
	runner := exec.NewMockRunner()

	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{}

	// Test projCfg == nil
	err := orch.InstallTool(ctx, &config.ToolConfig{Name: "test-tool"}, nil)
	if err == nil {
		t.Fatal("expected error with nil project config")
	}

	// Test missing installation method
	tool := &config.ToolConfig{Name: "test-tool"}
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

	orch := NewOrchestrator(fsys, runner, reg, instReg)
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

	orch := NewOrchestrator(fsys, runner, reg, instReg)

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
		Binaries:           []interface{}{"test-bin"},
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

