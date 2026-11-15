package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// TestUpdateCommand_RecordedVersion checks what the installation record holds after
// update reinstalls a tool whose installer cannot check upstream: a fresh timestamp
// for a tool with no version of its own, or the version its installer detects -- never
// the version the previous installation left. A tool whose configuration pins a
// version is not reinstalled at all (TestUpdateCommand_RefusesPinnedTools).
func TestUpdateCommand_RecordedVersion(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const staleTimestamp = "2000-01-01-00-00-00"
	manualBin := filepath.Join(t.TempDir(), "manual-bin")
	if err := os.WriteFile(manualBin, []byte("#!/bin/sh\necho manual\n"), 0755); err != nil {
		t.Fatalf("writing manual binary: %v", err)
	}
	// The install script leaves a binary that reports version 2.3.4 in the staging
	// directory. Any other path is missing, so a script tool pointed there fails to install.
	const scriptPath = "/install.sh"
	script := "#!/bin/sh\nset -e\nprintf '#!/bin/sh\\necho \"detected 2.3.4\"\\n' > \"$INSTALL_DIR/detected\"\nchmod +x \"$INSTALL_DIR/detected\"\n"
	scriptServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != scriptPath {
			http.NotFound(w, r)
			return
		}
		_, _ = io.WriteString(w, script)
	}))
	t.Cleanup(scriptServer.Close)

	manual := fmt.Sprintf(`install("manual", { binaryPath: %q })`, filepath.ToSlash(manualBin))
	p := newE2EProject(t, tsTools{
		"stamped-forced": manual,
		"stamped-named":  manual,
		"stamped-batch":  manual,
		"detected": fmt.Sprintf(`install("curl-script", {
			url: %q, shell: "sh", env: { INSTALL_DIR: "{stagingDir}" },
			versionArgs: ["--version"], versionRegex: "detected (\\d+\\.\\d+\\.\\d+)",
		})`, scriptServer.URL+scriptPath),
		"broken": fmt.Sprintf(`install("curl-script", { url: %q })`, scriptServer.URL+"/missing.sh"),
	})

	// seed installs the tool for real, so the installation update finds is healthy and
	// only a reinstall that is actually carried out can change the record, then
	// rewrites the recorded version to what a previous installation left.
	seed := func(t *testing.T, name, version string) {
		t.Helper()
		if out, err := p.run("tool", "install", name); err != nil {
			t.Fatalf("tool install %s: %v\n%s", name, err, out.Combined)
		}
		p.seedRegistry(t, func(ctx context.Context, reg *registry.Registry, tx *sql.Tx) error {
			return reg.UpdateToolInstallation(ctx, tx, name, registry.ToolInstallationUpdate{Version: &version})
		})
	}
	recorded := func(t *testing.T, name string) string {
		t.Helper()
		rec := p.installation(t, name)
		if rec == nil {
			t.Fatalf("no installation record for %s", name)
		}
		return rec.Version
	}
	mustBeFreshTimestamp := func(t *testing.T, name string) {
		t.Helper()
		got := recorded(t, name)
		if got == staleTimestamp {
			t.Fatalf("%s still records the previous installation's timestamp %q", name, got)
		}
		if _, err := time.Parse(utils.TimestampLayout, got); err != nil {
			t.Fatalf("%s records %q, want a generated timestamp: %v", name, got, err)
		}
	}

	t.Run("a forced reinstall of a timestamp-versioned tool records a new timestamp", func(t *testing.T) {
		seed(t, "stamped-forced", staleTimestamp)
		out, err := p.run("tool", "update", "--force", "stamped-forced")
		if err != nil {
			t.Fatalf("tool update --force stamped-forced: %v\n%s", err, out.Combined)
		}
		mustBeFreshTimestamp(t, "stamped-forced")
		mustContain(t, "stderr", out.Stderr, "Successfully updated to version "+recorded(t, "stamped-forced"))
	})

	t.Run("reinstalling a named tool nothing could check records a new timestamp", func(t *testing.T) {
		seed(t, "stamped-named", staleTimestamp)
		out, err := p.run("tool", "update", "stamped-named")
		if err != nil {
			t.Fatalf("tool update stamped-named: %v\n%s", err, out.Combined)
		}
		mustBeFreshTimestamp(t, "stamped-named")
	})

	t.Run("a forced batch update records a new timestamp", func(t *testing.T) {
		seed(t, "stamped-batch", staleTimestamp)
		out, err := p.run("tool", "update", "--force")
		if err != nil {
			t.Fatalf("tool update --force: %v\n%s", err, out.Combined)
		}
		mustBeFreshTimestamp(t, "stamped-batch")
	})

	t.Run("the version the installer detects is recorded", func(t *testing.T) {
		seed(t, "detected", "1.0.0")
		out, err := p.run("tool", "update", "detected")
		if err != nil {
			t.Fatalf("tool update detected: %v\n%s", err, out.Combined)
		}
		if got := recorded(t, "detected"); got != "2.3.4" {
			t.Fatalf("detected records %q, want the detected 2.3.4", got)
		}
		mustContain(t, "stderr", out.Stderr, "Successfully updated to version 2.3.4")
	})

	t.Run("a failed reinstall names no version it never asked for", func(t *testing.T) {
		dir := filepath.Join(p.Root, "installed", "broken")
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating install dir: %v", err)
		}
		p.seedInstallation(t, "broken", staleTimestamp, dir)
		_, err := p.run("tool", "update", "broken")
		if err == nil {
			t.Fatal("expected tool update broken to fail")
		}
		mustContain(t, "error", err.Error(), `updating tool "broken" failed:`)
		if got := recorded(t, "broken"); got != staleTimestamp {
			t.Fatalf("broken records %q after a failed reinstall, want the untouched %q", got, staleTimestamp)
		}
	})
}

// pinnedUpdateMessage is what update reports for a tool whose configuration pins
// version, in the words v1's toolVersionPinned used.
func pinnedUpdateMessage(toolName, version string) string {
	return fmt.Sprintf("Tool %q is pinned to version `%s`. Set version to \"latest\" in the tool config to enable updates", toolName, version)
}

// pinnedByInstallParamMessage is what update reports for a tool whose `version` install
// parameter pins it: the parameter, which the installer honours over .version(), is
// the setting that enables updates.
func pinnedByInstallParamMessage(toolName, version string) string {
	return fmt.Sprintf("Tool %q is pinned to version `%s` by its \"version\" install parameter. Set \"version\" to \"latest\" in the tool config to enable updates", toolName, version)
}

// TestUpdateCommand_RefusesPinnedTools is the regression test for update replacing a
// .version() pin with the latest upstream release. As in v1, a pinned tool is refused
// before anything is checked or installed, whether it is named, updated with everything
// else, updated from a shim or forced, and whether or not its installer can check
// upstream. An unpinned tool on the same upstream is still updated, so the refusals are
// not the harness failing to install anything.
func TestUpdateCommand_RefusesPinnedTools(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repo = "acme/update-pinned"
	newReleaseServer(t, map[string]mockRelease{
		repo: {Tag: "v9.9.9", Binaries: []string{"pinned", "param-pinned", "both-pinned", "free"}},
	})
	manualBin := filepath.Join(t.TempDir(), "manual-bin")
	if err := os.WriteFile(manualBin, []byte("#!/bin/sh\necho manual\n"), 0755); err != nil {
		t.Fatalf("writing manual binary: %v", err)
	}

	// param-pinned and both-pinned pin through the `version` install parameter that
	// github-release reads, which wins over .version(); both-pinned is therefore pinned
	// to its parameter's v0.1.0 rather than its .version() of v0.2.0.
	release := fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q })`, repo, releaseAssetName)
	releaseAt := func(version string) string {
		return fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q, version: %q })`, repo, releaseAssetName, version)
	}
	p := newE2EProject(t, tsTools{
		"pinned":        release + `.version("v0.1.0")`,
		"param-pinned":  releaseAt("v0.1.0") + `.version("latest")`,
		"both-pinned":   releaseAt("v0.1.0") + `.version("v0.2.0")`,
		"manual-pinned": fmt.Sprintf(`install("manual", { binaryPath: %q }).version("v1.0.0")`, filepath.ToSlash(manualBin)),
		"free":          release + `.version("latest")`,
	})
	pins := []struct{ name, version, message string }{
		{"pinned", "v0.1.0", pinnedUpdateMessage("pinned", "v0.1.0")},
		{"param-pinned", "v0.1.0", pinnedByInstallParamMessage("param-pinned", "v0.1.0")},
		{"both-pinned", "v0.1.0", pinnedByInstallParamMessage("both-pinned", "v0.1.0")},
		{"manual-pinned", "v1.0.0", pinnedUpdateMessage("manual-pinned", "v1.0.0")},
	}
	seed := func(t *testing.T) {
		t.Helper()
		seeded := map[string]string{"free": "v0.1.0"}
		for _, pin := range pins {
			seeded[pin.name] = pin.version
		}
		for name, version := range seeded {
			dir := filepath.Join(p.Root, "installed", name)
			if err := os.MkdirAll(dir, 0755); err != nil {
				t.Fatalf("creating install dir: %v", err)
			}
			p.seedInstallation(t, name, version, dir)
		}
	}
	mustKeepPin := func(t *testing.T, out commandOutput, name, version, message string) {
		t.Helper()
		tag := "[" + name + "] "
		mustContain(t, "stderr", out.Stderr, tag+message)
		mustNotContain(t, "stderr", out.Stderr,
			tag+"Checking for updates", tag+"New version available", tag+"Force updating", tag+"Update check not supported",
			tag+"Fetching release info", tag+"Successfully updated",
		)
		if rec := p.installation(t, name); rec == nil || rec.Version != version {
			t.Fatalf("%s installation record after update = %+v, want the pinned %s", name, rec, version)
		}
	}
	mustKeepPins := func(t *testing.T, out commandOutput) {
		t.Helper()
		for _, pin := range pins {
			mustKeepPin(t, out, pin.name, pin.version, pin.message)
		}
	}

	for _, args := range [][]string{
		{"tool", "update", "pinned", "param-pinned", "both-pinned", "manual-pinned"},
		{"tool", "update", "--force", "pinned", "param-pinned", "both-pinned", "manual-pinned"},
		{"tool", "update"},
		{"tool", "update", "--force"},
	} {
		t.Run(strings.Join(args, " ")+" keeps the pinned versions", func(t *testing.T) {
			seed(t)
			out, err := p.run(args...)
			if err != nil {
				t.Fatalf("%s: %v\n%s", strings.Join(args, " "), err, out.Combined)
			}
			mustKeepPins(t, out)
		})
	}

	t.Run("updating everything still updates an unpinned tool", func(t *testing.T) {
		seed(t)
		out, err := p.run("tool", "update")
		if err != nil {
			t.Fatalf("tool update: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[free] New version available: v0.1.0 -> v9.9.9")
		if rec := p.installation(t, "free"); rec == nil || rec.Version != "v9.9.9" {
			t.Fatalf("free installation record after update = %+v, want v9.9.9", rec)
		}
	})

	// The release an update installs is not written into the loaded configuration,
	// where the second mention of the tool would read it as a pin and refuse it.
	t.Run("naming an unpinned tool twice does not turn its update into a pin", func(t *testing.T) {
		seed(t)
		out, err := p.run("tool", "update", "free", "free")
		if err != nil {
			t.Fatalf("tool update free free: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[free] New version available: v0.1.0 -> v9.9.9", "[free] Already up to date (v9.9.9")
		mustNotContain(t, "stderr", out.Stderr, "is pinned to version")
	})

	// A shim's @update prints nothing of its own, so the refusal is the only answer the
	// user gets: shim mode must show it, succeed as the refusal does everywhere else,
	// and leave out the progress it hides for every other outcome.
	for _, pin := range pins {
		t.Run("a shim's @update reports that "+pin.name+" is pinned", func(t *testing.T) {
			seed(t)
			out, err := p.run("tool", "update", "--shim-mode", pin.name)
			if err != nil {
				t.Fatalf("tool update --shim-mode %s: %v\n%s", pin.name, err, out.Combined)
			}
			mustKeepPin(t, out, pin.name, pin.version, pin.message)
			mustNotContain(t, "stderr", out.Stderr, "Evaluating versions")
			if out.Stdout != "" {
				t.Errorf("stdout = %q, want nothing: the refusal is a status message", out.Stdout)
			}
		})
	}
}

// TestAheadOfLatest pins what tool check and tool update do with a tool installed at a
// version newer than the latest release upstream, the state #124 left cargo tools in
// that the old max_version resolution had moved onto a prerelease (#130). It is its own
// status, never "up to date" or an update, and update never downgrades it: without
// --force it leaves the tool alone, and with it reinstalls the installed version.
func TestAheadOfLatest(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repo, installed, latest = "acme/ahead", "v3.0.0-alpha.2", "v2.11.6"
	newReleaseServer(t, map[string]mockRelease{repo: {Tag: latest, OtherTags: []string{installed}, Binaries: []string{"ahead"}}})

	p := newE2EProject(t, tsTools{
		"ahead": fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q })`, repo, releaseAssetName),
	})
	dir := filepath.Join(p.Root, "installed", "ahead")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("creating install dir: %v", err)
	}
	p.seedInstallation(t, "ahead", installed, dir)
	const aheadMessage = installed + " is ahead of the latest known version (" + latest + ")"

	t.Run("tool check", func(t *testing.T) {
		out, err := p.run("tool", "check")
		if err != nil {
			t.Fatalf("tool check: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "ahead ("+installed+") is ahead of the latest known version ("+latest+")\n")
		mustContain(t, "stderr", out.Stderr, "[ahead] "+aheadMessage)
		mustNotContain(t, "output", out.Combined, "up to date", "Up to date", "update available", "Update available")
	})

	t.Run("tool check in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("tool", "check")
		if err != nil {
			t.Fatalf("tool check: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "tool:ahead status:ahead-of-latest current:"+installed+" latest:"+latest+" cached:")
	})

	t.Run("tool check --json", func(t *testing.T) {
		out, err := p.run("tool", "check", "--json")
		if err != nil {
			t.Fatalf("tool check --json: %v\n%s", err, out.Combined)
		}
		var results []ToolUpdateResult
		if err := json.Unmarshal([]byte(out.Stdout), &results); err != nil {
			t.Fatalf("stdout is not a JSON array of results: %v\n%s", err, out.Stdout)
		}
		want := ToolUpdateResult{ToolName: "ahead", Status: orchestrator.CheckStatusAheadOfLatest, CurrentVersion: installed, LatestVersion: latest}
		if len(results) != 1 || results[0].ToolName != want.ToolName || results[0].Status != want.Status ||
			results[0].CurrentVersion != want.CurrentVersion || results[0].LatestVersion != want.LatestVersion {
			t.Errorf("results = %+v, want one entry %+v", results, want)
		}
		mustContain(t, "stdout", out.Stdout, `"status": "ahead-of-latest"`)
	})

	for _, args := range [][]string{{"tool", "update", "ahead"}, {"tool", "update"}} {
		t.Run(strings.Join(args, " ")+" leaves it alone", func(t *testing.T) {
			out, err := p.run(args...)
			if err != nil {
				t.Fatalf("%v: %v\n%s", args, err, out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "[ahead] "+aheadMessage)
			mustNotContain(t, "stderr", out.Stderr, "Already up to date", "New version available", "Force updating", "Successfully")
			if rec := p.installation(t, "ahead"); rec == nil || rec.Version != installed {
				t.Fatalf("installation record = %+v, want it left at %s", rec, installed)
			}
		})
	}

	t.Run("tool update --force reinstalls the installed version", func(t *testing.T) {
		out, err := p.run("tool", "update", "--force", "ahead")
		if err != nil {
			t.Fatalf("tool update --force ahead: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr,
			"[ahead] Force updating: reinstalling installed version "+installed+", which is ahead of the latest known version ("+latest+")",
			"[ahead] Successfully reinstalled version "+installed,
		)
		mustNotContain(t, "stderr", out.Stderr, "Successfully updated", "reinstalling version "+latest)
		if rec := p.installation(t, "ahead"); rec == nil || rec.Version != installed {
			t.Fatalf("installation record = %+v, want %s, never the older %s", rec, installed, latest)
		}
	})
}

func TestUpdateCommand_PreservesRollingRelease(t *testing.T) {
	for _, force := range []bool{false, true} {
		t.Run(fmt.Sprintf("force=%t", force), func(t *testing.T) {
			t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
			const repo = "acme/rolling"
			newReleaseServer(t, map[string]mockRelease{repo: {Tag: "latest", Binaries: []string{"rolling"}}})
			p := newE2EProject(t, tsTools{
				"rolling": `install("github-release", {repo: "acme/rolling", assetPattern: "tool.tar.gz"}).bin("rolling")`,
			})
			const previous = "2000-01-01-00-00-00"
			p.seedInstallation(t, "rolling", previous, filepath.Join(p.Root, "installed", "rolling"))
			out, err := p.run("tool", "check", "rolling", "--json")
			if err != nil {
				t.Fatalf("checking rolling release: %v\n%s", err, out.Combined)
			}
			var checks []ToolUpdateResult
			if err := json.Unmarshal([]byte(out.Stdout), &checks); err != nil || len(checks) != 1 || checks[0].LatestVersion != "latest" {
				t.Fatalf("check did not preserve upstream identity: %v\n%s", err, out.Stdout)
			}
			args := []string{"tool", "update", "rolling"}
			if force {
				args = append(args, "--force")
			}
			out, err = p.run(args...)
			if err != nil {
				t.Fatalf("updating rolling release: %v\n%s", err, out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "New version available: "+previous+" -> latest", "Successfully updated")
			mustNotContain(t, "output", out.Combined, "("+previous+")", "status 404")
			rec := p.installation(t, "rolling")
			if rec == nil || rec.Version == "" || rec.Version == previous || rec.Version == "latest" {
				t.Fatalf("expected fresh installation receipt, got %+v", rec)
			}
			binary := filepath.Join(p.GeneratedDir, "binaries", "rolling", "current", "rolling")
			contents, err := os.ReadFile(binary)
			if err != nil || !strings.Contains(string(contents), "rolling latest") {
				t.Fatalf("rolling release payload not installed: %v\n%s", err, contents)
			}
		})
	}
}
