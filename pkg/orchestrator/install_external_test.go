package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
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
)

func TestExternalInstallationHealthRequiresRecordedBinaries(t *testing.T) {
	const recorded = "/opt/homebrew/opt/git/bin/git"
	for _, tc := range []struct {
		name, record string
		create       bool
		want         bool
	}{
		{name: "missing recorded binary with unrelated PATH git", record: `["` + recorded + `"]`},
		{name: "missing binary record with unrelated PATH git"},
		{name: "malformed record with unrelated PATH git", record: `invalid`},
		{name: "valid installed binary", record: `["` + recorded + `"]`, create: true, want: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("PATH", "/unrelated")
			fsys := fs.NewMemFS()
			if err := fsys.MkdirAll("/unrelated", 0755); err != nil {
				t.Fatal(err)
			}
			if err := fsys.WriteFile("/unrelated/git", []byte("#!/bin/sh\n"), 0755); err != nil {
				t.Fatal(err)
			}
			if tc.create {
				if err := fsys.MkdirAll(filepath.Dir(recorded), 0755); err != nil {
					t.Fatal(err)
				}
				if err := fsys.WriteFile(recorded, []byte("#!/bin/sh\n"), 0755); err != nil {
					t.Fatal(err)
				}
			}
			orch := NewOrchestrator(logger.New(logger.Config{Writer: io.Discard}), fsys, exec.NewMockRunner(), nil, installer.NewRegistry())
			tool := &config.ToolConfig{Name: "git", InstallationMethod: "brew", Binaries: testutil.DeclaredBinaries("git")}
			record := &registry.ToolInstallationRecord{ToolName: "git", BinaryPaths: tc.record}
			if got := orch.isExistingInstallationHealthy(context.Background(), "git", record, tool, &config.ProjectConfig{}); got != tc.want {
				t.Fatalf("healthy = %t, want %t", got, tc.want)
			}
		})
	}
}

func TestPackageIdentitySurvivesConfigurationChanges(t *testing.T) {
	ctx := context.Background()
	conn, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	reg := registry.NewRegistry(conn)
	identity := &installer.PackageIdentity{Name: "original", Manager: "bun", Sudo: true}
	inst := &bundleInstaller{packageIdentity: identity}
	instances := installer.NewRegistry()
	if err := instances.Register(inst); err != nil {
		t.Fatal(err)
	}
	orch := NewOrchestrator(nil, newMemFS(), exec.NewMockRunner(), reg, instances)
	cfg := &config.ProjectConfig{Paths: config.PathsConfig{HomeDir: "/home/user", TargetDir: "/home/user/bin", BinariesDir: "/home/user/binaries"}}
	tool := &config.ToolConfig{Name: "alias", InstallationMethod: "bundle"}
	if err := orch.InstallTool(ctx, tool, cfg); err != nil {
		t.Fatal(err)
	}
	rec, err := reg.GetToolInstallation(ctx, tool.Name)
	if err != nil || rec.PackageIdentity == nil {
		t.Fatalf("record = %+v, error %v", rec, err)
	}
	tool.InstallationMethod = "different-method"
	tool.InstallParams = map[string]interface{}{"package": "changed"}
	if err := orch.UninstallTool(ctx, tool, cfg); err != nil {
		t.Fatal(err)
	}
	if len(inst.uninstalled) != 1 || inst.uninstalled[0].Package == nil || *inst.uninstalled[0].Package != *identity {
		t.Fatalf("uninstall identity = %+v", inst.uninstalled)
	}
}

func TestBrewAppWithoutBinariesInstallsOnce(t *testing.T) {
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()
	installs := 0
	runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
		if c.Args[0] == "install" {
			installs++
		}
		if c.Args[0] == "info" {
			c.SetOutput([]byte(`{"casks":[{"token":"example","version":"1.0","installed":"1.0","artifacts":[{"app":["Example.app"]}]}]}`))
		}
		return nil
	})
	database, err := db.NewConnection(ctx, "file:"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	reg := registry.NewRegistry(database)
	instReg := installer.NewRegistry()
	if err := instReg.Register(installer.NewBrewInstaller(runner, fsys, &installer.SystemContext{OS: "darwin", Arch: "arm64"})); err != nil {
		t.Fatal(err)
	}
	orch := NewOrchestrator(logger.New(logger.Config{Writer: io.Discard}), fsys, runner, reg, instReg)
	project := &config.ProjectConfig{Paths: config.PathsConfig{HomeDir: "/home/test", DotfilesDir: "/home/test/dotfiles", TargetDir: "/home/test/.bin", BinariesDir: "/home/test/.binaries", GeneratedDir: "/home/test/.generated"}}
	tool := &config.ToolConfig{Name: "example", InstallationMethod: "brew", InstallParams: map[string]interface{}{"cask": true}}
	for range 2 {
		if err := orch.InstallTool(ctx, tool, project); err != nil {
			t.Fatal(err)
		}
	}
	if installs != 1 {
		t.Fatalf("brew installs = %d, want 1", installs)
	}
	record, err := reg.GetToolInstallation(ctx, tool.Name)
	if err != nil {
		t.Fatal(err)
	}
	if record == nil {
		t.Fatal("installation not recorded")
	}
	var binaries []string
	if err := json.Unmarshal([]byte(record.BinaryPaths), &binaries); err != nil {
		t.Fatal(err)
	}
	if len(binaries) != 0 {
		t.Fatalf("app-only install recorded binaries: %v", binaries)
	}
	for _, path := range []string{filepath.Join(project.Paths.TargetDir, tool.Name), filepath.Join(project.Paths.BinariesDir, tool.Name, "external", tool.Name)} {
		if exists, err := fsys.Exists(path); err != nil || exists {
			t.Fatalf("phantom binary %s: exists=%t, err=%v", path, exists, err)
		}
	}
}

func TestExternalInstallReportsRelinkingFailures(t *testing.T) {
	for _, failure := range []struct{ operation, path string }{
		{"remove", "/home/user/.generated/binaries/external/external/executable"},
		{"symlink", "/home/user/.generated/binaries/external/external/executable"},
		{"remove", "/home/user/.generated/binaries/external/current"},
	} {
		t.Run(failure.operation+failure.path, func(t *testing.T) {
			o, mem := declFixture(t)
			o.fs = &artifactFailureFS{FS: mem, operation: failure.operation, path: failure.path, err: os.ErrPermission}
			if err := o.instRegistry.Register(&mockInstaller{name: "brew", binaries: []string{"/external/executable"}}); err != nil {
				t.Fatal(err)
			}
			tool := &config.ToolConfig{Name: "external", InstallationMethod: "brew"}
			if err := o.InstallTool(context.Background(), tool, declProjectConfig()); !errors.Is(err, os.ErrPermission) {
				t.Fatalf("lost relink failure: %v", err)
			}
			receipt, err := o.reg.GetToolInstallation(context.Background(), tool.Name)
			if err != nil || receipt != nil {
				t.Fatalf("failed installation was recorded: %+v, %v", receipt, err)
			}
		})
	}
}

func TestInstallToolExternallyManaged(t *testing.T) {
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)

	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	npmInst := &mockInstaller{
		name:     "npm",
		binaries: []string{"/home/test/.cache/.bun/bin/tokscale"},
	}
	_ = instReg.Register(npmInst)

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
		Name:               "tokscale",
		InstallationMethod: "npm",
		Binaries:           testutil.DeclaredBinaries("tokscale"),
	}

	// Create global binary in memFS
	_ = memFS.MkdirAll("/home/test/.cache/.bun/bin", 0755)
	_ = memFS.WriteFile("/home/test/.cache/.bun/bin/tokscale", []byte("binary-content"), 0755)

	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	shimPath := "/home/test/.bin/tokscale"
	exists, err := memFS.Exists(shimPath)
	if err != nil || !exists {
		t.Fatalf("Expected shim at %s to exist", shimPath)
	}

	shimBytes, err := memFS.ReadFile(shimPath)
	if err != nil {
		t.Fatalf("Failed to read shim: %v", err)
	}
	if !strings.Contains(string(shimBytes), `TOOL_EXECUTABLE=/home/test/.cache/.bun/bin/tokscale`) {
		t.Errorf("Shim content missing correct TOOL_EXECUTABLE path:\n%s", string(shimBytes))
	}

	// Verify health check
	instRecord, err := reg.GetToolInstallation(ctx, "tokscale")
	if err != nil || instRecord == nil {
		t.Fatalf("Expected installation record in DB")
	}

	if !orch.isExistingInstallationHealthy(ctx, "tokscale", instRecord, tool, projCfg) {
		t.Errorf("Expected isExistingInstallationHealthy to return true for externally managed tool")
	}

	// Verify GenerateTool retains binary path from DB registry
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool failed: %v", err)
	}

	shimBytesAfterGen, err := memFS.ReadFile(shimPath)
	if err != nil {
		t.Fatalf("Failed to read shim after GenerateTool: %v", err)
	}
	if !strings.Contains(string(shimBytesAfterGen), `TOOL_EXECUTABLE=/home/test/.cache/.bun/bin/tokscale`) {
		t.Errorf("GenerateTool broke TOOL_EXECUTABLE path in shim:\n%s", string(shimBytesAfterGen))
	}
}
