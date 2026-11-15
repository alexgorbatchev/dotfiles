package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
)

func TestCheckUpdatesCommand_Details(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	out, err := executeCommand("-c", absConfig, "tool", "check")
	if err != nil {
		t.Fatalf("tool check failed: %v, out: %s", err, out)
	}

	if !strings.Contains(out, "Checking for updates across configured tools") {
		t.Errorf("expected tool check output to mention checking tools, got:\n%s", out)
	}
}

// TestCheckResultOutput_UnknownStatus pins that a status the output does not describe,
// such as a failed check, is named as it is and never reported as up to date (#120).
func TestCheckResultOutput_UnknownStatus(t *testing.T) {
	tool := &config.ToolConfig{Name: "t", InstallationMethod: "github-release"}
	r := ToolUpdateResult{ToolName: "t", Status: checkStatusFailed, CurrentVersion: "v1.0.0"}

	var stdout, stderr bytes.Buffer
	printCheckResult(&stdout, tool, r)
	logCheckResult(newLogger(&stderr, logger.LogLevelDefault).WithTag("t"), tool, r)

	if stdout.String() != "t: failed\n" {
		t.Errorf("stdout = %q, want %q", stdout.String(), "t: failed\n")
	}
	mustContain(t, "stderr", stderr.String(), "[t] Status: failed")
	mustNotContain(t, "stderr", stderr.String(), "Up to date")
}

func TestCheckUpdatesCommand_Statuses(t *testing.T) {
	// Real installers, so the GitHub release lookup and its cache are what is tested.
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoAvail, repoUpd, repoSame, repoFail = "acme/cu-avail", "acme/cu-upd", "acme/cu-same", "acme/cu-fail"
	const repoSameParam = "acme/cu-same-param"
	newReleaseServer(t, map[string]mockRelease{repoAvail: {Tag: "v9.9.9"}, repoUpd: {Tag: "v9.9.9"}, repoSame: {Tag: "v0.1.0"}, repoSameParam: {Tag: "v0.1.0"}})

	release := func(repo string) string {
		return fmt.Sprintf(`install("github-release", { repo: %q })`, repo)
	}
	p := newE2EProject(t, tsTools{
		"avail":      release(repoAvail),
		"upd":        release(repoUpd),
		"same":       release(repoSame) + `.version("v0.1.0")`,
		"same-param": fmt.Sprintf(`install("github-release", { repo: %q, version: "v0.1.0" }).version("latest")`, repoSameParam),
		"fail":       release(repoFail),
		"off":        release(repoAvail) + `.disable()`,
		"hand":       `install("manual")`,
		"never-hand": `install("manual")`,
		"never-brew": `install("brew", { formula: "dotfiles-test-never-installed" })`,
		"shell-only": `install()`,
	})
	// avail, same-param, fail, never-hand and never-brew have no installation record.
	p.seedInstallation(t, "upd", "v0.1.0", filepath.Join(p.Root, "installed", "upd"))
	p.seedInstallation(t, "same", "v0.1.0", filepath.Join(p.Root, "installed", "same"))
	p.seedInstallation(t, "hand", "v1.0.0", filepath.Join(p.Root, "installed", "hand"))

	// The check of fail fails, so every run of all tools exits non-zero (#132), after
	// reporting every other tool.
	t.Run("human output on a fresh fetch", func(t *testing.T) {
		out, err := p.run("tool", "check")
		mustFailAfterLogging(t, err, out)
		mustContain(t, "stdout", out.Stdout,
			// A tool dotfiles never installed is not installed, never an update from the
			// placeholder "latest" (#151); the release upstream is still reported.
			"avail: not installed (latest: v9.9.9)\n",
			"same-param: not installed (latest: v0.1.0)\n",
			"never-hand: not installed\n",
			// brew is not asked about a package dotfiles never installed.
			"never-brew: not installed\n",
			"upd: update available (v0.1.0 -> v9.9.9)\n",
			"same: up to date (v0.1.0)\n",
			"hand: update check not supported (manual)\n",
		)
		mustNotContain(t, "stdout", out.Stdout, "off:", "shell-only:", "fail:", "hand: up to date", "avail: update available", "avail: available")
		mustContain(t, "stderr", out.Stderr,
			// A failed upstream query is still a failed check, installed or not.
			// The cause is part of the message, so it is printed without --trace (#131).
			`[fail] Update check failed: checking update for "fail": GitHub API returned status 500`,
			"[avail] Not installed; the latest available version is v9.9.9",
			"[never-brew] Not installed\n",
			"[upd] Update available: v0.1.0 -> v9.9.9",
			"[same] Up to date (v0.1.0)",
			`[hand] Update check not supported for installer "manual"`,
		)
		mustNotContain(t, "stderr", out.Stderr, "[hand] Up to date", "[hand] Update check failed", "[never-brew] Update check failed", "[never-hand] Update check")
	})

	t.Run("human output from the cached releases", func(t *testing.T) {
		out, err := p.run("tool", "check")
		mustFailAfterLogging(t, err, out)
		mustContain(t, "stdout", out.Stdout, "same: up to date (v0.1.0, cached)\n")
		mustContain(t, "stderr", out.Stderr, "[same] Up to date (v0.1.0, cached)")
	})

	// Update availability, not-installed tools and unsupported checks are what a check
	// finds, not failures, so a run with nothing else succeeds.
	t.Run("checking only tools whose checks succeed exits 0", func(t *testing.T) {
		out, err := p.run("tool", "check", "avail", "upd", "same", "same-param", "hand", "never-hand", "never-brew")
		if err != nil {
			t.Fatalf("tool check: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "upd: update available (v0.1.0 -> v9.9.9)\n", "hand: update check not supported (manual)\n", "never-brew: not installed\n")
	})

	t.Run("agent output", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("tool", "check")
		mustFailAfterLogging(t, err, out)
		mustContain(t, "stdout", out.Stdout,
			"tool:avail status:not-installed current: latest:v9.9.9 cached:true\n",
			"tool:never-brew status:not-installed current: latest: cached:false\n",
			"tool:upd status:update-available current:v0.1.0 latest:v9.9.9 cached:true\n",
			"tool:same status:up-to-date current:v0.1.0 latest:v0.1.0 cached:true\n",
			"tool:hand status:unsupported current:v1.0.0 installer:manual\n",
		)
		mustNotContain(t, "stdout", out.Stdout, "tool:hand current:v1.0.0 latest:")
	})

	t.Run("json output", func(t *testing.T) {
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
		if r := byName["upd"]; r.Status != orchestrator.CheckStatusUpdateAvailable || r.CurrentVersion != "v0.1.0" || r.LatestVersion != "v9.9.9" {
			t.Errorf("upd result = %+v, want an update from v0.1.0 to v9.9.9", r)
		}
		if r := byName["same"]; r.Status != orchestrator.CheckStatusUpToDate || !r.Cached {
			t.Errorf("same result = %+v, want a supported check with no update from cache", r)
		}
		if r, ok := byName["hand"]; !ok || r.Status != orchestrator.CheckStatusUnsupported || r.LatestVersion != "" || r.CurrentVersion != "v1.0.0" {
			t.Errorf("hand result = %+v (present: %t), want an unsupported check at v1.0.0 with no latest version", r, ok)
		}
		if _, ok := byName["off"]; ok {
			t.Errorf("disabled tool must not be checked: %+v", results)
		}
		notInstalled := map[string]ToolUpdateResult{
			"avail":      {ToolName: "avail", Status: orchestrator.CheckStatusNotInstalled, LatestVersion: "v9.9.9", Cached: true},
			"never-hand": {ToolName: "never-hand", Status: orchestrator.CheckStatusNotInstalled},
			"never-brew": {ToolName: "never-brew", Status: orchestrator.CheckStatusNotInstalled},
		}
		for name, want := range notInstalled {
			if got, ok := byName[name]; !ok || got != want {
				t.Errorf("%s result = %+v (present: %t), want %+v", name, got, ok, want)
			}
		}
		// The failed check is in the array with its cause, so a script reading the JSON
		// sees which tool failed and why (#132).
		wantFail := ToolUpdateResult{ToolName: "fail", Status: checkStatusFailed, Error: `checking update for "fail": GitHub API returned status 500`}
		if got, ok := byName["fail"]; !ok || got != wantFail {
			t.Errorf("fail result = %+v (present: %t), want %+v", got, ok, wantFail)
		}
		mustNotContain(t, "stdout", out.Stdout, `"currentVersion": "latest"`)
	})
}

// TestCheckUpdatesCommand_UnreadableInstallation pins that an installation record that
// cannot be read is a failed check, never "not installed" (#151): the registry is the
// only evidence of what is installed, so a read error says nothing about the tool.
func TestCheckUpdatesCommand_UnreadableInstallation(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repo = "acme/unreadable"
	newReleaseServer(t, map[string]mockRelease{repo: {Tag: "v1.0.0"}})
	p := newE2EProject(t, tsTools{"unreadable": fmt.Sprintf(`install("github-release", { repo: %q })`, repo)})
	p.seedUnreadableInstallation(t, "unreadable")

	out, err := p.run("tool", "check", "--json")
	mustFailAfterLogging(t, err, out)
	// The cause is part of the message, so it is printed without --trace (#131).
	mustContain(t, "stderr", out.Stderr, "[unreadable] Reading the installation record failed: scanning tool installation record: ", unreadableInstallationCause)
	var results []ToolUpdateResult
	if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
		t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
	}
	if len(results) != 1 || results[0].ToolName != "unreadable" || results[0].Status != checkStatusFailed ||
		!strings.Contains(results[0].Error, unreadableInstallationCause) || results[0].CurrentVersion != "" || results[0].LatestVersion != "" {
		t.Errorf("results = %+v, want one failed check for unreadable carrying the read error", results)
	}
}

// TestCheckUpdatesCommand_FailedQuery pins that an update check whose upstream query
// fails is reported as failed, never as up to date: with the real npm installer and an
// npm that exits 1, `tool check` logs the failure, lists the tool as failed and exits
// non-zero (#132), and `tool update` fails instead of answering "Already up to date"
// (#120).
func TestCheckUpdatesCommand_FailedQuery(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	stubDir := t.TempDir()
	stub := "#!/bin/sh\necho 'npm error code E401' >&2\necho 'npm error Unable to authenticate' >&2\nexit 1\n"
	if err := os.WriteFile(filepath.Join(stubDir, "npm"), []byte(stub), 0755); err != nil {
		t.Fatalf("writing npm stub: %v", err)
	}
	t.Setenv("PATH", stubDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	p := newE2EProject(t, tsTools{"private-cli": `install("npm", { package: "@acme/private-cli" })`})
	p.seedInstallation(t, "private-cli", "1.0.0", filepath.Join(p.Root, "installed", "private-cli"))

	t.Run("tool check reports the failure", func(t *testing.T) {
		out, err := p.run("tool", "check", "--json")
		mustFailAfterLogging(t, err, out)
		var results []ToolUpdateResult
		if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
			t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
		}
		if len(results) != 1 || results[0].Status != checkStatusFailed || !strings.Contains(results[0].Error, "npm error code E401") {
			t.Errorf("results = %+v; a failed query must be reported as failed with its cause", results)
		}
		mustContain(t, "stderr", out.Stderr, "[private-cli] Update check failed")
	})

	t.Run("tool update fails", func(t *testing.T) {
		out, err := p.run("tool", "update", "private-cli")
		if err == nil {
			t.Fatalf("tool update private-cli succeeded; want the failed check to fail it\n%s", out.Combined)
		}
		mustContain(t, "error", err.Error(), "running npm view -- @acme/private-cli version", "npm error code E401")
		mustNotContain(t, "stderr", out.Stderr, "Already up to date")
	})
}

// TestCheckUpdatesCommand_UpdateCheckSettings pins what a tool's .updateCheck() block
// does to check-updates: enabled:false takes the tool out of the run, and a constraint
// decides whether the newest release upstream counts as an update at all.
func TestCheckUpdatesCommand_UpdateCheckSettings(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoOff, repoPinned, repoAdmitted = "acme/uc-off", "acme/uc-pinned", "acme/uc-admitted"
	newReleaseServer(t, map[string]mockRelease{
		repoOff:      {Tag: "v9.9.9"},
		repoPinned:   {Tag: "v2.0.0"},
		repoAdmitted: {Tag: "v1.2.9"},
	})

	p := newE2EProject(t, tsTools{
		"off":      fmt.Sprintf(`install("github-release", { repo: %q }).updateCheck({ enabled: false })`, repoOff),
		"pinned":   fmt.Sprintf(`install("github-release", { repo: %q }).updateCheck({ constraint: "~1.2.0" })`, repoPinned),
		"admitted": fmt.Sprintf(`install("github-release", { repo: %q }).updateCheck({ constraint: "~1.2.0" })`, repoAdmitted),
	})
	p.seedInstallation(t, "off", "v0.1.0", filepath.Join(p.Root, "installed", "off"))
	p.seedInstallation(t, "pinned", "v1.2.3", filepath.Join(p.Root, "installed", "pinned"))
	p.seedInstallation(t, "admitted", "v1.2.3", filepath.Join(p.Root, "installed", "admitted"))

	out, err := p.run("tool", "check", "--json")
	if err != nil {
		t.Fatalf("tool check --json: %v\n%s", err, out.Combined)
	}
	var results []ToolUpdateResult
	if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
		t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
	}
	byName := map[string]ToolUpdateResult{}
	for _, r := range results {
		byName[r.ToolName] = r
	}

	if r, ok := byName["off"]; ok {
		t.Errorf(`"off" was checked despite updateCheck.enabled:false: %+v`, r)
	}
	if r := byName["pinned"]; r.Status != orchestrator.CheckStatusUpToDate {
		t.Errorf("pinned result = %+v, want no update: v2.0.0 is outside ~1.2.0", r)
	}
	if r := byName["admitted"]; r.Status != orchestrator.CheckStatusUpdateAvailable || r.LatestVersion != "v1.2.9" {
		t.Errorf("admitted result = %+v, want an update to v1.2.9, which ~1.2.0 admits", r)
	}
}

func TestCheckUpdatesCommand_InstalledOnly(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	var mu sync.Mutex
	hits := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits[r.URL.Path]++
		mu.Unlock()
		switch r.URL.Path {
		case "/repos/acme/failed/releases/latest":
			w.WriteHeader(http.StatusInternalServerError)
		case "/repos/acme/limited/releases/latest":
			w.WriteHeader(http.StatusTooManyRequests)
		default:
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"tag_name":"v2.0.0","assets":[{"name":"tool.tar.gz","browser_download_url":"https://example.invalid/tool.tar.gz"}]}`)
		}
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("MOCK_SERVER_PORT", u.Port())

	for _, named := range []bool{false, true} {
		t.Run(fmt.Sprintf("named=%t", named), func(t *testing.T) {
			mu.Lock()
			clear(hits)
			mu.Unlock()
			tools := tsTools{"manual": `install("manual")`}
			for _, name := range []string{"current", "outdated", "failed", "limited", "unused", "unreadable"} {
				tools[name] = fmt.Sprintf(`install("github-release", {repo: "acme/%s"})`, name)
			}
			p := newE2EProject(t, tools)
			p.writeConfig(t, tools, "", `"github": {"cache": {"enabled": false}}`)
			p.seedUnreadableInstallation(t, "unreadable")
			for _, name := range []string{"current", "outdated", "failed", "limited", "manual"} {
				v := "v1.0.0"
				if name == "current" {
					v = "v2.0.0"
				}
				p.seedInstallation(t, name, v, filepath.Join(p.Root, "installed", name))
			}
			args := []string{"tool", "check", "--installed", "--json"}
			if named {
				args = append(args, "unused", "limited", "current", "manual", "failed", "outdated", "unreadable", "unknown")
			}
			out, err := p.run(args...)
			mustFailAfterLogging(t, err, out)
			var results []ToolUpdateResult
			if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
				t.Fatalf("decoding results: %v\n%s", err, out.Stdout)
			}
			byName := map[string]ToolUpdateResult{}
			for _, result := range results {
				byName[result.ToolName] = result
			}
			for name, status := range map[string]orchestrator.CheckStatus{
				"current": orchestrator.CheckStatusUpToDate, "outdated": orchestrator.CheckStatusUpdateAvailable,
				"manual": orchestrator.CheckStatusUnsupported, "failed": checkStatusFailed,
				"limited": checkStatusFailed, "unreadable": checkStatusFailed,
			} {
				if got := byName[name]; got.Status != status {
					t.Errorf("%s = %+v, want status %s", name, got, status)
				}
			}
			for name, cause := range map[string]string{"failed": "status 500", "limited": "status 429", "unreadable": unreadableInstallationCause} {
				if got := byName[name]; !strings.Contains(got.Error, cause) || got.LatestVersion != "" {
					t.Errorf("%s = %+v, want failure with %q and no latest version", name, got, cause)
				}
			}
			if got, present := byName["unused"]; named {
				if !present || got != (ToolUpdateResult{ToolName: "unused", Status: orchestrator.CheckStatusNotInstalled}) {
					t.Errorf("named uninstalled = %+v (present %t)", got, present)
				}
				if byName["unknown"].Status != checkStatusFailed {
					t.Errorf("unknown name must fail: %+v", byName["unknown"])
				}
			} else if present {
				t.Errorf("bulk installed-only check included uninstalled tool: %+v", got)
			}
			mu.Lock()
			for _, name := range []string{"unused", "unreadable"} {
				if got := hits["/repos/acme/"+name+"/releases/latest"]; got != 0 {
					t.Errorf("%s made %d upstream calls", name, got)
				}
			}
			for _, name := range []string{"current", "outdated", "failed", "limited"} {
				if hits["/repos/acme/"+name+"/releases/latest"] == 0 {
					t.Errorf("installed tool %s was never checked", name)
				}
			}
			mu.Unlock()
			// The explicit option must not change the next command's default scan.
			out, err = p.run("tool", "check", "unused", "--json")
			if err != nil {
				t.Fatalf("default check: %v\n%s", err, out.Combined)
			}
			mu.Lock()
			queried := hits["/repos/acme/unused/releases/latest"]
			mu.Unlock()
			if queried == 0 {
				t.Fatal("default scan must query configured uninstalled tools")
			}
			mustContain(t, "stdout", out.Stdout, "v2.0.0", "not-installed")
		})
	}

	t.Run("no installations succeeds with an empty array", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"unused": `install("manual")`})
		out, err := p.run("tool", "check", "--installed", "--json")
		if err != nil || strings.TrimSpace(out.Stdout) != "[]" {
			t.Fatalf("empty check: %v\n%s", err, out.Combined)
		}
	})
	t.Run("named uninstalled remains visible in human and agent output", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"unused": `install("manual")`})
		for mode, want := range map[string]string{"0": "unused: not installed\n", "1": "tool:unused status:not-installed current: latest: cached:false\n"} {
			t.Setenv("AGENT", mode)
			out, err := p.run("tool", "check", "unused", "--installed")
			if err != nil {
				t.Fatalf("named uninstalled: %v\n%s", err, out.Combined)
			}
			mustContain(t, "stdout", out.Stdout, want)
		}
	})
}
