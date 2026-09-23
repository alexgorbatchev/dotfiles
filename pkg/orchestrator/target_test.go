package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

// hookToolReportingSystemInfo writes a tool file whose after-install hook records the
// systemInfo it was given, and returns a configuration pointing at it.
func hookToolReportingSystemInfo(t *testing.T) *config.ToolConfig {
	t.Helper()

	dir := t.TempDir()
	toolPath := filepath.Join(dir, "probe.tool.ts")
	body := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem, systemInfo }) => {
				await fileSystem.writeFile("/captured", JSON.stringify(systemInfo));
			}),
		);
	`
	if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}
	return &config.ToolConfig{
		Name:           "probe",
		ConfigFilePath: toolPath,
		InstallParams:  map[string]any{"hooks": []any{vm.HookAfterInstall}},
	}
}

// targetRecordingInstaller is an installation method that remembers the target it was
// configured with, which is the contract SetSystemContext exists to satisfy.
type targetRecordingInstaller struct {
	sysCtx *installer.SystemContext
}

func (r *targetRecordingInstaller) Name() string { return "target-recording" }

func (r *targetRecordingInstaller) SupportsSudo() bool { return false }

func (r *targetRecordingInstaller) SetSystemContext(sysCtx *installer.SystemContext) {
	r.sysCtx = sysCtx
}

func (r *targetRecordingInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{}, nil
}

func (r *targetRecordingInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (r *targetRecordingInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

// An installer is told the target the run was invoked for, alongside the file system,
// the logger and the credentials it is given. Without it the installers built their own
// context from the host and downloaded the host's asset into a configuration that had
// been resolved for another machine.
func TestInstallToolGivesTheInstallerTheRunsTarget(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("opening the registry database: %v", err)
	}
	defer database.Close()

	recorder := &targetRecordingInstaller{}
	instReg := installer.NewRegistry()
	if err := instReg.Register(recorder); err != nil {
		t.Fatalf("registering the recording installer: %v", err)
	}

	orch := NewOrchestrator(
		logger.New(logger.Config{Writer: io.Discard}),
		memFS,
		exec.NewMockRunner(),
		registry.NewRegistry(database),
		instReg,
	)
	target := vm.Target{OS: "linux", Arch: "arm64", Libc: "musl"}
	orch.SetTarget(target)

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
	tool := &config.ToolConfig{Name: "probe", InstallationMethod: recorder.Name()}

	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool returned error: %v", err)
	}

	if recorder.sysCtx == nil {
		t.Fatal("the installer was never told which target to install for")
	}
	want := installer.SystemContext{OS: target.OS, Arch: target.Arch, Libc: target.Libc}
	if *recorder.sysCtx != want {
		t.Errorf("installer was configured for %+v, want %+v", *recorder.sysCtx, want)
	}
}

// A lifecycle hook runs for the target the run was invoked for. With the hardcoded zero
// target it described the host, so a hook branching on the platform took the host's
// branch while the configuration around it had been resolved for another machine.
//
// Both targets are exercised so that the assertion is about the target the orchestrator
// was given rather than about the host the test happens to run on.
func TestRunHooksUsesTheRunsTarget(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name         string
		target       vm.Target
		wantPlatform int
		wantArch     int
	}{
		{
			name:         "linux arm64 musl",
			target:       vm.Target{OS: "linux", Arch: "arm64", Libc: "musl"},
			wantPlatform: config.PlatformLinux,
			wantArch:     config.ArchArm64,
		},
		{
			name:         "darwin amd64",
			target:       vm.Target{OS: "darwin", Arch: "amd64", Libc: "unknown"},
			wantPlatform: config.PlatformMacOS,
			wantArch:     config.ArchX86_64,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			orch.SetTarget(tt.target)

			projCfg := &config.ProjectConfig{}
			projCfg.Paths.DotfilesDir = "/home/user"
			projCfg.Paths.GeneratedDir = "/home/user/.generated"
			projCfg.Paths.BinariesDir = "/home/user/.generated/binaries"
			projCfg.Paths.HomeDir = "/home/user"

			err := orch.runHooks(context.Background(), vm.HookAfterInstall, hookToolReportingSystemInfo(t), projCfg, vm.HookContext{})
			if err != nil {
				t.Fatalf("runHooks returned error: %v", err)
			}

			captured, err := memFS.ReadFile("/captured")
			if err != nil {
				t.Fatalf("the hook wrote nothing: %v", err)
			}
			var got struct {
				Platform int    `json:"platform"`
				Arch     int    `json:"arch"`
				Libc     string `json:"libc"`
			}
			if err := json.Unmarshal(captured, &got); err != nil {
				t.Fatalf("the hook wrote %q, which is not JSON: %v", captured, err)
			}

			if got.Platform != tt.wantPlatform {
				t.Errorf("systemInfo.platform = %d, want the Platform member %d", got.Platform, tt.wantPlatform)
			}
			if got.Arch != tt.wantArch {
				t.Errorf("systemInfo.arch = %d, want the Architecture member %d", got.Arch, tt.wantArch)
			}
			if got.Libc != tt.target.Libc {
				t.Errorf("systemInfo.libc = %q, want %q", got.Libc, tt.target.Libc)
			}
		})
	}
}
