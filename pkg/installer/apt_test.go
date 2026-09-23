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

func TestAptInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewAptInstaller(runner, fsys, nil)

	if inst.Name() != "apt" {
		t.Errorf("expected name to be 'apt', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with sudo and update", func(t *testing.T) {
		runner.Clear()
		runner.Register("dpkg-query", []byte("1.2.3-1"), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"package": "jq",
				"update":  true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "/usr/bin/jq" {
			t.Errorf("expected [/usr/bin/jq] binaries list, got %v", res.Binaries)
		}

		// Verify hdiutil / apt / sudo commands
		hasUpdate := false
		hasInstall := false
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" {
				// We call sudo directly, or we execute command directly
				// Wait! In apt.go, we did CommandContext(ctx, "sudo", "apt-get", "update")
				// So cmd.Name is indeed "sudo" and cmd.Args has "apt-get", "update"
			}
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "apt-get" && cmd.Args[1] == "update" {
				hasUpdate = true
			}
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "apt-get" && cmd.Args[1] == "install" {
				hasInstall = true
			}
		}

		if !hasUpdate {
			t.Error("expected sudo apt-get update to run")
		}
		if !hasInstall {
			t.Error("expected sudo apt-get install to run")
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
		if cmd.Name != "sudo" || cmd.Args[0] != "apt-get" || cmd.Args[1] != "remove" || cmd.Args[3] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install fails on command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("apt-get", nil, errors.New("apt error"))

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing, got nil")
		}
	})
}

// apt-cache policy transcripts captured from apt 2.6.1 on debian:bookworm. Every one of
// them exits 0, and only aptWarningConfiguredTwice goes to stderr: only the Installed:
// line of the package's own section tells an installed package apart from one that is
// not. A name apt has no record of prints nothing on stdout, unless it reads as a
// regular expression, when apt lists the packages that match it instead.
const (
	aptPolicyUpgradable = `tzdata:
  Installed: 2026b-0+deb12u1
  Candidate: 2026c-0+deb12u1
  Version table:
     2026c-0+deb12u1 500
        500 http://deb.debian.org/debian-security bookworm-security/main arm64 Packages
 *** 2026b-0+deb12u1 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        100 /var/lib/dpkg/status
     2025b-0+deb12u1 500
        500 http://deb.debian.org/debian bookworm-updates/main arm64 Packages
`
	aptPolicyCurrent = `bash:
  Installed: 5.2.15-2+b13
  Candidate: 5.2.15-2+b13
  Version table:
 *** 5.2.15-2+b13 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        100 /var/lib/dpkg/status
`
	aptPolicyNotInstalled = `jq:
  Installed: (none)
  Candidate: 1.6-2.1+deb12u2
  Version table:
     1.6-2.1+deb12u2 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        500 http://deb.debian.org/debian-security bookworm-security/main arm64 Packages
`
	// logrotate after apt-get remove, which leaves it in dpkg state rc (configuration
	// files kept): dpkg-query still prints a version for it, apt-cache policy does not.
	aptPolicyRemovedConfigKept = `logrotate:
  Installed: (none)
  Candidate: 3.21.0-1
  Version table:
     3.21.0-1 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        100 /var/lib/dpkg/status
`
	// A virtual package: apt knows the name, but nothing provides it here.
	aptPolicyVirtual = `awk:
  Installed: (none)
  Candidate: (none)
  Version table:
`
	// bash with /etc/apt/preferences.d pinning every version at priority -1.
	aptPolicyPinnedAway = `bash:
  Installed: 5.2.15-2+b13
  Candidate: (none)
  Version table:
 *** 5.2.15-2+b13 -1
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        100 /var/lib/dpkg/status
`
	// What apt prints on stderr, still exiting 0, when a suite is configured twice.
	aptWarningConfiguredTwice = `W: Target Packages (main/binary-arm64/Packages) is configured multiple times in /etc/apt/sources.list:1 and /etc/apt/sources.list.d/debian.sources:1
W: Target Packages (main/binary-all/Packages) is configured multiple times in /etc/apt/sources.list:1 and /etc/apt/sources.list.d/debian.sources:1
`
	// apt-cache policy 'perl-bas.', a misspelling of perl-base: apt knows no package of
	// that name, reads it as a regular expression and prints the one package it matches.
	aptPolicyRegexMatchedOther = `perl-base:
  Installed: 5.36.0-7+deb12u3
  Candidate: 5.36.0-7+deb12u3
  Version table:
 *** 5.36.0-7+deb12u3 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        100 /var/lib/dpkg/status
     5.36.0-7+deb12u2 500
        500 http://deb.debian.org/debian-security bookworm-security/main arm64 Packages
`
	// The first seven of the 291 sections apt-cache policy 'libstdc++' prints.
	aptPolicyRegexMatchedMany = `libstdc++-11-pic-mipsr6-cross:
  Installed: (none)
  Candidate: 11.3.0-8cross1
  Version table:
     11.3.0-8cross1 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
libstdc++-12-dev-arm64-cross:
  Installed: (none)
  Candidate: 12.2.0-14cross1
  Version table:
     12.2.0-14cross1 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
libstdc++6-12-dbg-riscv64-cross:
  Installed: (none)
  Candidate: (none)
  Version table:
libstdc++-dev-arc-dcv1:
  Installed: (none)
  Candidate: (none)
  Version table:
libstdc++6-ppc64-dcv1:
  Installed: (none)
  Candidate: (none)
  Version table:
libstdc++-pic-s390x-dcv1:
  Installed: (none)
  Candidate: (none)
  Version table:
libstdc++6-12-dbg-mipsr6el-cross:
  Installed: (none)
  Candidate: (none)
  Version table:
`
	// apt-cache policy jq:amd64 on arm64 with amd64 added as a foreign architecture:
	// the section keeps the qualifier. For the native architecture (bash:arm64, or
	// bash:native) apt prints the bare aptPolicyCurrent section instead.
	aptPolicyForeignArch = `jq:amd64:
  Installed: (none)
  Candidate: 1.6-2.1+deb12u2
  Version table:
     1.6-2.1+deb12u2 500
        500 http://deb.debian.org/debian bookworm/main amd64 Packages
        500 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages
`
	// The German translation apt ships in the same image, under LANG=de_DE.UTF-8.
	aptPolicyGerman = `bash:
  Installiert:           5.2.15-2+b13
  Installationskandidat: 5.2.15-2+b13
  Versionstabelle:
 *** 5.2.15-2+b13 500
        500 http://deb.debian.org/debian bookworm/main arm64 Packages
        100 /var/lib/dpkg/status
`
)

// TestAptInstaller_CheckUpdate pins the update check against what apt-cache policy
// really prints. apt-cache policy exits 0 for a package that is not installed and for
// one apt has never heard of, so everything short of an installed version and a
// candidate is an error, never a result that callers read as "up to date" (issue #152).
func TestAptInstaller_CheckUpdate(t *testing.T) {
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
			name:         "an upgrade is available",
			pkg:          "tzdata",
			stdout:       aptPolicyUpgradable,
			wantOutdated: true,
			wantLocal:    "2026b-0+deb12u1",
			wantLatest:   "2026c-0+deb12u1",
		},
		{
			name:       "the installed version is the candidate",
			pkg:        "bash",
			stdout:     aptPolicyCurrent,
			wantLocal:  "5.2.15-2+b13",
			wantLatest: "5.2.15-2+b13",
		},
		{
			name:       "the native architecture qualifies the name",
			pkg:        "bash:arm64",
			stdout:     aptPolicyCurrent,
			wantLocal:  "5.2.15-2+b13",
			wantLatest: "5.2.15-2+b13",
		},
		{
			name:        "a foreign architecture qualifies the name",
			pkg:         "jq:amd64",
			stdout:      aptPolicyForeignArch,
			wantErrText: []string{"apt-cache policy jq:amd64", "apt package jq:amd64 is not installed"},
		},
		{
			name:        "an unknown name matches another installed package as a regular expression",
			pkg:         "perl-bas.",
			stdout:      aptPolicyRegexMatchedOther,
			wantErrText: []string{"running apt-cache policy perl-bas.", "apt does not know package perl-bas.: apt-cache policy listed perl-base instead"},
		},
		{
			name:   "an unknown name matches many packages as a regular expression",
			pkg:    "libstdc++",
			stdout: aptPolicyRegexMatchedMany,
			wantErrText: []string{
				"running apt-cache policy libstdc++: ",
				"apt does not know package libstdc++: apt-cache policy listed libstdc++-11-pic-mipsr6-cross, libstdc++-12-dev-arm64-cross, libstdc++6-12-dbg-riscv64-cross, libstdc++-dev-arc-dcv1, libstdc++6-ppc64-dcv1 and 2 more instead",
			},
		},
		{
			name:        "the output has no package section",
			pkg:         "bash",
			stdout:      "  Installed: 5.2.15-2+b13\n",
			wantErrText: []string{"apt-cache policy bash", "apt-cache policy printed no package section for bash: Installed: 5.2.15-2+b13"},
		},
		{
			name:       "a warning on stderr does not fail an answered query",
			pkg:        "bash",
			stdout:     aptPolicyCurrent,
			stderr:     aptWarningConfiguredTwice,
			wantLocal:  "5.2.15-2+b13",
			wantLatest: "5.2.15-2+b13",
		},
		{
			name:        "the package is not installed",
			pkg:         "jq",
			stdout:      aptPolicyNotInstalled,
			wantErrText: []string{"apt-cache policy jq", "apt package jq is not installed"},
		},
		{
			name:        "the package was removed and its configuration files kept",
			pkg:         "logrotate",
			stdout:      aptPolicyRemovedConfigKept,
			wantErrText: []string{"apt-cache policy logrotate", "apt package logrotate is not installed"},
		},
		{
			name:        "a virtual package has nothing installed or to install",
			pkg:         "awk",
			stdout:      aptPolicyVirtual,
			wantErrText: []string{"apt-cache policy awk", "apt package awk is not installed"},
		},
		{
			name:        "apt does not know the package",
			pkg:         "nosuchpkgxyz",
			wantErrText: []string{"running apt-cache policy nosuchpkgxyz", "apt does not know package nosuchpkgxyz: apt-cache policy printed nothing on standard output"},
		},
		{
			// A warning on stderr alongside an unknown name is quoted, and the message
			// still says what was missing from standard output.
			name:        "apt does not know the package and warns on stderr",
			pkg:         "nosuchpkgxyz",
			stderr:      aptWarningConfiguredTwice,
			wantErrText: []string{"running apt-cache policy nosuchpkgxyz", "apt does not know package nosuchpkgxyz: apt-cache policy printed nothing on standard output", "is configured multiple times"},
		},
		{
			// apt always prints the line; the check must not read its absence as current.
			name:        "an installed package has no candidate line",
			pkg:         "bash",
			stdout:      "bash:\n  Installed: 5.2.15-2+b13\n  Version table:\n",
			wantErrText: []string{"apt-cache policy bash", "apt-cache policy printed no Candidate: line for bash", "Installed: 5.2.15-2+b13"},
		},
		{
			name:        "every version of an installed package is pinned below zero",
			pkg:         "bash",
			stdout:      aptPolicyPinnedAway,
			wantErrText: []string{"apt-cache policy bash", "apt package bash has no candidate version", "Installed: 5.2.15-2+b13, Candidate: (none)"},
		},
		{
			// A package list truncated on disk.
			name:        "the package lists cannot be parsed",
			pkg:         "bash",
			stderr:      "E: LZ4F: /var/lib/apt/lists/deb.debian.org_debian-security_dists_bookworm-security_main_binary-arm64_Packages.lz4 Read error (18446744073709551603: ERROR_frameType_unknown)\nE: The package lists or status file could not be parsed or opened.\n",
			err:         exitStatusError(100),
			wantErrText: []string{"running apt-cache policy bash", "exit status 100", "The package lists or status file could not be parsed or opened."},
		},
		{
			name:        "apt-cache cannot be run",
			pkg:         "bash",
			err:         errors.New(`exec: "apt-cache": executable file not found in $PATH`),
			wantErrText: []string{"running apt-cache policy bash", "executable file not found"},
		},
		{
			// The labels are only ever read in the C locale; the check sets LC_ALL=C so
			// that a translated transcript can never reach the parser in practice.
			name:        "the transcript is translated",
			pkg:         "bash",
			stdout:      aptPolicyGerman,
			wantErrText: []string{"running apt-cache policy bash", "apt-cache policy printed no Installed: line for bash", "Installiert:           5.2.15-2+b13"},
		},
		{
			// The error quotes the transcript it could not read, not a warning beside it.
			name:        "the transcript is translated and apt warns on stderr",
			pkg:         "bash",
			stdout:      aptPolicyGerman,
			stderr:      aptWarningConfiguredTwice,
			wantErrText: []string{"running apt-cache policy bash", "apt-cache policy printed no Installed: line for bash", "Installiert:           5.2.15-2+b13"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			registerQuery(runner, "apt-cache", tt.stdout, tt.stderr, tt.err)
			inst := NewAptInstaller(runner, fs.NewMemFS(), nil)

			res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{
				Name:          "tool",
				InstallParams: map[string]interface{}{"package": tt.pkg},
			})
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

// TestAptInstaller_CheckUpdateRunsInCLocale pins that apt-cache policy runs with
// LC_ALL=C, last in its environment so it overrides any LC_ALL the user has set: apt
// translates the Installed: and Candidate: labels (German prints Installiert: and
// Installationskandidat:), and the check reads them by their English names.
func TestAptInstaller_CheckUpdateRunsInCLocale(t *testing.T) {
	t.Setenv("LC_ALL", "de_DE.UTF-8")
	runner := exec.NewMockRunner()
	registerQuery(runner, "apt-cache", aptPolicyCurrent, "", nil)
	inst := NewAptInstaller(runner, fs.NewMemFS(), nil)

	if _, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "bash"}); err != nil {
		t.Fatalf("CheckUpdate() error = %v", err)
	}
	if len(runner.History) != 1 {
		t.Fatalf("ran %d commands, want 1", len(runner.History))
	}
	env := runner.History[0].Env()
	if len(env) == 0 || env[len(env)-1] != "LC_ALL=C" {
		t.Fatalf("apt-cache environment = %q, want it to end with LC_ALL=C", env)
	}
	if !slices.Contains(env, "LC_ALL=de_DE.UTF-8") {
		t.Errorf("apt-cache environment dropped the inherited environment: %q", env)
	}
}
