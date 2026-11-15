package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
)

func TestUpdateCommand_HelpAndUninstalled(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_, err := executeCommand("-c", configPath, "tool", "update", "non-existent-tool")
	if err == nil {
		t.Errorf("expected tool update non-existent-tool to return an error")
	}

	out, err := executeCommand("tool", "update", "--help")
	if err != nil {
		t.Fatalf("tool update --help failed: %v", err)
	}
	if !strings.Contains(out, "When run without arguments, checks all installed tools") || !strings.Contains(out, "dotfiles tool update ripgrep") {
		t.Errorf("expected tool update --help to contain usage details, got:\n%s", out)
	}
	if !strings.Contains(out, "--force") || !strings.Contains(out, "-f") {
		t.Errorf("expected tool update --help to contain --force / -f flag documentation, got:\n%s", out)
	}
}

func TestUpdateCommand_ForceFlag(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	// Test update with --force for all tools in dry-run mode
	outForceAll, err := executeCommand("-c", absConfig, "--dry-run", "tool", "update", "--force")
	if err != nil {
		t.Errorf("tool update --force failed: %v, out: %s", err, outForceAll)
	}

	// Test update with -f for a non-existent tool returns error
	_, err = executeCommand("-c", absConfig, "--dry-run", "tool", "update", "-f", "non-existent-tool")
	if err == nil {
		t.Errorf("expected tool update -f non-existent-tool to return an error")
	}
}

// TestUpdateCommands_UseBootstrappedInstallers guards which registry the update
// commands resolve installers from. BootstrapServices gives tests mock installers
// whose update check never leaves the process; a lookup in the global registry
// would reach the real GitHub installer and, outside MOCK_SERVER_PORT, api.github.com.
func TestUpdateCommands_UseBootstrappedInstallers(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parsing test server URL: %v", err)
	}
	t.Setenv("MOCK_SERVER_PORT", u.Port())

	p := newE2EProject(t, tsTools{"gh": `install("github-release", { repo: "acme/never-fetched" })`})
	p.seedInstallation(t, "gh", "v1.0.0", filepath.Join(p.Root, "installed", "gh"))

	for _, args := range [][]string{{"tool", "check"}, {"tool", "update", "gh"}, {"tool", "update"}} {
		out, err := p.run(args...)
		if err != nil {
			t.Fatalf("%v: %v\n%s", args, err, out.Combined)
		}
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("the release server was contacted %d time(s): the commands resolved the real GitHub installer instead of the bootstrapped mock", n)
	}
}

func TestConfigureInstallerForUpdate(t *testing.T) {
	const destDir = "dest"

	t.Run("github installer takes host, cache dir and ttl from the project", func(t *testing.T) {
		projCfg := &config.ProjectConfig{}
		projCfg.Github.Host = "http://github.test"
		projCfg.Github.Cache.TTL = 1500
		projCfg.Paths.GeneratedDir = filepath.Join("gen")

		gh := &installer.GitHubInstaller{}
		configureInstallerForUpdate(gh, destDir, projCfg)
		if gh.BinDir != destDir {
			t.Errorf("BinDir = %q, want %q", gh.BinDir, destDir)
		}
		if gh.BaseURL != "http://github.test" {
			t.Errorf("BaseURL = %q, want the project github host", gh.BaseURL)
		}
		if want := filepath.Join("gen", "cache", "github-api"); gh.CacheDir != want {
			t.Errorf("CacheDir = %q, want %q", gh.CacheDir, want)
		}
		if gh.CacheTTL != 1500*time.Millisecond {
			t.Errorf("CacheTTL = %v, want 1.5s", gh.CacheTTL)
		}
		if want := installer.NewGitHubSettings(projCfg); gh.GitHub != want {
			t.Errorf("GitHub = %+v, want %+v", gh.GitHub, want)
		}
	})

	t.Run("github installer keeps defaults when the project sets none", func(t *testing.T) {
		gh := &installer.GitHubInstaller{}
		configureInstallerForUpdate(gh, destDir, &config.ProjectConfig{})
		if gh.BaseURL != "" || gh.CacheDir != "" || gh.CacheTTL != 0 {
			t.Errorf("unexpected overrides: BaseURL=%q CacheDir=%q CacheTTL=%v", gh.BaseURL, gh.CacheDir, gh.CacheTTL)
		}
	})

	t.Run("gitea installer takes the cache dir from the project", func(t *testing.T) {
		projCfg := &config.ProjectConfig{}
		projCfg.Paths.GeneratedDir = "gen"
		gitea := &installer.GiteaInstaller{}
		configureInstallerForUpdate(gitea, destDir, projCfg)
		if gitea.BinDir != destDir {
			t.Errorf("BinDir = %q, want %q", gitea.BinDir, destDir)
		}
		if want := filepath.Join("gen", "cache", "gitea-api"); gitea.CacheDir != want {
			t.Errorf("CacheDir = %q, want %q", gitea.CacheDir, want)
		}
	})

	t.Run("cargo installer takes the cargo section from the project", func(t *testing.T) {
		projCfg := &config.ProjectConfig{}
		projCfg.Paths.GeneratedDir = "gen"
		projCfg.Cargo.CratesIo.Host = "https://crates.mirror.example"
		projCfg.Cargo.UserAgent = "my-bot"
		cargo := &installer.CargoInstaller{}
		configureInstallerForUpdate(cargo, destDir, projCfg)
		if want := installer.NewCargoSettings(projCfg); cargo.Cargo != want {
			t.Errorf("Cargo = %+v, want %+v", cargo.Cargo, want)
		}
	})

	cargo := &installer.CargoInstaller{}
	curlBinary := &installer.CurlBinaryInstaller{}
	curlScript := &installer.CurlScriptInstaller{}
	curlTar := &installer.CurlTarInstaller{}
	dmg := &installer.DmgInstaller{}
	manual := &installer.ManualInstaller{}
	zshPlugin := &installer.ZshPluginInstaller{}
	pkg := &installer.PkgInstaller{}
	uv := installer.NewUvInstaller(nil, nil, nil)

	binDirOnly := []struct {
		name   string
		inst   installer.Installer
		binDir func() string
	}{
		{"cargo", cargo, func() string { return cargo.BinDir }},
		{"curl-binary", curlBinary, func() string { return curlBinary.BinDir }},
		{"curl-script", curlScript, func() string { return curlScript.BinDir }},
		{"curl-tar", curlTar, func() string { return curlTar.BinDir }},
		{"dmg", dmg, func() string { return dmg.BinDir }},
		{"manual", manual, func() string { return manual.BinDir }},
		{"zsh-plugin", zshPlugin, func() string { return zshPlugin.BinDir }},
		{"pkg", pkg, func() string { return pkg.BinDir }},
		{"uv", uv, func() string { return uv.BinDir }},
	}
	for _, tt := range binDirOnly {
		t.Run(tt.name+" installer receives the destination dir", func(t *testing.T) {
			configureInstallerForUpdate(tt.inst, destDir, &config.ProjectConfig{})
			if got := tt.binDir(); got != destDir {
				t.Errorf("BinDir = %q, want %q", got, destDir)
			}
		})
	}
}

func TestUpdateCommand_InstalledTools(t *testing.T) {
	// The update check and the reinstall must go through the real installers so the
	// version comparison, the release cache and the download are what is tested.
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoNewer, repoSame = "acme/update-newer", "acme/update-same"
	// The release server answers 500 for a repository it does not publish, so the
	// update check of a tool pointed there fails.
	const repoMissing = "acme/update-missing"
	newReleaseServer(t, map[string]mockRelease{
		repoNewer: {Tag: "v9.9.9", Binaries: []string{"newer-bin", "unknown-current", "sudo-tool"}},
		repoSame:  {Tag: "v0.1.0", Binaries: []string{"same"}},
	})
	manualBin := filepath.Join(t.TempDir(), "manual-bin")
	if err := os.WriteFile(manualBin, []byte("#!/bin/sh\necho manual\n"), 0755); err != nil {
		t.Fatalf("writing manual binary: %v", err)
	}

	release := func(repo string) string {
		return fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q })`, repo, releaseAssetName)
	}
	manual := fmt.Sprintf(`install("manual", { binaryPath: %q })`, filepath.ToSlash(manualBin))
	p := newE2EProject(t, tsTools{
		"newer":              release(repoNewer) + `.bin("newer-bin")`,
		"unknown-current":    release(repoNewer),
		"sudo-tool":          release(repoNewer) + `.sudo()`,
		"same":               release(repoSame),
		"manual-versioned":   manual,
		"manual-unversioned": manual,
		"check-fails":        release(repoMissing),
		"never-installed":    `install("manual")`,
	})

	installRoot := filepath.Join(p.Root, "installed")
	for name, version := range map[string]string{
		"newer":              "v0.1.0",
		"unknown-current":    "unknown",
		"sudo-tool":          "v0.1.0",
		"same":               "v0.1.0",
		"manual-versioned":   "v1.0.0",
		"manual-unversioned": "",
		"check-fails":        "v0.1.0",
	} {
		dir := filepath.Join(installRoot, name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating install dir: %v", err)
		}
		p.seedInstallation(t, name, version, dir)
	}

	t.Run("installs a newer release and records its version", func(t *testing.T) {
		out, err := p.run("tool", "update", "newer")
		if err != nil {
			t.Fatalf("tool update newer: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "New version available: v0.1.0 -> v9.9.9", "Successfully updated to version v9.9.9")
		if rec := p.installation(t, "newer"); rec == nil || rec.Version != "v9.9.9" {
			t.Fatalf("installation record after update = %+v, want version v9.9.9", rec)
		}
	})

	t.Run("reports an up to date tool from the cached release", func(t *testing.T) {
		// The previous subtest fetched this repository, so the installer answers from its cache.
		out, err := p.run("tool", "update", "newer")
		if err != nil {
			t.Fatalf("tool update newer again: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Already up to date (v9.9.9, cached)")
	})

	t.Run("reports an up to date tool on a fresh fetch", func(t *testing.T) {
		out, err := p.run("tool", "update", "same")
		if err != nil {
			t.Fatalf("tool update same: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Already up to date (v0.1.0)")
		mustNotContain(t, "stderr", out.Stderr, "cached")
	})

	t.Run("treats an unparsable installed version as outdated", func(t *testing.T) {
		out, err := p.run("tool", "update", "unknown-current")
		if err != nil {
			t.Fatalf("tool update unknown-current: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "New version available: unknown -> v9.9.9")
	})

	// The manual installer has nothing upstream to ask, so, as in v1, update says so and
	// reinstalls instead of describing the tool as up to date, with or without a version.
	for _, name := range []string{"manual-versioned", "manual-unversioned"} {
		t.Run("reinstalls "+name+" whose installer cannot check for updates", func(t *testing.T) {
			out, err := p.run("tool", "update", name)
			if err != nil {
				t.Fatalf("tool update %s: %v\n%s", name, err, out.Combined)
			}
			mustContain(t, "stderr", out.Stderr,
				fmt.Sprintf(`[%s] Update check not supported for installer "manual", performing regular install instead`, name),
				fmt.Sprintf("[%s] Successfully updated to version", name),
			)
			mustNotContain(t, "stderr", out.Stderr, "up to date")
		})
	}

	t.Run("force reinstalls a tool whose installer cannot check for updates", func(t *testing.T) {
		out, err := p.run("tool", "update", "--force", "manual-versioned")
		if err != nil {
			t.Fatalf("tool update --force manual-versioned: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr,
			`Update check not supported for installer "manual", performing regular install instead`,
			"Successfully updated to version",
		)
	})

	// The shim prints nothing of its own for @update, so shim mode reports what became
	// of the tool and nothing of the checking and installing that led there.
	t.Run("shim mode reports the outcome without the progress", func(t *testing.T) {
		out, err := p.run("tool", "update", "--shim-mode", "manual-versioned")
		if err != nil {
			t.Fatalf("tool update --shim-mode: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "" {
			t.Errorf("stdout = %q, want nothing in shim mode", out.Stdout)
		}
		lines := strings.Split(strings.TrimSpace(out.Stderr), "\n")
		if len(lines) != 2 ||
			!strings.Contains(lines[0], `[manual-versioned] Update check not supported for installer "manual", performing regular install instead`) ||
			!strings.Contains(lines[1], "[manual-versioned] Successfully updated to version") {
			t.Fatalf("stderr in shim mode = %q, want only the unsupported-check warning and the result", out.Stderr)
		}
		if strings.Contains(out.Stderr, "[update]") {
			t.Errorf("stderr contains unexpected [update] tag: %q", out.Stderr)
		}
	})

	t.Run("shim mode reports an up to date tool", func(t *testing.T) {
		out, err := p.run("tool", "update", "--shim-mode", "same")
		if err != nil {
			t.Fatalf("tool update --shim-mode same: %v\n%s", err, out.Combined)
		}
		if got := strings.TrimSpace(out.Stderr); !strings.Contains(got, "[same] Already up to date (v0.1.0") || strings.Contains(got, "\n") {
			t.Fatalf("stderr in shim mode = %q, want only the up to date report", out.Stderr)
		}
		if strings.Contains(out.Stderr, "[update]") {
			t.Errorf("stderr contains unexpected [update] tag: %q", out.Stderr)
		}
	})

	t.Run("a failed installation is an error", func(t *testing.T) {
		out, err := p.run("tool", "update", "sudo-tool")
		if err == nil {
			t.Fatalf("expected tool update sudo-tool to fail:\n%s", out.Combined)
		}
		mustContain(t, "error", err.Error(), `updating tool "sudo-tool" to version v9.9.9 failed`, "does not support sudo")
	})

	t.Run("a tool that is not installed is an error", func(t *testing.T) {
		_, err := p.run("tool", "update", "never-installed")
		if err == nil || !strings.Contains(err.Error(), `tool "never-installed" is not installed`) {
			t.Fatalf("error = %v, want not-installed failure", err)
		}
	})

	// Every failure names its cause without --trace (#131): the logger keeps an error
	// argument's text for --trace, so the cause has to be part of the message. The run
	// goes on past each failure and then exits non-zero (#132).
	t.Run("updating everything reports what it cannot update and continues past failures", func(t *testing.T) {
		out, err := p.run("tool", "update")
		mustFailAfterLogging(t, err, out)
		mustContain(t, "stderr", out.Stderr,
			"Checking all configured tools for updates...",
			`[sudo-tool] Updating to version v9.9.9 failed: installer "github-release" does not support sudo elevation`,
			// Updating everything leaves a tool nothing could check alone unless forced.
			`[manual-versioned] Update check not supported for installer "manual"`,
			`[check-fails] Update check failed: checking update for "check-fails": GitHub API returned status 500`,
		)
		mustNotContain(t, "stderr", out.Stderr,
			"[never-installed]",
			"performing regular install instead", "[manual-versioned] Successfully updated",
		)
	})

	t.Run("force updating everything reinstalls each installed tool whose check did not fail", func(t *testing.T) {
		out, err := p.run("tool", "update", "--force")
		mustFailAfterLogging(t, err, out)
		mustContain(t, "stderr", out.Stderr,
			"[same] Force updating: reinstalling version v0.1.0",
			`[manual-versioned] Update check not supported for installer "manual", performing regular install instead`,
			"[manual-versioned] Successfully updated to version",
			// --force does not bypass a failed check, as for a named tool.
			`[check-fails] Update check failed: checking update for "check-fails": GitHub API returned status 500`,
		)
		mustNotContain(t, "stderr", out.Stderr, "[check-fails] Force updating", "[check-fails] Successfully")
	})
}

// TestUpdateCommand_BulkExitStatus pins the exit status of updating everything (#132):
// like rm with many operands, it goes on to every other tool after one it could not
// update and then fails, so a script or a scheduled job can tell. Each failure is tested
// on its own next to a tool that is updated, and a run whose only outcomes are tools it
// leaves alone by design succeeds.
func TestUpdateCommand_BulkExitStatus(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoNewer, repoSame, repoMissing = "acme/bulk-newer", "acme/bulk-same", "acme/bulk-missing"
	newReleaseServer(t, map[string]mockRelease{
		repoNewer: {Tag: "v9.9.9", Binaries: []string{"newer", "sudo-tool"}},
		repoSame:  {Tag: "v0.1.0", Binaries: []string{"same", "ahead", "pinned"}},
	})
	manualBin := filepath.Join(t.TempDir(), "manual-bin")
	if err := os.WriteFile(manualBin, []byte("#!/bin/sh\necho manual\n"), 0755); err != nil {
		t.Fatalf("writing manual binary: %v", err)
	}
	tool := func(repo string) string {
		return fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q })`, repo, releaseAssetName)
	}
	newer := tool(repoNewer)

	tests := []struct {
		name      string
		tools     tsTools
		installed map[string]string
		// wantFailure is the logged failure the run must end in ErrSilent for; empty
		// means the run must succeed.
		wantFailure string
	}{
		{
			name:        "a failed update check",
			tools:       tsTools{"newer": newer, "check-fails": tool(repoMissing)},
			installed:   map[string]string{"newer": "v0.1.0", "check-fails": "v0.1.0"},
			wantFailure: `[check-fails] Update check failed: checking update for "check-fails": GitHub API returned status 500`,
		},
		{
			name:        "a failed reinstall",
			tools:       tsTools{"newer": newer, "sudo-tool": tool(repoNewer) + `.sudo()`},
			installed:   map[string]string{"newer": "v0.1.0", "sudo-tool": "v0.1.0"},
			wantFailure: `[sudo-tool] Updating to version v9.9.9 failed: installer "github-release" does not support sudo elevation`,
		},
		{
			name: "only tools left alone by design",
			tools: tsTools{
				"newer":           newer,
				"same":            tool(repoSame),
				"ahead":           tool(repoSame),
				"pinned":          tool(repoSame) + `.version("v0.1.0")`,
				"hand":            fmt.Sprintf(`install("manual", { binaryPath: %q })`, filepath.ToSlash(manualBin)),
				"never-installed": tool(repoMissing),
				// Disabled after it was installed: skipped as install and check skip it,
				// so its check, which would fail, never runs.
				"off": tool(repoMissing) + `.disable()`,
			},
			installed: map[string]string{"newer": "v0.1.0", "same": "v0.1.0", "ahead": "v1.0.0", "pinned": "v0.1.0", "hand": "v1.0.0", "off": "v0.1.0"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := newE2EProject(t, tt.tools)
			for name, version := range tt.installed {
				dir := filepath.Join(p.Root, "installed", name)
				if err := os.MkdirAll(dir, 0755); err != nil {
					t.Fatalf("creating install dir: %v", err)
				}
				p.seedInstallation(t, name, version, dir)
			}

			out, err := p.run("tool", "update")
			// The tool beside the failure is updated whichever of the two comes first.
			mustContain(t, "stderr", out.Stderr, "[newer] Successfully updated to version v9.9.9")
			if tt.wantFailure == "" {
				if err != nil {
					t.Fatalf("tool update: %v\n%s", err, out.Combined)
				}
				mustNotContain(t, "stderr", out.Stderr, "ERROR", "failed")
				return
			}
			mustFailAfterLogging(t, err, out)
			mustContain(t, "stderr", out.Stderr, tt.wantFailure)
		})
	}
}

// TestUpdateCommand_UnreadableInstallation pins that tool update tells an installation
// record it cannot read from a tool that is not installed (#131): updating everything
// reports the tool with the cause instead of skipping it, even with --force, and a named
// tool fails with the read error instead of calling the tool not installed.
func TestUpdateCommand_UnreadableInstallation(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repo = "acme/unreadable-update"
	newReleaseServer(t, map[string]mockRelease{repo: {Tag: "v1.0.0"}})
	p := newE2EProject(t, tsTools{"unreadable": fmt.Sprintf(`install("github-release", { repo: %q })`, repo)})
	p.seedUnreadableInstallation(t, "unreadable")

	for _, args := range [][]string{{"tool", "update"}, {"tool", "update", "--force"}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			out, err := p.run(args...)
			mustFailAfterLogging(t, err, out)
			mustContain(t, "stderr", out.Stderr, "[unreadable] Reading the installation record failed: scanning tool installation record: ", unreadableInstallationCause)
			mustNotContain(t, "stderr", out.Stderr, "[unreadable] Force updating", "[unreadable] Successfully")
		})
	}

	t.Run("named", func(t *testing.T) {
		_, err := p.run("tool", "update", "unreadable")
		if err == nil {
			t.Fatal("expected tool update unreadable to fail")
		}
		mustContain(t, "error", err.Error(), `reading the installation of "unreadable": `, unreadableInstallationCause)
		mustNotContain(t, "error", err.Error(), "not installed")
	})
}

// TestUpdateCommand_SkipsConfigurationOnlyTools pins that updating everything leaves a
// tool with no installation method alone, even when it has an installation record left
// from when it had one, and goes on to update the other tools.
func TestUpdateCommand_SkipsConfigurationOnlyTools(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	manualBin := filepath.Join(t.TempDir(), "manual-bin")
	if err := os.WriteFile(manualBin, []byte("#!/bin/sh\necho manual\n"), 0755); err != nil {
		t.Fatalf("writing manual binary: %v", err)
	}
	p := newE2EProject(t, tsTools{
		"cfg":  `install()`,
		"hand": fmt.Sprintf(`install("manual", { binaryPath: %q })`, filepath.ToSlash(manualBin)),
	})
	for _, name := range []string{"cfg", "hand"} {
		p.seedInstallation(t, name, "v1.0.0", filepath.Join(p.Root, "installed", name))
	}

	out, err := p.run("tool", "update", "--force")
	if err != nil {
		t.Fatalf("tool update --force: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "[hand] Successfully updated to version")
	mustNotContain(t, "stderr", out.Stderr, "[cfg]")
}

// TestUpdateCommand_UpdateCheckEnabled pins that bulk tool update skips a tool
// with updateCheck.enabled: false without querying its installer, and targeted
// update refuses it (#159).
func TestUpdateCommand_UpdateCheckEnabled(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	const repoOff, repoUpd = "acme/uc-update-off", "acme/uc-update-upd"
	var offRequests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "acme/uc-update-off") {
			offRequests.Add(1)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/releases/latest") {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"tag_name": "v9.9.9", "assets": [{"name": %q, "browser_download_url": "%s/download/%s"}]}`,
				releaseAssetName, "http://"+r.Host, releaseAssetName)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/"+releaseAssetName) {
			w.Header().Set("Content-Type", "application/gzip")
			_, _ = w.Write(createTestTarGz(t, map[string]string{"upd": "#!/bin/sh\necho upd v9.9.9\n"}))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	u, _ := url.Parse(server.URL)
	t.Setenv("MOCK_SERVER_PORT", u.Port())

	p := newE2EProject(t, tsTools{
		"off": fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q }).updateCheck({ enabled: false })`, repoOff, releaseAssetName),
		"upd": fmt.Sprintf(`install("github-release", { repo: %q, assetPattern: %q })`, repoUpd, releaseAssetName),
	})
	p.seedInstallation(t, "off", "v0.1.0", filepath.Join(p.Root, "installed", "off"))
	p.seedInstallation(t, "upd", "v0.1.0", filepath.Join(p.Root, "installed", "upd"))

	t.Run("bulk update skips enabled: false tool without querying installer", func(t *testing.T) {
		out, err := p.run("tool", "update")
		if err != nil {
			t.Fatalf("tool update: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[off] Skipping update: update checks are disabled in configuration")
		mustContain(t, "stderr", out.Stderr, "[upd] Successfully updated to version v9.9.9")
		if got := offRequests.Load(); got != 0 {
			t.Fatalf("installer for off was queried %d times; want 0", got)
		}
		if rec := p.installation(t, "off"); rec == nil || rec.Version != "v0.1.0" {
			t.Fatalf("installation record for off = %+v, want untouched v0.1.0", rec)
		}
		if rec := p.installation(t, "upd"); rec == nil || rec.Version != "v9.9.9" {
			t.Fatalf("installation record for upd = %+v, want updated v9.9.9", rec)
		}
	})

	t.Run("targeted update refuses enabled: false tool", func(t *testing.T) {
		offRequests.Store(0)
		out, err := p.run("tool", "update", "off")
		if err == nil {
			t.Fatalf("expected tool update off to fail\n%s", out.Combined)
		}
		mustContain(t, "error", err.Error(), `tool "off" has update checks disabled via updateCheck.enabled`)
		if got := offRequests.Load(); got != 0 {
			t.Fatalf("installer for off was queried %d times; want 0", got)
		}
		if rec := p.installation(t, "off"); rec == nil || rec.Version != "v0.1.0" {
			t.Fatalf("installation record for off = %+v, want untouched v0.1.0", rec)
		}
	})
}

func TestNamedUpdatesContinueAfterFailure(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	newReleaseServer(t, map[string]mockRelease{
		"acme/healthy": {Tag: "v9.9.9", Binaries: []string{"z-good", "a-broken"}},
	})
	for _, broken := range []struct {
		name string
		tool string
	}{
		{"failed check", `install("github-release", {repo: "acme/unavailable"})`},
		{"disabled checks", `install("github-release", {repo: "acme/healthy"}).updateCheck({enabled: false})`},
		{"failed reinstall", `install("github-release", {repo: "acme/healthy"}).sudo()`},
	} {
		t.Run(broken.name, func(t *testing.T) {
			p := newE2EProject(t, tsTools{
				"a-broken": broken.tool,
				"z-good":   fmt.Sprintf(`install("github-release", {repo: "acme/healthy", assetPattern: %q})`, releaseAssetName),
			})
			for _, name := range []string{"a-broken", "z-good"} {
				p.seedInstallation(t, name, "v0.1.0", filepath.Join(p.Root, "installed", name))
			}
			out, err := p.run("tool", "update", "a-broken", "z-good")
			if err == nil {
				t.Fatalf("update batch succeeded despite failed first tool\n%s", out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "[a-broken]", "[z-good] Successfully updated to version v9.9.9")
			if rec := p.installation(t, "z-good"); rec == nil || rec.Version != "v9.9.9" {
				t.Fatalf("healthy tool was not updated: %+v", rec)
			}
		})
	}
}
