package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func developmentFixture(t *testing.T) (*Orchestrator, fs.FS, *config.ProjectConfig, *config.ToolConfig, *devtools.Record) {
	t.Helper()
	mem := newMemFS()
	o := newTestOrchestrator(t, mem, "/project/dotfiles.config.ts")
	project := &config.ProjectConfig{Paths: config.PathsConfig{
		HomeDir: "/home/user", DotfilesDir: "/project", GeneratedDir: "/project/.generated",
		BinariesDir: "/project/.generated/binaries", TargetDir: "/project/.generated/bin",
	}}
	tool := &config.ToolConfig{Name: "example", InstallationMethod: "must-not-run", Binaries: testutil.DeclaredBinaries("example")}
	for _, dir := range []string{"/build", filepath.Join(project.Paths.BinariesDir, tool.Name, "current")} {
		if err := mem.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := mem.WriteFile("/build/example", []byte("development binary"), 0755); err != nil {
		t.Fatal(err)
	}
	record, err := o.developmentStore(project).Use(context.Background(), tool.Name, devtools.UseOptions{
		Binaries: map[string]string{"example": "/build/example"}, Version: "dev.local",
	})
	if err != nil {
		t.Fatal(err)
	}
	return o, mem, project, tool, record
}

func TestDevelopmentOverrideSurvivesReleaseMaintenance(t *testing.T) {
	for _, force := range []bool{false, true} {
		t.Run(map[bool]string{false: "normal", true: "force"}[force], func(t *testing.T) {
			o, mem, project, tool, record := developmentFixture(t)
			ctx := config.WithForce(context.Background(), force)
			release := filepath.Join(project.Paths.BinariesDir, tool.Name, "current", "example")
			if err := mem.WriteFile(release, []byte("release binary"), 0755); err != nil {
				t.Fatal(err)
			}
			if err := o.reg.WithTx(ctx, func(tx *sql.Tx) error {
				return o.reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{ToolName: tool.Name, Version: "latest", InstallPath: filepath.Dir(release), InstalledAt: 1})
			}); err != nil {
				t.Fatal(err)
			}
			for _, action := range []func() error{
				func() error { return o.InstallTool(ctx, tool, project) },
				func() error { return o.UninstallTool(ctx, tool, project) },
				func() error { return o.CleanupOrphanedTools(ctx, nil, project) },
				func() error { return o.CleanupStaleArtifacts(ctx, []*config.ToolConfig{{Name: tool.Name}}, project) },
			} {
				if err := action(); err != nil {
					t.Fatal(err)
				}
			}
			for path, want := range map[string]string{release: "release binary", record.Binaries["example"]: "development binary"} {
				got, err := mem.ReadFile(path)
				if err != nil || string(got) != want {
					t.Fatalf("%s = %q, %v", path, got, err)
				}
			}
			shim, err := mem.ReadFile(filepath.Join(project.Paths.TargetDir, "example"))
			if err != nil || !strings.Contains(string(shim), record.Binaries["example"]) {
				t.Fatalf("development shim lost: %s, %v", shim, err)
			}
			receipt, err := o.reg.GetToolInstallation(ctx, tool.Name)
			if err != nil || receipt == nil || receipt.Version != "latest" || receipt.InstalledAt != 1 {
				t.Fatalf("release receipt changed: %#v, %v", receipt, err)
			}
			if err := o.developmentStore(project).Off(ctx, tool.Name); err != nil {
				t.Fatal(err)
			}
			if err := o.GenerateTool(ctx, tool, project); err != nil {
				t.Fatal(err)
			}
			shim, err = mem.ReadFile(filepath.Join(project.Paths.TargetDir, "example"))
			if err != nil || !strings.Contains(string(shim), release) || strings.Contains(string(shim), record.Binaries["example"]) {
				t.Fatalf("release routing not restored: %s, %v", shim, err)
			}
		})
	}
}

func TestDevelopmentOverrideWithoutReceiptAndMissingPayload(t *testing.T) {
	o, mem, project, tool, record := developmentFixture(t)
	ctx := context.Background()
	if err := o.GenerateTool(ctx, tool, project); err != nil {
		t.Fatal(err)
	}
	// A changed declaration must not erase a development shim during stale cleanup.
	if err := o.CleanupStaleShims(ctx, []*config.ToolConfig{{Name: tool.Name}}, project); err != nil {
		t.Fatal(err)
	}
	if err := mem.Remove(record.Binaries["example"]); err != nil {
		t.Fatal(err)
	}
	if err := o.InstallTool(config.WithForce(ctx, true), tool, project); err == nil || !strings.Contains(err.Error(), "tool dev off example") {
		t.Fatalf("missing payload: %v", err)
	}
	if err := o.UninstallTool(ctx, tool, project); err != nil {
		t.Fatal(err)
	}
	if err := o.CleanupOrphanedTools(ctx, nil, project); err != nil {
		t.Fatal(err)
	}
	if active, err := o.DevelopmentOverride(tool.Name, project); err != nil || active == nil {
		t.Fatalf("missing payload lost protection: %#v, %v", active, err)
	}
	if exists, _ := mem.Exists(filepath.Join(project.Paths.TargetDir, "example")); !exists {
		t.Fatal("development shim removed")
	}
}

func TestDevelopmentOverridesProtectLeftoversAndRejectCorruptMetadata(t *testing.T) {
	o, mem, project, tool, record := developmentFixture(t)
	ctx := context.Background()
	release := filepath.Join(project.Paths.BinariesDir, tool.Name, "current", "example")
	if err := mem.WriteFile(release, []byte("legacy release"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := o.CleanupOrphanedTools(ctx, nil, project); err != nil {
		t.Fatal(err)
	}
	if exists, _ := mem.Exists(release); !exists {
		t.Fatal("protected leftover deleted")
	}
	manifest := filepath.Join(filepath.Dir(filepath.Dir(record.Binaries["example"])), "active.json")
	if err := mem.WriteFile(manifest, []byte("bad json"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, action := range []func() error{
		func() error { return o.InstallTool(ctx, tool, project) },
		func() error { return o.UninstallTool(ctx, tool, project) },
		func() error { return o.CleanupOrphanedTools(ctx, nil, project) },
		func() error { return o.CleanupStaleShims(ctx, []*config.ToolConfig{tool}, project) },
	} {
		if err := action(); err == nil {
			t.Fatal("corrupt override was ignored")
		}
	}
	if exists, _ := mem.Exists(release); !exists {
		t.Fatal("release deleted after inspection failed")
	}
}

func TestDevelopmentCLIWithoutToolConfigurationUsesDurableInvocation(t *testing.T) {
	o, mem, project, _, _ := developmentFixture(t)
	t.Setenv("DOTFILES_REPO_ROOT", "")
	t.Setenv("DOTFILES_CLI_COMMAND", "")
	ctx := context.Background()
	if err := mem.WriteFile("/build/dotfiles", []byte("development cli"), 0755); err != nil {
		t.Fatal(err)
	}
	record, err := o.developmentStore(project).Use(ctx, "dotfiles", devtools.UseOptions{Binaries: map[string]string{"dotfiles": "/build/dotfiles"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := o.GenerateTools(ctx, nil, project); err != nil {
		t.Fatal(err)
	}
	shim, err := mem.ReadFile(filepath.Join(project.Paths.TargetDir, "dotfiles"))
	if err != nil || !strings.Contains(string(shim), record.Binaries["dotfiles"]) {
		t.Fatalf("internal CLI shim = %s, %v", shim, err)
	}
	if args := o.cliArgsForProject(project); len(args) != 1 || args[0] != record.Binaries["dotfiles"] {
		t.Fatalf("CLI invocation = %v", args)
	}
	t.Setenv("DOTFILES_CLI_COMMAND", "/explicit/cli")
	if args := o.cliArgsForProject(project); args[0] != "/explicit/cli" {
		t.Fatalf("explicit override ignored: %v", args)
	}
}

func TestDevelopmentOverrideRequiresNewlyDeclaredBinary(t *testing.T) {
	o, mem, project, tool, _ := developmentFixture(t)
	tool.Binaries = append(tool.Binaries, testutil.DeclaredBinaries("added")...)
	if err := o.GenerateTool(context.Background(), tool, project); err == nil || !strings.Contains(err.Error(), "no executable added") {
		t.Fatalf("missing mapping = %v", err)
	}
	if exists, _ := mem.Exists(filepath.Join(project.Paths.TargetDir, "example")); exists {
		t.Fatal("partial shim generation on invalid override")
	}
}

func TestMaintenanceWaitsForDevelopmentTransition(t *testing.T) {
	o, _, project, tool, _ := developmentFixture(t)
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		done <- o.developmentStore(project).WithLock(context.Background(), tool.Name, func(context.Context) error {
			close(entered)
			<-release
			return nil
		})
	}()
	<-entered
	t.Cleanup(func() {
		close(release)
		if err := <-done; err != nil {
			t.Error(err)
		}
	})
	for _, test := range []struct {
		name string
		run  func(context.Context) error
	}{
		{"forced installation", func(ctx context.Context) error { return o.InstallTool(config.WithForce(ctx, true), tool, project) }},
		{"uninstall", func(ctx context.Context) error { return o.UninstallTool(ctx, tool, project) }},
		{"generation", func(ctx context.Context) error { return o.GenerateTool(ctx, tool, project) }},
		{"stale cleanup", func(ctx context.Context) error { return o.CleanupStaleShims(ctx, []*config.ToolConfig{tool}, project) }},
		{"orphan cleanup", func(ctx context.Context) error { return o.CleanupOrphanedTools(ctx, nil, project) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
			defer cancel()
			if err := test.run(ctx); !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("maintenance bypassed the development transition lock: %v", err)
			}
		})
	}
}

func TestCorruptDevelopmentCLIContinuesGeneratingOtherTools(t *testing.T) {
	o, mem, project, tool, _ := developmentFixture(t)
	manifestDir := filepath.Join(project.Paths.GeneratedDir, "dev-tools", "dotfiles")
	if err := mem.MkdirAll(manifestDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := mem.WriteFile(filepath.Join(manifestDir, "active.json"), []byte("bad json"), 0600); err != nil {
		t.Fatal(err)
	}
	err := o.GenerateTools(context.Background(), []*config.ToolConfig{tool}, project)
	if err == nil || !strings.Contains(err.Error(), "decoding development override for dotfiles") {
		t.Fatalf("corruption not reported: %v", err)
	}
	if exists, _ := mem.Exists(filepath.Join(project.Paths.TargetDir, "example")); !exists {
		t.Fatal("corrupt CLI stopped unrelated generation")
	}
}

func TestDevelopmentAutoInstallIgnoresReleaseReceiptFailure(t *testing.T) {
	o, mem, project, tool, record := developmentFixture(t)
	tool.InstallParams = map[string]interface{}{"auto": true}
	// A corrupt release receipt must not be consulted to route a dev executable.
	if err := o.reg.WithTx(context.Background(), func(tx *sql.Tx) error { _, err := tx.Exec("DROP TABLE tool_installations"); return err }); err != nil {
		t.Fatal(err)
	}
	if skip, err := o.shouldSkipInstallation(config.WithForce(context.Background(), true), tool, project); err != nil || !skip {
		t.Fatalf("dev auto-install consulted release state: skip=%v err=%v", skip, err)
	}
	if err := o.GenerateTool(context.Background(), tool, project); err != nil {
		t.Fatal(err)
	}
	data, err := mem.ReadFile(filepath.Join(project.Paths.TargetDir, "example"))
	if err != nil || !strings.Contains(string(data), record.Binaries["example"]) {
		t.Fatalf("routing: %s, %v", data, err)
	}
}
