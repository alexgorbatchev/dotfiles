package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// TestPlanUpdate_TargetVersion pins which version an update installs. A tool whose
// installer cannot check upstream has no version to ask for; the target is then empty,
// so the installation records what the installer detects or a fresh timestamp, as v1's
// installer did, instead of the version recorded by the previous installation. A tool
// whose configuration pins a version is refused before this is asked
// (cmd/dotfiles TestUpdateCommand_RefusesPinnedTools).
func TestPlanUpdate_TargetVersion(t *testing.T) {
	latestTag, constraint := "latest", "<2.0.0"
	tests := []struct {
		name      string
		tool      *config.ToolConfig
		installed string
		res       *installer.UpdateCheckResult
		want      string
	}{
		{
			name:      "an installable upstream release is installed",
			tool:      &config.ToolConfig{Name: "gh"},
			installed: "v1.0.0",
			res:       &installer.UpdateCheckResult{LatestVersion: "v2.0.0"},
			want:      "v2.0.0",
		},
		{
			name:      "a rolling latest release does not reuse the receipt timestamp",
			tool:      &config.ToolConfig{Name: "rolling"},
			installed: "2000-01-01-00-00-00",
			res:       &installer.UpdateCheckResult{LatestVersion: "latest"},
			want:      "latest",
		},
		{
			name:      "a named rolling release preserves its upstream tag",
			tool:      &config.ToolConfig{Name: "nightly"},
			installed: "2000-01-01-00-00-00",
			res:       &installer.UpdateCheckResult{LatestVersion: "nightly"},
			want:      "nightly",
		},
		{
			name:      "a release the constraint excludes reinstalls the installed one",
			tool:      &config.ToolConfig{Name: "gh", UpdateCheck: &config.ToolConfigUpdateCheck{Constraint: &constraint}},
			installed: "v1.0.0",
			res:       &installer.UpdateCheckResult{LatestVersion: "v2.0.0"},
			want:      "v1.0.0",
		},
		{
			name:      "an installed version ahead of the latest release is reinstalled, not downgraded",
			tool:      &config.ToolConfig{Name: "tauri-cli"},
			installed: "3.0.0-alpha.2",
			res:       &installer.UpdateCheckResult{LatestVersion: "2.11.6"},
			want:      "3.0.0-alpha.2",
		},
		{
			name:      "an unpinned tool nothing could check does not reuse its recorded timestamp",
			tool:      &config.ToolConfig{Name: "stamped"},
			installed: "2000-01-01-00-00-00",
			want:      "",
		},
		{
			name:      "an unpinned tool nothing could check does not reuse its recorded version",
			tool:      &config.ToolConfig{Name: "detected"},
			installed: "1.0.0",
			want:      "",
		},
		{
			name:      "latest is not a pin",
			tool:      &config.ToolConfig{Name: "stamped", Version: &latestTag},
			installed: "2000-01-01-00-00-00",
			want:      "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// A tool with no answer from upstream is one whose installer cannot check.
			var checkErr error
			if tt.res == nil {
				checkErr = installer.ErrUpdateCheckUnsupported
			}
			plan, err := PlanUpdate(tt.tool, tt.installed, tt.res, checkErr, true)
			if err != nil {
				t.Fatalf("PlanUpdate: %v", err)
			}
			if plan.TargetVersion != tt.want {
				t.Fatalf("PlanUpdate target = %q, want %q", plan.TargetVersion, tt.want)
			}
		})
	}
}

// TestPlanUpdate pins how an update reads its installer's answer: a failed check is an
// error naming the tool and keeping the cause, never a plan, while
// installer.ErrUpdateCheckUnsupported plans a reinstall that asks for no version.
func TestPlanUpdate(t *testing.T) {
	t.Parallel()
	tool := &config.ToolConfig{Name: "gh", InstallationMethod: "manual"}
	queryErr := errors.New("API rate limit exceeded")
	tests := []struct {
		name          string
		installed     string
		res           *installer.UpdateCheckResult
		checkErr      error
		force         bool
		want          UpdatePlan
		wantReinstall bool
		wantErr       error
	}{
		{
			name:     "a failed check is an error",
			checkErr: queryErr,
			wantErr:  queryErr,
		},
		{
			// The same answer tool check reports as a failed check, never "up to date".
			name:    "an installer that answers nothing is an error",
			wantErr: errNoCheckResult,
		},
		{
			name:          "an unsupported check reinstalls without a target",
			checkErr:      fmt.Errorf("manual: %w", installer.ErrUpdateCheckUnsupported),
			want:          UpdatePlan{Status: CheckStatusUnsupported, InstalledVersion: "1.0.0"},
			wantReinstall: true,
		},
		{
			name:          "a newer release is installed",
			res:           &installer.UpdateCheckResult{LatestVersion: "2.0.0"},
			want:          UpdatePlan{Status: CheckStatusUpdateAvailable, InstalledVersion: "1.0.0", LatestVersion: "2.0.0", TargetVersion: "2.0.0"},
			wantReinstall: true,
		},
		{
			name: "the installed release is left alone",
			res:  &installer.UpdateCheckResult{LatestVersion: "1.0.0"},
			want: UpdatePlan{Status: CheckStatusUpToDate, InstalledVersion: "1.0.0", LatestVersion: "1.0.0", TargetVersion: "1.0.0"},
		},
		{
			name:          "force reinstalls the installed release",
			res:           &installer.UpdateCheckResult{LatestVersion: "1.0.0"},
			force:         true,
			want:          UpdatePlan{Status: CheckStatusUpToDate, Force: true, InstalledVersion: "1.0.0", LatestVersion: "1.0.0", TargetVersion: "1.0.0"},
			wantReinstall: true,
		},
		// An installed version newer than the latest release is neither replaced by the
		// older release nor reported as current (#130).
		{
			name:      "an installed version ahead of the latest release is left alone",
			installed: "3.0.0-alpha.2",
			res:       &installer.UpdateCheckResult{LatestVersion: "2.11.6"},
			want:      UpdatePlan{Status: CheckStatusAheadOfLatest, InstalledVersion: "3.0.0-alpha.2", LatestVersion: "2.11.6", TargetVersion: "3.0.0-alpha.2"},
		},
		{
			name:          "force reinstalls an installed version ahead of the latest release, never the older release",
			installed:     "3.0.0-alpha.2",
			res:           &installer.UpdateCheckResult{LatestVersion: "2.11.6"},
			force:         true,
			want:          UpdatePlan{Status: CheckStatusAheadOfLatest, Force: true, InstalledVersion: "3.0.0-alpha.2", LatestVersion: "2.11.6", TargetVersion: "3.0.0-alpha.2"},
			wantReinstall: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			installed := tt.installed
			if installed == "" {
				installed = "1.0.0"
			}
			got, err := PlanUpdate(tool, installed, tt.res, tt.checkErr, tt.force)
			if tt.wantErr != nil {
				want := `checking update for "gh": ` + tt.wantErr.Error()
				if !errors.Is(err, tt.wantErr) || err.Error() != want {
					t.Fatalf("PlanUpdate error = %v, want %q wrapping the check's error", err, want)
				}
				return
			}
			if err != nil {
				t.Fatalf("PlanUpdate: %v", err)
			}
			if got != tt.want {
				t.Errorf("PlanUpdate = %+v, want %+v", got, tt.want)
			}
			if got.Reinstall() != tt.wantReinstall {
				t.Errorf("Reinstall() = %t, want %t", got.Reinstall(), tt.wantReinstall)
			}
		})
	}
}

// TestUpdatePlan_Messages pins what an update says about a reinstall, which the CLI and
// the dashboard both print.
func TestUpdatePlan_Messages(t *testing.T) {
	t.Parallel()
	tool := &config.ToolConfig{Name: "gh", InstallationMethod: "manual"}
	tests := []struct {
		name             string
		plan             UpdatePlan
		wantAnnouncement string
		wantTarget       string
		wantCompletion   string
	}{
		{
			name:             "unsupported",
			plan:             UpdatePlan{Status: CheckStatusUnsupported},
			wantAnnouncement: `Update check not supported for installer "manual", performing regular install instead`,
			wantCompletion:   "Successfully updated to version 2026-01-01-00-00-00",
		},
		{
			name:             "new version",
			plan:             UpdatePlan{Status: CheckStatusUpdateAvailable, InstalledVersion: "1.0.0", LatestVersion: "2.0.0", TargetVersion: "2.0.0"},
			wantAnnouncement: "New version available: 1.0.0 -> 2.0.0",
			wantTarget:       " to version 2.0.0",
			wantCompletion:   "Successfully updated to version 2.0.0",
		},
		{
			name:             "forced",
			plan:             UpdatePlan{Status: CheckStatusUpToDate, Force: true, InstalledVersion: "1.0.0", LatestVersion: "1.0.0", TargetVersion: "1.0.0"},
			wantAnnouncement: "Force updating: reinstalling version 1.0.0",
			wantTarget:       " to version 1.0.0",
			wantCompletion:   "Successfully reinstalled version 1.0.0",
		},
		{
			name:             "forced ahead of the latest release",
			plan:             UpdatePlan{Status: CheckStatusAheadOfLatest, Force: true, InstalledVersion: "3.0.0-alpha.2", LatestVersion: "2.11.6", TargetVersion: "3.0.0-alpha.2"},
			wantAnnouncement: "Force updating: reinstalling installed version 3.0.0-alpha.2, which is ahead of the latest known version (2.11.6)",
			wantTarget:       " to version 3.0.0-alpha.2",
			wantCompletion:   "Successfully reinstalled version 3.0.0-alpha.2",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := tt.plan.Announcement(tool); got != tt.wantAnnouncement {
				t.Errorf("Announcement = %q, want %q", got, tt.wantAnnouncement)
			}
			if got := tt.plan.TargetDescription(); got != tt.wantTarget {
				t.Errorf("TargetDescription = %q, want %q", got, tt.wantTarget)
			}
			recorded := tt.plan.TargetVersion
			if recorded == "" {
				recorded = "2026-01-01-00-00-00"
			}
			if got := tt.plan.Completion(recorded); got != tt.wantCompletion {
				t.Errorf("Completion(%q) = %q, want %q", recorded, got, tt.wantCompletion)
			}
		})
	}
}

// TestOrchestrator_ApplyUpdate pins that an update installs its target over a healthy
// installation, which an unforced InstallTool would skip as already installed, records
// that version, and leaves the tool configuration it was given untouched.
func TestOrchestrator_ApplyUpdate(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	mockInst := &mockInstaller{name: "github-release", binaries: []string{"gh"}}
	_ = instReg.Register(mockInst)
	orch := NewOrchestrator(nil, fsys, exec.NewMockRunner(), reg, instReg)
	orch.SetSymlinkFS(fsys)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
	latest := "latest"
	tool := &config.ToolConfig{
		Name:               "gh",
		Version:            &latest,
		InstallationMethod: "github-release",
		InstallParams:      map[string]any{"repo": "cli/cli"},
		Binaries:           testutil.DeclaredBinaries("gh"),
	}
	installed := tool.WithRequestedVersion("1.0.0")
	if err := orch.InstallTool(ctx, installed, projCfg); err != nil {
		t.Fatalf("installing 1.0.0: %v", err)
	}
	// The mock installer writes nothing, so the binary a healthy installation has is
	// put where the already-installed check looks for it.
	currentBinary := filepath.Join(projCfg.Paths.BinariesDir, "gh", "current", "gh")
	if err := fsys.MkdirAll(filepath.Dir(currentBinary), 0755); err != nil {
		t.Fatalf("creating the current directory: %v", err)
	}
	if err := fsys.WriteFile(currentBinary, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatalf("writing the installed binary: %v", err)
	}
	baseline := mockInst.installCount
	if err := orch.InstallTool(ctx, installed, projCfg); err != nil {
		t.Fatalf("installing 1.0.0 again: %v", err)
	}
	if mockInst.installCount != baseline {
		t.Fatalf("an unforced install of the healthy 1.0.0 installation ran the installer; the test needs one it skips")
	}

	for _, target := range []string{"1.0.0", "2.0.0"} {
		installs := mockInst.installCount
		recorded, err := orch.ApplyUpdate(ctx, tool, projCfg, UpdatePlan{Status: CheckStatusUpToDate, Force: true, InstalledVersion: "1.0.0", TargetVersion: target})
		if err != nil {
			t.Fatalf("ApplyUpdate to %s: %v", target, err)
		}
		if got := mockInst.installCount - installs; got != 1 {
			t.Errorf("ApplyUpdate to %s installed %d time(s), want 1 even over a healthy installation", target, got)
		}
		if recorded != target {
			t.Errorf("ApplyUpdate to %s recorded %q", target, recorded)
		}
	}
	if tool.Version == nil || *tool.Version != latest || tool.InstallParams["version"] != nil {
		t.Errorf("tool configuration = %+v, want it untouched by the update", tool)
	}
	if reported, err := orch.ApplyUpdate(config.WithDryRun(ctx, true), tool, projCfg, UpdatePlan{Status: CheckStatusUpdateAvailable, TargetVersion: "3.0.0"}); err != nil || reported != "3.0.0" {
		t.Fatalf("dry-run update reports %q, %v; want target 3.0.0", reported, err)
	}
	if record, err := reg.GetToolInstallation(ctx, tool.Name); err != nil || record == nil || record.Version != "2.0.0" {
		t.Fatalf("dry-run update changed prior receipt: %+v, %v", record, err)
	}

	mockInst.err = errors.New("download failed")
	if _, err := orch.ApplyUpdate(ctx, tool, projCfg, UpdatePlan{Status: CheckStatusUpdateAvailable, TargetVersion: "3.0.0"}); !errors.Is(err, mockInst.err) {
		t.Errorf("ApplyUpdate error = %v, want the installer's %v", err, mockInst.err)
	}
}
