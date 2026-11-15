package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
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
	"github.com/alexgorbatchev/dotfiles/pkg/shell"
)

func TestOrchestrator_Generate(t *testing.T) {
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

// A tool that dependsOn a disabled tool's binary must not take the rest of the
// configuration down with it: the bin-name registry lists disabled tools on purpose,
// so the reference type-checks and has to load. "dotfilesnosuchbin" is deliberately
// nonsensical so no platform has it on PATH.
func TestOrchestrator_GenerateTools_DependencyOnDisabledProvider(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
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
			fsys := newMemFS()
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

func TestGenerateToolPrefersCurrentOverRecordedVersion(t *testing.T) {
	t.Parallel()
	for _, currentExists := range []bool{true, false} {
		t.Run(fmt.Sprintf("current_exists=%t", currentExists), func(t *testing.T) {
			ctx := context.Background()
			memFS := fs.NewOSFS()
			home := t.TempDir()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer sqlDB.Close()
			reg := registry.NewRegistry(sqlDB)
			orch := NewOrchestrator(nil, memFS, exec.NewMockRunner(), reg, installer.NewRegistry())
			projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: home, TargetDir: filepath.Join(home, ".generated", "bin"),
				BinariesDir: filepath.Join(home, ".generated", "binaries"), GeneratedDir: filepath.Join(home, ".generated"),
			}}
			tool := &config.ToolConfig{Name: "go-scaffold", InstallationMethod: "github-release", Binaries: testutil.DeclaredBinaries("go-scaffold")}
			versionDir := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "v1.0.1")
			recordedPath := filepath.Join(versionDir, tool.Name)
			if err := memFS.MkdirAll(versionDir, 0755); err != nil {
				t.Fatal(err)
			}
			if err := memFS.WriteFile(recordedPath, []byte("#!/bin/sh\n"), 0755); err != nil {
				t.Fatal(err)
			}
			want := recordedPath
			if currentExists {
				currentDir := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current")
				if err := memFS.Symlink(versionDir, currentDir); err != nil {
					t.Fatal(err)
				}
				want = filepath.Join(currentDir, tool.Name)
			}
			paths, err := json.Marshal([]string{recordedPath})
			if err != nil {
				t.Fatal(err)
			}
			if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
				return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
					ToolName: tool.Name, Version: "v1.0.1", InstallPath: versionDir, BinaryPaths: string(paths),
				})
			}); err != nil {
				t.Fatal(err)
			}
			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatal(err)
			}
			content, err := memFS.ReadFile(filepath.Join(projCfg.Paths.TargetDir, tool.Name))
			if err != nil {
				t.Fatal(err)
			}
			if target := "TOOL_EXECUTABLE=" + shell.Quote(want); !strings.Contains(string(content), target) {
				t.Errorf("generated shim must contain %s", target)
			}
		})
	}
}

func TestGenerateToolFilteringAndCopies(t *testing.T) {
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
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. Disabled tool
	tDisabled := &config.ToolConfig{
		Name:     "dis-tool",
		Disabled: true,
	}
	err = orch.GenerateTool(ctx, tDisabled, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool(disabled) failed: %v", err)
	}

	// 2. Hostname mismatch
	tHost := &config.ToolConfig{
		Name:     "host-tool",
		Hostname: "nonexistent-hostname-12345",
	}
	err = orch.GenerateTool(ctx, tHost, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool(hostname mismatch) failed: %v", err)
	}

	// 3. Tool with Symlink
	_ = memFS.MkdirAll("/home/test/dotfiles/src", 0755)
	_ = memFS.WriteFile("/home/test/dotfiles/src/sym.txt", []byte("sym content"), 0644)

	tSym := &config.ToolConfig{
		Name:           "sym-tool",
		ConfigFilePath: "/home/test/dotfiles/tools/sym.tool.ts",
		Binaries:       testutil.DeclaredBinaries("csbin"),
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/test/dotfiles/src/sym.txt", Target: "/home/test/.config/sym.txt"},
		},
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases: map[string]string{"cs": "csbin"},
			},
		},
	}

	err = orch.GenerateTool(ctx, tSym, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool(sym) failed: %v", err)
	}
}

func TestGenerateToolsFullWorkflow(t *testing.T) {
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
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	t1 := &config.ToolConfig{
		Name:     "tool1",
		Binaries: testutil.DeclaredBinaries("bin1"),
	}
	t2 := &config.ToolConfig{
		Name:         "tool2",
		Binaries:     testutil.DeclaredBinaries("bin2"),
		Dependencies: []string{"tool1"},
	}

	err = orch.GenerateTools(ctx, []*config.ToolConfig{t1, t2}, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools full workflow failed: %v", err)
	}

	existsTarget, _ := memFS.Exists("/home/test/.bin")
	if !existsTarget {
		t.Errorf("expected targetDir to exist")
	}

	zshMain, err := memFS.ReadFile("/home/test/.generated/shell-scripts/main.zsh")
	if err != nil || !strings.Contains(string(zshMain), "PATH") {
		t.Errorf("expected main.zsh generated")
	}
}

func TestGenerateToolsAutoInstallAndDisabled(t *testing.T) {
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
		binaries: []string{"/home/test/.binaries/auto-tool/current/autobin"},
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

	tDisabled := &config.ToolConfig{
		Name:     "dis-tool",
		Disabled: true,
	}

	tAuto := &config.ToolConfig{
		Name:               "auto-tool",
		InstallationMethod: "manual",
		Binaries:           testutil.DeclaredBinaries("autobin"),
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tDisabled}, projCfg)
	if err != nil {
		t.Fatalf("InstallTools with disabled tool failed: %v", err)
	}

	err = orch.GenerateTools(ctx, []*config.ToolConfig{tAuto}, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools with auto-install tool failed: %v", err)
	}

	if mInst.installCount != 1 {
		t.Errorf("expected auto-install tool to be installed during GenerateTools, got count=%d", mInst.installCount)
	}
}

func TestGenerateTools_PropagateAutoInstallToDependencies(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()
	reg := registry.NewRegistry(database)

	instReg := installer.NewRegistry()
	installedOrder := []string{}
	inst := &mockInstaller{
		name:     "custom",
		binaries: []string{"test-bin"},
	}
	_ = instReg.Register(inst)

	// Mock installer recording execution order
	runner.RegisterFunc("bash", func(c *exec.MockCmd) error {
		return nil
	})

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

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

	// Tool B is auto-installed and depends on Tool A (which has NO auto-install flag)
	toolA := &config.ToolConfig{
		Name:               "tool-a",
		InstallationMethod: "custom",
		Binaries:           testutil.DeclaredBinaries("tool-a-bin"),
		// auto flag NOT set
	}

	toolB := &config.ToolConfig{
		Name:               "tool-b",
		InstallationMethod: "custom",
		Binaries:           testutil.DeclaredBinaries("tool-b-bin"),
		Dependencies:       []string{"tool-a-bin"},
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}

	tools := []*config.ToolConfig{toolB, toolA}

	err = orch.GenerateTools(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools failed: %v", err)
	}

	// Verify that Tool A was installed into the registry even though it did not have auto: true,
	// because Tool B (which is auto-installed) depended on it.
	toolAState, err := reg.GetToolInstallation(ctx, "tool-a")
	if err != nil || toolAState == nil {
		t.Fatalf("expected tool-a to be installed as a dependency of tool-b, but state is missing: %v", err)
	}

	toolBState, err := reg.GetToolInstallation(ctx, "tool-b")
	if err != nil || toolBState == nil {
		t.Fatalf("expected tool-b to be installed, but state is missing: %v", err)
	}

	_ = installedOrder
}

func TestGenerateTools_DependencyAutoInstallFailureCascade(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()
	reg := registry.NewRegistry(database)

	instReg := installer.NewRegistry()
	instFail := &mockInstaller{
		name:     "failing-installer",
		binaries: []string{"tool-a-bin"},
		err:      fmt.Errorf("simulated network failure"),
	}
	_ = instReg.Register(instFail)

	instToolB := &mockInstaller{
		name:     "tool-b-installer",
		binaries: []string{"tool-b-bin"},
	}
	runner.RegisterFunc("bash", func(c *exec.MockCmd) error {
		return nil
	})
	_ = instReg.Register(instToolB)

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

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

	toolA := &config.ToolConfig{
		Name:               "tool-a",
		InstallationMethod: "failing-installer",
		Binaries:           testutil.DeclaredBinaries("tool-a-bin"),
	}

	toolB := &config.ToolConfig{
		Name:               "tool-b",
		InstallationMethod: "tool-b-installer",
		Binaries:           testutil.DeclaredBinaries("tool-b-bin"),
		Dependencies:       []string{"tool-a-bin"},
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}

	tools := []*config.ToolConfig{toolB, toolA}

	err = orch.GenerateTools(ctx, tools, projCfg)
	if err == nil || !strings.Contains(err.Error(), "simulated network failure") {
		t.Fatalf("GenerateTools must report auto-install failures after generating fallback shims: %v", err)
	}

	// Tool B should not have attempted installation since Tool A failed
	if instToolB.installCount > 0 {
		t.Errorf("expected tool-b installation to be skipped due to tool-a failure, but Install() was called %d times", instToolB.installCount)
	}

	// Fallback shims for both tool-a and tool-b should still be generated
	shimAExists, _ := memFS.Exists("/home/test/.bin/tool-a-bin")
	if !shimAExists {
		t.Errorf("expected fallback shim for tool-a-bin to exist")
	}

	shimBExists, _ := memFS.Exists("/home/test/.bin/tool-b-bin")
	if !shimBExists {
		t.Errorf("expected fallback shim for tool-b-bin to exist")
	}
}

func TestEnsureShimDirsAndGenerateToolNilConfig(t *testing.T) {
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	if err := orch.ensureShimDirs(ctx, nil); err == nil {
		t.Error("expected ensureShimDirs(nil) to return error")
	}

	tool := &config.ToolConfig{Name: "test"}
	if err := orch.GenerateTool(ctx, tool, nil); err == nil {
		t.Error("expected GenerateTool(nil) to return error")
	}

	// isDir coverage
	_ = memFS.MkdirAll("/a/dir", 0755)
	_ = memFS.WriteFile("/a/file", []byte("content"), 0644)
	if !orch.isDir("/a/dir") {
		t.Error("expected /a/dir to be recognized as directory")
	}
	if orch.isDir("/a/file") {
		t.Error("expected /a/file to not be recognized as directory")
	}
	if orch.isDir("/a/nonexistent") {
		t.Error("expected /a/nonexistent to not be recognized as directory")
	}
}
