package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestDnfInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewDnfInstaller(runner, fsys, nil)

	if inst.Name() != "dnf" {
		t.Errorf("expected name to be 'dnf', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with sudo and refresh", func(t *testing.T) {
		runner.Clear()
		runner.Register("rpm", []byte("1.7.0-1.fc38"), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"package": "jq",
				"refresh": true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "/usr/bin/jq" {
			t.Errorf("expected [/usr/bin/jq] binaries list, got %v", res.Binaries)
		}

		// Verify dnf / sudo commands
		hasRefresh := false
		hasInstall := false
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "dnf" && cmd.Args[1] == "makecache" {
				hasRefresh = true
			}
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "dnf" && cmd.Args[1] == "install" {
				hasInstall = true
			}
		}

		if !hasRefresh {
			t.Error("expected sudo dnf makecache to run")
		}
		if !hasInstall {
			t.Error("expected sudo dnf install to run")
		}
		if res.ShellEnv["DNF_INSTALLED_VERSION"] != "1.7.0-1.fc38" {
			t.Errorf("unexpected version in env: %s", res.ShellEnv["DNF_INSTALLED_VERSION"])
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
		if cmd.Name != "sudo" || cmd.Args[0] != "dnf" || cmd.Args[1] != "remove" || cmd.Args[3] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install fails on command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("dnf", nil, errors.New("dnf error"))

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing, got nil")
		}
	})
}

// dnf 5 (Fedora 42, dnf5 5.2.18.0) prints its repository progress on stderr and
// nothing else, whether or not there are upgrades.
const dnf5RepositoriesLoaded = "Updating and loading repositories:\nRepositories loaded.\n"

// TestDnfInstaller_CheckUpdate pins the update check against what rpm and dnf really
// print and how they exit, captured from dnf 5.2.18.0 on Fedora 42 and dnf 4.14.0 on
// Rocky Linux 9. `dnf check-update` exits 100 when the package has an upgrade and 0 when
// it has none, but also 0 for a package that is not installed, so rpm must confirm the
// installation first. It also exits 0 when a repository with skip_if_unavailable
// could not be read, which --setopt=*.skip_if_unavailable=False turns into exit 1 on
// both releases. Every other outcome is an error, never a result that callers read as
// "up to date" (issue #120).
func TestDnfInstaller_CheckUpdate(t *testing.T) {
	type query struct {
		stdout, stderr string
		err            error
	}
	tests := []struct {
		name         string
		pkg          string
		rpm          query
		dnf          query
		wantOutdated bool
		wantLocal    string
		wantLatest   string
		wantErrText  []string
	}{
		{
			name:         "dnf 5 lists an upgrade",
			pkg:          "dnf5-plugins",
			rpm:          query{stdout: "5.2.18.0-2.fc42\n"},
			dnf:          query{stdout: "dnf5-plugins.aarch64 5.2.18.0-3.fc42 updates\n", stderr: dnf5RepositoriesLoaded, err: exitStatusError(100)},
			wantOutdated: true,
			wantLocal:    "5.2.18.0-2.fc42",
			wantLatest:   "5.2.18.0-3.fc42",
		},
		{
			name: "dnf 4 lists an upgrade",
			pkg:  "audit-libs",
			rpm:  query{stdout: "3.1.5-7.el9\n"},
			dnf: query{
				stdout: "Last metadata expiration check: 0:00:02 ago on Wed Sep 23 06:28:29 2026.\n\naudit-libs.aarch64                      3.1.5-8.el9                       baseos\n",
				err:    exitStatusError(100),
			},
			wantOutdated: true,
			wantLocal:    "3.1.5-7.el9",
			wantLatest:   "3.1.5-8.el9",
		},
		{
			name:      "dnf 5 has no upgrade",
			pkg:       "bash",
			rpm:       query{stdout: "5.2.37-1.fc42\n"},
			dnf:       query{stderr: dnf5RepositoriesLoaded},
			wantLocal: "5.2.37-1.fc42",
		},
		{
			name:      "dnf 4 has no upgrade",
			pkg:       "bash",
			rpm:       query{stdout: "5.1.8-9.el9\n"},
			dnf:       query{stdout: "Last metadata expiration check: 0:00:02 ago on Wed Sep 23 06:28:29 2026.\n"},
			wantLocal: "5.1.8-9.el9",
		},
		{
			// rpm prints one version per installed instance, as for a multilib package.
			name:      "several instances are installed",
			pkg:       "glibc",
			rpm:       query{stdout: "2.34-100.el9\n2.34-100.el9\n"},
			dnf:       query{stdout: "Last metadata expiration check: 0:00:02 ago on Wed Sep 23 06:28:29 2026.\n"},
			wantLocal: "2.34-100.el9",
		},
		{
			name:        "a repository cannot be reached",
			pkg:         "bash",
			rpm:         query{stdout: "5.1.8-9.el9\n"},
			dnf:         query{stderr: "Errors during downloading metadata for repository 'unreachable':\nError: Failed to download metadata for repo 'unreachable': Cannot download repomd.xml: Cannot download repodata/repomd.xml: All mirrors were tried\n", err: exitStatusError(1)},
			wantErrText: []string{"running dnf check-update '--setopt=*.skip_if_unavailable=False' bash", "exit status 1", "Failed to download metadata for repo 'unreachable'"},
		},
		{
			name:        "the package is not installed",
			pkg:         "zsh",
			rpm:         query{stdout: "package zsh is not installed\n", err: exitStatusError(1)},
			dnf:         query{stderr: dnf5RepositoriesLoaded},
			wantErrText: []string{"running rpm -q --qf $'%{VERSION}-%{RELEASE}\\n' zsh", "exit status 1", "package zsh is not installed"},
		},
		{
			name:        "dnf fails",
			pkg:         "bash",
			rpm:         query{stdout: "5.1.8-9.el9\n"},
			dnf:         query{stderr: "Error: Unknown repo: 'nonexistentrepo'\n", err: exitStatusError(1)},
			wantErrText: []string{"running dnf check-update '--setopt=*.skip_if_unavailable=False' bash", "exit status 1", "Unknown repo"},
		},
		{
			name:        "dnf cannot be run",
			pkg:         "bash",
			rpm:         query{stdout: "5.1.8-9.el9\n"},
			dnf:         query{err: errors.New(`exec: "dnf": executable file not found in $PATH`)},
			wantErrText: []string{"running dnf check-update '--setopt=*.skip_if_unavailable=False' bash", "executable file not found"},
		},
		{
			name:        "dnf reports an upgrade it does not list",
			pkg:         "bash",
			rpm:         query{stdout: "5.1.8-9.el9\n"},
			dnf:         query{stdout: "audit-libs.aarch64 3.1.5-8.el9 baseos\n", err: exitStatusError(100)},
			wantErrText: []string{"running dnf check-update '--setopt=*.skip_if_unavailable=False' bash", "listed no upgrade for bash"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			registerQuery(runner, "rpm", tt.rpm.stdout, tt.rpm.stderr, tt.rpm.err)
			registerQuery(runner, "dnf", tt.dnf.stdout, tt.dnf.stderr, tt.dnf.err)
			inst := NewDnfInstaller(runner, fs.NewMemFS(), nil)

			res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: tt.pkg})
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
