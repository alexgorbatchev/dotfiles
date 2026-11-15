package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// TestClassifyCheck pins the status a check reports for an installed tool, the one
// tool check, tool update and the dashboard all act on: an installed version newer than
// the latest release is ahead of it, never up to date or outdated (#130), and a failed
// check is an error rather than a status.
func TestClassifyCheck(t *testing.T) {
	t.Parallel()
	tool := &config.ToolConfig{Name: "tauri-cli", InstallationMethod: "cargo"}
	queryErr := errors.New("crates.io unreachable")
	tests := []struct {
		name      string
		installed string
		res       *installer.UpdateCheckResult
		checkErr  error
		want      CheckResult
		wantErr   error
	}{
		{
			name:      "newer release",
			installed: "2.0.0",
			res:       &installer.UpdateCheckResult{LatestVersion: "2.11.6"},
			want:      CheckResult{Status: CheckStatusUpdateAvailable, InstalledVersion: "2.0.0", LatestVersion: "2.11.6"},
		},
		{
			name:      "installed release",
			installed: "2.11.6",
			res:       &installer.UpdateCheckResult{LatestVersion: "2.11.6", Cached: true},
			want:      CheckResult{Status: CheckStatusUpToDate, InstalledVersion: "2.11.6", LatestVersion: "2.11.6", Cached: true},
		},
		{
			name:      "installed prerelease ahead of the latest release",
			installed: "3.0.0-alpha.2",
			res:       &installer.UpdateCheckResult{LatestVersion: "2.11.6"},
			want:      CheckResult{Status: CheckStatusAheadOfLatest, InstalledVersion: "3.0.0-alpha.2", LatestVersion: "2.11.6"},
		},
		{
			name:      "a package manager reports the version on disk",
			installed: "1.2.3",
			res:       &installer.UpdateCheckResult{Outdated: new(true), LocalVersion: "1.2.3_1", LatestVersion: "1.2.4"},
			want:      CheckResult{Status: CheckStatusUpdateAvailable, InstalledVersion: "1.2.3", LatestVersion: "1.2.4"},
		},
		{
			name:      "unsupported",
			installed: "1.0.0",
			checkErr:  fmt.Errorf("manual: %w", installer.ErrUpdateCheckUnsupported),
			want:      CheckResult{Status: CheckStatusUnsupported, InstalledVersion: "1.0.0"},
		},
		{
			name:      "failed",
			installed: "1.0.0",
			checkErr:  queryErr,
			wantErr:   queryErr,
		},
		{
			name:      "an installer that answers nothing",
			installed: "1.0.0",
			wantErr:   errNoCheckResult,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := ClassifyCheck(tool, tt.installed, tt.res, tt.checkErr)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) || err.Error() != `checking update for "tauri-cli": `+tt.wantErr.Error() {
					t.Fatalf("ClassifyCheck error = %v, want one naming the tool and wrapping %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("ClassifyCheck: %v", err)
			}
			if got != tt.want {
				t.Errorf("ClassifyCheck = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// checkStub is an installer whose update check answers res and err and counts how often
// it was asked.
type checkStub struct {
	mockInstaller
	res   *installer.UpdateCheckResult
	err   error
	calls int
}

func (c *checkStub) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	c.calls++
	return c.res, c.err
}

// TestCheckTool pins how a check treats a tool dotfiles never installed (#151): it is
// not installed, never a failed check or an update from the placeholder "latest". An
// installer that answers from upstream is still asked, as v1 did, so the latest version
// is reported alongside; one that can only ask about the installed package is not asked
// at all. A failed upstream query is still a failed check.
func TestCheckTool(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	tool := &config.ToolConfig{Name: "cowsay", InstallationMethod: "npm"}
	queryErr := errors.New("npm view exited 1")
	installed := &registry.ToolInstallationRecord{ToolName: "cowsay", Version: "1.5.0"}

	t.Run("an installed tool is classified against its installed version", func(t *testing.T) {
		t.Parallel()
		stub := &checkStub{res: &installer.UpdateCheckResult{LatestVersion: "1.6.0"}}
		got, err := CheckTool(ctx, stub, tool, installed)
		if err != nil {
			t.Fatalf("CheckTool: %v", err)
		}
		want := CheckResult{Status: CheckStatusUpdateAvailable, InstalledVersion: "1.5.0", LatestVersion: "1.6.0"}
		if got != want {
			t.Errorf("CheckTool = %+v, want %+v", got, want)
		}
	})

	t.Run("an uninstalled tool reports the latest version upstream as not installed", func(t *testing.T) {
		t.Parallel()
		stub := &checkStub{res: &installer.UpdateCheckResult{LatestVersion: "1.6.0", Cached: true}}
		got, err := CheckTool(ctx, stub, tool, nil)
		if err != nil {
			t.Fatalf("CheckTool: %v", err)
		}
		want := CheckResult{Status: CheckStatusNotInstalled, LatestVersion: "1.6.0", Cached: true}
		if got != want {
			t.Errorf("CheckTool = %+v, want %+v", got, want)
		}
	})

	t.Run("an uninstalled tool whose installer cannot check is not installed", func(t *testing.T) {
		t.Parallel()
		stub := &checkStub{err: fmt.Errorf("manual: %w", installer.ErrUpdateCheckUnsupported)}
		got, err := CheckTool(ctx, stub, tool, nil)
		if err != nil {
			t.Fatalf("CheckTool: %v", err)
		}
		if want := (CheckResult{Status: CheckStatusNotInstalled}); got != want {
			t.Errorf("CheckTool = %+v, want %+v", got, want)
		}
	})

	t.Run("a failed upstream query for an uninstalled tool is a failed check", func(t *testing.T) {
		t.Parallel()
		stub := &checkStub{err: queryErr}
		if _, err := CheckTool(ctx, stub, tool, nil); !errors.Is(err, queryErr) {
			t.Errorf("CheckTool error = %v, want it to wrap %v", err, queryErr)
		}
	})

	t.Run("an installer that returns nothing is a failed check", func(t *testing.T) {
		t.Parallel()
		if _, err := CheckTool(ctx, &checkStub{}, tool, installed); err == nil {
			t.Error("CheckTool error = nil, want a failed check for an installer that answered nothing")
		}
	})

	t.Run("a package manager is not asked about a package dotfiles never installed", func(t *testing.T) {
		t.Parallel()
		runner := exec.NewMockRunner()
		brew := installer.NewBrewInstaller(runner, newMemFS(), nil)
		got, err := CheckTool(ctx, brew, &config.ToolConfig{Name: "sl", InstallationMethod: "brew"}, nil)
		if err != nil {
			t.Fatalf("CheckTool: %v", err)
		}
		if want := (CheckResult{Status: CheckStatusNotInstalled}); got != want {
			t.Errorf("CheckTool = %+v, want %+v", got, want)
		}
		if len(runner.History) != 0 {
			t.Errorf("brew was run %d time(s) for a tool that is not installed, want 0", len(runner.History))
		}
	})
}
