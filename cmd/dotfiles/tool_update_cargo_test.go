package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
)

// TestCargoUpdateInstallsReleaseTaggedWithoutV is the regression test for an update
// pinning the version its check found: a GitHub release tagged 14.1.1, as ripgrep
// tags them, must be downloaded from that tag, not from a v14.1.1 it does not have.
func TestCargoUpdateInstallsReleaseTaggedWithoutV(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	requested := newCratesServer(t, cargoUpstream{releases: map[string]string{"acme/baretag": "14.1.1"}})

	p := newE2EProject(t, tsTools{
		"baretag": `install("cargo", { binarySource: "github-releases", githubRepo: "acme/baretag" })`,
	})
	dir := filepath.Join(p.Root, "installed", "baretag")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating install dir: %v", err)
	}
	p.seedInstallation(t, "baretag", "14.0.0", dir)

	out, err := p.run("--platform", "linux", "--arch", "amd64", "tool", "update", "baretag")
	if err != nil {
		t.Fatalf("tool update baretag: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "New version available: 14.0.0 -> 14.1.1", "Successfully updated to version 14.1.1")
	mustNotContain(t, "stderr", out.Stderr, "falling back to local compilation")
	if rec := p.installation(t, "baretag"); rec == nil || rec.Version != "14.1.1" {
		t.Fatalf("installation record after update = %+v, want version 14.1.1", rec)
	}

	// The check asks the API for the latest release; the pinned install that follows
	// tries both tag spellings against the download URL and never asks the API.
	want := []string{
		"/repos/acme/baretag/releases/latest",
		"/acme/baretag/releases/download/v14.1.1/baretag-14.1.1-unknown-linux-gnu-x86_64.tar.gz",
		"/acme/baretag/releases/download/14.1.1/baretag-14.1.1-unknown-linux-gnu-x86_64.tar.gz",
	}
	if paths := requested(); !slices.Equal(paths, want) {
		t.Errorf("requests = %v, want exactly %v", paths, want)
	}
}

// TestCargoUpdateChecks pins that cargo tools are checked against crates.io, as v1
// did: tool check reports an outdated crate, tool update installs the newer build,
// the tool's constraint bounds what counts as an update, and a failed query is a
// failed check rather than "up to date" or "not supported".
func TestCargoUpdateChecks(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	newCratesServer(t, cargoUpstream{crates: map[string]string{
		"crate-outdated": "2.0.0",
		"crate-current":  "1.0.0",
		"crate-bounded":  "2.0.0",
		"crate-admitted": "1.2.9",
	}})

	p := newE2EProject(t, tsTools{
		"outdated": `install("cargo", { crateName: "crate-outdated" }).bin("crate-outdated")`,
		"current":  `install("cargo", { crateName: "crate-current" }).bin("crate-current")`,
		"bounded":  `install("cargo", { crateName: "crate-bounded" }).bin("crate-bounded").updateCheck({ constraint: "~1.2.0" })`,
		"admitted": `install("cargo", { crateName: "crate-admitted" }).bin("crate-admitted").updateCheck({ constraint: "~1.2.0" })`,
		"failing":  `install("cargo", { crateName: "crate-missing" })`,
	})
	for name, version := range map[string]string{
		"outdated": "1.0.0",
		"current":  "1.0.0",
		"bounded":  "1.2.3",
		"admitted": "1.2.3",
		"failing":  "1.0.0",
	} {
		dir := filepath.Join(p.Root, "installed", name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating install dir: %v", err)
		}
		p.seedInstallation(t, name, version, dir)
	}

	t.Run("tool check reports the latest crates.io version", func(t *testing.T) {
		out, err := p.run("tool", "check", "--json")
		mustFailAfterLogging(t, err, out)
		var results []ToolUpdateResult
		if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
			t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
		}
		byName := map[string]ToolUpdateResult{}
		for _, r := range results {
			byName[r.ToolName] = r
		}

		want := map[string]ToolUpdateResult{
			"outdated": {ToolName: "outdated", CurrentVersion: "1.0.0", LatestVersion: "2.0.0", Status: orchestrator.CheckStatusUpdateAvailable},
			"current":  {ToolName: "current", CurrentVersion: "1.0.0", LatestVersion: "1.0.0", Status: orchestrator.CheckStatusUpToDate},
			// 2.0.0 is the latest upstream, but ~1.2.0 does not admit it as an update.
			"bounded":  {ToolName: "bounded", CurrentVersion: "1.2.3", LatestVersion: "2.0.0", Status: orchestrator.CheckStatusUpToDate},
			"admitted": {ToolName: "admitted", CurrentVersion: "1.2.3", LatestVersion: "1.2.9", Status: orchestrator.CheckStatusUpdateAvailable},
		}
		for name, w := range want {
			if got, ok := byName[name]; !ok || got != w {
				t.Errorf("%s result = %+v (present: %t), want %+v", name, got, ok, w)
			}
		}
		const failingCause = `checking update for "failing": checking failing for updates: resolving crate-missing version from crates.io: crates.io returned status: 500`
		// A failed query is reported as failed with its cause, never as a status the
		// query did not establish.
		wantFailing := ToolUpdateResult{ToolName: "failing", CurrentVersion: "1.0.0", Status: checkStatusFailed, Error: failingCause}
		if got, ok := byName["failing"]; !ok || got != wantFailing {
			t.Errorf("failing result = %+v (present: %t), want %+v", got, ok, wantFailing)
		}
		mustContain(t, "stderr", out.Stderr, `[failing] Update check failed: `+failingCause)
		mustNotContain(t, "stderr", out.Stderr, "Update check not supported")
	})

	t.Run("tool update installs the newer crates.io version", func(t *testing.T) {
		out, err := p.run("--platform", "linux", "--arch", "amd64", "tool", "update", "outdated")
		if err != nil {
			t.Fatalf("tool update outdated: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "New version available: 1.0.0 -> 2.0.0", "Successfully updated to version 2.0.0")
		mustNotContain(t, "stderr", out.Stderr, "Update check not supported", "falling back to local compilation")
		if rec := p.installation(t, "outdated"); rec == nil || rec.Version != "2.0.0" {
			t.Fatalf("installation record after update = %+v, want version 2.0.0", rec)
		}
	})

	t.Run("tool update leaves a current crate alone", func(t *testing.T) {
		out, err := p.run("tool", "update", "current")
		if err != nil {
			t.Fatalf("tool update current: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Already up to date (1.0.0)")
		mustNotContain(t, "stderr", out.Stderr, "performing regular install instead")
	})

	t.Run("tool update does not install a version the constraint excludes", func(t *testing.T) {
		out, err := p.run("tool", "update", "bounded")
		if err != nil {
			t.Fatalf("tool update bounded: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "New version available", "Successfully updated")
		if rec := p.installation(t, "bounded"); rec == nil || rec.Version != "1.2.3" {
			t.Fatalf("installation record after update = %+v, want the untouched 1.2.3", rec)
		}
	})
}

// TestCargoUpdateRefusesPinnedCrate is the cargo counterpart of
// TestUpdateCommand_RefusesPinnedTools: since cargo checks crates.io, its check reports
// a newer crate for a pinned tool too, and update must neither ask nor install it.
func TestCargoUpdateRefusesPinnedCrate(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	requested := newCratesServer(t, cargoUpstream{crates: map[string]string{"crate-pinned": "2.0.0"}})

	p := newE2EProject(t, tsTools{
		"pinned": `install("cargo", { crateName: "crate-pinned" }).bin("crate-pinned").version("1.0.0")`,
	})
	seed := func(t *testing.T) {
		t.Helper()
		dir := filepath.Join(p.Root, "installed", "pinned")
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating install dir: %v", err)
		}
		p.seedInstallation(t, "pinned", "1.0.0", dir)
	}

	for _, args := range [][]string{
		{"tool", "update", "pinned"},
		{"tool", "update", "--force", "pinned"},
		{"tool", "update"},
		{"tool", "update", "--force"},
	} {
		t.Run(strings.Join(args, " ")+" keeps the pinned version", func(t *testing.T) {
			seed(t)
			out, err := p.run(append([]string{"--platform", "linux", "--arch", "amd64"}, args...)...)
			if err != nil {
				t.Fatalf("%s: %v\n%s", strings.Join(args, " "), err, out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "[pinned] "+pinnedUpdateMessage("pinned", "1.0.0"))
			mustNotContain(t, "stderr", out.Stderr, "New version available", "Force updating", "Successfully updated")
			if rec := p.installation(t, "pinned"); rec == nil || rec.Version != "1.0.0" {
				t.Fatalf("installation record after update = %+v, want the pinned 1.0.0", rec)
			}
			if paths := requested(); len(paths) != 0 {
				t.Fatalf("requests = %v, want none: a pinned tool is refused before its check", paths)
			}
		})
	}

	t.Run("tool check still reports the newer crate", func(t *testing.T) {
		seed(t)
		out, err := p.run("tool", "check", "pinned")
		if err != nil {
			t.Fatalf("tool check pinned: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "pinned: update available (1.0.0 -> 2.0.0)")
	})
}

// TestCargoProjectSettingsReachTheInstaller pins that the project's cargo section
// reaches the cargo installer on every CLI path that configures it: tool check asks
// crates.io with cargo.userAgent and cargo.cratesIo.token, and the install `tool update`
// performs downloads the quickinstall archive with cargo.githubRelease.token, each
// from the host MOCK_SERVER_PORT names.
func TestCargoProjectSettingsReachTheInstaller(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	type seen struct{ userAgent, authorization string }
	var mu sync.Mutex
	received := map[string][]seen{}
	newCratesServer(t, cargoUpstream{
		crates: map[string]string{"mycrate": "2.0.0"},
		observe: func(r *http.Request) {
			mu.Lock()
			defer mu.Unlock()
			received[r.URL.Path] = append(received[r.URL.Path], seen{r.Header.Get("User-Agent"), r.Header.Get("Authorization")})
		},
	})

	tools := tsTools{"mycrate": `install("cargo", { crateName: "mycrate" }).bin("mycrate")`}
	p := newE2EProject(t, tools)
	p.writeConfig(t, tools, "", `"cargo": {"userAgent": "my-bot (me@example.com)", "cratesIo": {"token": "crates-secret"}, "githubRelease": {"token": "release-secret"}}`)
	dir := filepath.Join(p.Root, "installed", "mycrate")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating install dir: %v", err)
	}
	p.seedInstallation(t, "mycrate", "1.0.0", dir)

	out, err := p.run("tool", "check", "--json")
	if err != nil {
		t.Fatalf("tool check --json: %v\n%s", err, out.Combined)
	}
	var results []ToolUpdateResult
	if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
		t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
	}
	if len(results) != 1 || results[0].LatestVersion != "2.0.0" {
		t.Fatalf("tool check results = %+v, want mycrate at 2.0.0", results)
	}

	out, err = p.run("--platform", "linux", "--arch", "amd64", "tool", "update", "mycrate")
	if err != nil {
		t.Fatalf("tool update mycrate: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "Successfully updated to version 2.0.0")
	mustNotContain(t, "stderr", out.Stderr, "falling back to local compilation")

	mu.Lock()
	defer mu.Unlock()
	crates := received["/api/v1/crates/mycrate"]
	if len(crates) == 0 {
		t.Fatalf("crates.io was never asked; requests: %v", received)
	}
	for _, r := range crates {
		if r != (seen{"my-bot (me@example.com)", "crates-secret"}) {
			t.Errorf("crates.io request carried %+v, want the configured User-Agent and crates.io token", r)
		}
	}
	archive := received["/cargo-bins/cargo-quickinstall/releases/download/mycrate-2.0.0/mycrate-2.0.0-x86_64-unknown-linux-gnu.tar.gz"]
	if len(archive) != 1 || archive[0].authorization != "token release-secret" {
		t.Errorf("quickinstall download carried %+v, want exactly one with the githubRelease token; requests: %v", archive, received)
	}
}
