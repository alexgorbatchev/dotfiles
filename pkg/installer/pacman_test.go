package installer

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestPacmanInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewPacmanInstaller(runner, fsys, nil)

	if inst.Name() != "pacman" {
		t.Errorf("expected name to be 'pacman', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with sudo and sysupgrade", func(t *testing.T) {
		runner.Clear()
		runner.Register("pacman", []byte("jq 1.7.0-1"), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"package":    "jq",
				"sysupgrade": true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "/usr/bin/jq" {
			t.Errorf("expected [/usr/bin/jq] binaries list, got %v", res.Binaries)
		}

		// Verify pacman / sudo commands
		hasSysupgrade := false
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "pacman" && cmd.Args[1] == "-Syu" {
				hasSysupgrade = true
			}
		}

		if !hasSysupgrade {
			t.Error("expected sudo pacman -Syu to run")
		}
		if res.ShellEnv["PACMAN_INSTALLED_VERSION"] != "1.7.0-1" {
			t.Errorf("unexpected version in env: %s", res.ShellEnv["PACMAN_INSTALLED_VERSION"])
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "sudo" || cmd.Args[0] != "pacman" || cmd.Args[1] != "-R" || cmd.Args[3] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install fails on command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("pacman", nil, errors.New("pacman error"))

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing, got nil")
		}
	})

	t.Run("Install success with repo prefix stripping and installParams version", func(t *testing.T) {
		runner.Clear()
		runner.Register("pacman", []byte("ripgrep 14.1.0-1"), nil)

		tool := &config.ToolConfig{
			Name:               "ripgrep",
			InstallationMethod: "pacman",
			InstallParams: map[string]interface{}{
				"package": "extra/ripgrep",
				"version": "14.1.0-1",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		hasPacmanQ := false
		for _, cmd := range runner.History {
			if cmd.Name == "pacman" && len(cmd.Args) >= 2 && cmd.Args[0] == "-Q" {
				if cmd.Args[1] == "ripgrep" {
					hasPacmanQ = true
				} else {
					t.Errorf("expected pacman -Q ripgrep, got pacman -Q %s", cmd.Args[1])
				}
			}
		}
		if !hasPacmanQ {
			t.Error("expected pacman -Q ripgrep to run")
		}
		if !slices.ContainsFunc(runner.History, func(cmd *exec.MockCmd) bool {
			return cmd.Name == "pacman" && slices.Equal(cmd.Args, []string{"-S", "--needed", "--noconfirm", "extra/ripgrep=14.1.0-1"})
		}) {
			t.Errorf("expected pacman -S --needed --noconfirm extra/ripgrep=14.1.0-1, the installParams version, got %v", runner.History)
		}
		if res.ShellEnv["PACMAN_INSTALLED_VERSION"] != "14.1.0-1" {
			t.Errorf("unexpected version in env: %s", res.ShellEnv["PACMAN_INSTALLED_VERSION"])
		}
	})
}

// TestPacmanInstaller_CheckUpdate pins the update check against what `pacman -Qu <pkg>`
// really prints and how it exits, captured from pacman 7.1.0 on Arch Linux. It exits 1
// both for a package with no upgrade and for a failed query, so only exit status 1 with
// nothing printed on either stream means "current"; a package that is not installed or a
// sync database that was never downloaded says so on stderr. Everything else is an error,
// never a result that callers read as "up to date" (issue #120).
func TestPacmanInstaller_CheckUpdate(t *testing.T) {
	tests := []struct {
		name         string
		pkg          string
		stdout       string
		stderr       string
		err          error
		wantOutdated bool
		wantLocal    string
		wantLatest   string
		wantErrText  []string
	}{
		{
			name:         "an upgrade is listed",
			pkg:          "bash",
			stdout:       "bash 5.3.15-1 -> 5.3.20-1\n",
			wantOutdated: true,
			wantLocal:    "5.3.15-1",
			wantLatest:   "5.3.20-1",
		},
		{
			name:         "a repository-qualified package is queried by its local name",
			pkg:          "core/bash",
			stdout:       "bash 5.3.15-1 -> 5.3.20-1\n",
			wantOutdated: true,
			wantLocal:    "5.3.15-1",
			wantLatest:   "5.3.20-1",
		},
		{name: "no upgrade", pkg: "acl", err: exitStatusError(1)},
		{
			name:        "the package is not installed",
			pkg:         "zsh",
			stderr:      "error: package 'zsh' was not found\n",
			err:         exitStatusError(1),
			wantErrText: []string{"running pacman -Qu zsh", "exit status 1", "package 'zsh' was not found"},
		},
		{
			name:        "the sync database was never downloaded",
			pkg:         "acl",
			stderr:      "warning: database file for 'core' does not exist (use '-Sy' to download)\nwarning: database file for 'extra' does not exist (use '-Sy' to download)\n",
			err:         exitStatusError(1),
			wantErrText: []string{"running pacman -Qu acl", "database file for 'core' does not exist"},
		},
		{
			name:        "pacman cannot be run",
			pkg:         "acl",
			err:         errors.New(`exec: "pacman": executable file not found in $PATH`),
			wantErrText: []string{"running pacman -Qu acl", "executable file not found"},
		},
		{
			name:        "the listing does not name the package",
			pkg:         "acl",
			stdout:      "bash 5.3.15-1 -> 5.3.20-1\n",
			wantErrText: []string{"running pacman -Qu acl", "listed no upgrade for acl"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			registerQuery(runner, "pacman", tt.stdout, tt.stderr, tt.err)
			inst := NewPacmanInstaller(runner, fs.NewMemFS(), nil)

			tool := &config.ToolConfig{Name: "tool", InstallParams: map[string]interface{}{"package": tt.pkg}}
			res, err := inst.CheckUpdate(context.Background(), tool)
			if len(tt.wantErrText) > 0 {
				assertCheckFailed(t, res, err, tt.wantErrText...)
				return
			}
			if err != nil {
				t.Fatalf("CheckUpdate() error = %v", err)
			}
			if res.Outdated == nil || *res.Outdated != tt.wantOutdated {
				t.Errorf("CheckUpdate() Outdated = %v, want %v", res.Outdated, tt.wantOutdated)
			}
			if res.LocalVersion != tt.wantLocal || res.LatestVersion != tt.wantLatest {
				t.Errorf("CheckUpdate() versions = %q -> %q, want %q -> %q", res.LocalVersion, res.LatestVersion, tt.wantLocal, tt.wantLatest)
			}
		})
	}
}
