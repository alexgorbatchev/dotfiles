package orchestrator

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

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

func TestTopologicalSort_BinaryDependencies(t *testing.T) {
	tests := []struct {
		name        string
		tools       []*config.ToolConfig
		wantOrder   []string
		wantErrSub  string
		expectError bool
	}{
		{
			name: "successful binary dependency resolution",
			tools: []*config.ToolConfig{
				{
					Name:         "rust-tool",
					Binaries:     []interface{}{"cargo", "rustc"},
					Dependencies: []string{},
				},
				{
					Name:         "my-package",
					Binaries:     []interface{}{"my-bin"},
					Dependencies: []string{"cargo"},
				},
			},
			wantOrder:   []string{"rust-tool", "my-package"},
			expectError: false,
		},
		{
			name: "successful fallback to direct tool dependency",
			tools: []*config.ToolConfig{
				{
					Name:         "rust-tool",
					Binaries:     []interface{}{"cargo", "rustc"},
					Dependencies: []string{},
				},
				{
					Name:         "my-package",
					Binaries:     []interface{}{"my-bin"},
					Dependencies: []string{"rust-tool"},
				},
			},
			wantOrder:   []string{"rust-tool", "my-package"},
			expectError: false,
		},
		{
			name: "ambiguous dependency error (multiple binary providers)",
			tools: []*config.ToolConfig{
				{
					Name:     "tool-one",
					Binaries: []interface{}{"duplicate-bin"},
				},
				{
					Name:     "tool-two",
					Binaries: []interface{}{"duplicate-bin"},
				},
				{
					Name:         "tool-three",
					Dependencies: []string{"duplicate-bin"},
				},
			},
			expectError: true,
			wantErrSub:  "ambiguous dependency",
		},
		{
			name: "missing dependency error (no binary providers)",
			tools: []*config.ToolConfig{
				{
					Name:         "tool-A",
					Dependencies: []string{"missing-bin"},
				},
			},
			expectError: true,
			wantErrSub:  "depends on missing dependency",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := TopologicalSort(tt.tools)
			if tt.expectError {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErrSub)
				}
				if tt.wantErrSub != "" && !strings.Contains(err.Error(), tt.wantErrSub) {
					t.Fatalf("expected error to contain %q, got: %v", tt.wantErrSub, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(got) != len(tt.wantOrder) {
				t.Fatalf("expected %d sorted tools, got %d", len(tt.wantOrder), len(got))
			}

			for i, w := range tt.wantOrder {
				if got[i].Name != w {
					t.Errorf("at index %d: expected tool name %q, got %q", i, w, got[i].Name)
				}
			}
		})
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
	if len(ops) != 3 {
		t.Fatalf("expected 3 operations (shim write, shim chmod, symlink), got %d", len(ops))
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

func TestOrchestrator_Generate(t *testing.T) {
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
		Binaries:           []interface{}{"standard-bin"},
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/user/src", Target: "/home/user/dest"},
		},
	}

	autoTool := &config.ToolConfig{
		Name:               "auto-tool",
		Version:            &versionStr,
		InstallationMethod: "custom-method",
		Binaries:           []interface{}{"auto-bin"},
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

	// Verify auto tool shim was generated
	autoShimExists, err := fsys.Exists("/home/user/bin/test-bin")
	if err != nil || !autoShimExists {
		t.Error("expected auto shim script (test-bin) to be generated")
	}

	// Verify auto tool installation record DOES exist in the database!
	autoRec, err := reg.GetToolInstallation(ctx, "auto-tool")
	if err != nil || autoRec == nil {
		t.Fatal("expected auto tool installation record to exist in the database, but it does not")
	}
	if autoRec.Version != "1.2.3" {
		t.Errorf("expected auto tool version to be '1.2.3', got %s", autoRec.Version)
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

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)

	projCfg := &config.ProjectConfig{}

	// Test projCfg == nil
	err := orch.InstallTool(ctx, &config.ToolConfig{Name: "test-tool"}, nil)
	if err == nil {
		t.Fatal("expected error with nil project config")
	}

	// Test missing installation method
	tool := &config.ToolConfig{Name: "test-tool", Binaries: []interface{}{"test-bin"}}
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

func TestOrchestrator_InstallSudoMismatch(t *testing.T) {
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

	expectedErr := `installer "npm" does not support sudo installations`
	if !strings.Contains(err.Error(), expectedErr) {
		t.Errorf("expected error %q, got %q", expectedErr, err.Error())
	}
}

func TestOrchestrator_OnceScriptSelfDeletionAndPruning(t *testing.T) {
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
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
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
	trackedFS := fs.NewTrackedFileSystem(memFS, reg, "system").WithFileType("init")
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
			Name: "test-tool",
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
					SourceFiles: []string{
						"shell.zsh",
					},
					Sources: []string{
						"echo inline-source",
					},
					SourceFunctions: []string{
						"my-func",
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
	if !strings.Contains(scriptContent, "[[ -f \"/home/user/tools/shell.zsh\" ]] && cat \"/home/user/tools/shell.zsh\"") {
		t.Errorf("expected script to contain sourceFile function body")
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
