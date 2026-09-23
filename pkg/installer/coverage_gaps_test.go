package installer

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func newTestGitHubInstaller(t *testing.T, memFS fs.FS) *GitHubInstaller {
	t.Helper()
	return NewGitHubInstaller(exec.NewMockRunner(), memFS, nil, nil)
}

// SetGitHubSettings applies to the installers that resolve releases and is a no-op
// for the ones that do not, so a caller can hand the settings to every installer in
// the registry without knowing which is which.
func TestSetGitHubSettings(t *testing.T) {
	settings := GitHubSettings{
		Host:         "https://github.example.com",
		Token:        "t0ken",
		UserAgent:    "dotfiles-test",
		CacheEnabled: true,
	}

	gh := newTestGitHubInstaller(t, fs.NewMemFS())
	SetGitHubSettings(gh, settings)
	if gh.GitHub != settings {
		t.Errorf("GitHub = %+v, want %+v", gh.GitHub, settings)
	}
	if gh.BaseURL != settings.Host {
		t.Errorf("BaseURL = %q, want %q", gh.BaseURL, settings.Host)
	}
	if !gh.CacheEnabled {
		t.Error("CacheEnabled = false, want true")
	}

	// An installer that resolves nothing from GitHub simply ignores them.
	SetGitHubSettings(NewManualInstaller(fs.NewMemFS(), nil), settings)
}

func TestIsMacPackageAsset(t *testing.T) {
	tests := []struct {
		name  string
		asset string
		ext   string
		want  bool
	}{
		{name: "the package itself", asset: "Tool-1.2.3.dmg", ext: ".dmg", want: true},
		{name: "uppercase package", asset: "TOOL.DMG", ext: ".dmg", want: true},
		{name: "archive wrapping a package", asset: "tool-darwin.tar.gz", ext: ".dmg", want: true},
		{name: "unrelated bare binary", asset: "tool-darwin-arm64", ext: ".dmg", want: false},
		// .pkg is itself an extractable archive, so it counts as something that can
		// wrap the .dmg being looked for.
		{name: "another extractable package kind", asset: "tool.pkg", ext: ".dmg", want: true},
		{name: "an archive kind that cannot be unpacked", asset: "tool-darwin.7z", ext: ".dmg", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMacPackageAsset(tt.asset, tt.ext); got != tt.want {
				t.Errorf("isMacPackageAsset(%q, %q) = %v, want %v", tt.asset, tt.ext, got, tt.want)
			}
		})
	}
}

// getCachedRelease answers from memory, then from the on-disk cache, and declines
// whenever caching is off, the entry has aged out, or the run was asked to
// overwrite what it finds.
func TestGitHubGetCachedRelease(t *testing.T) {
	const repo, version = "acme/tool", "v1.0.0"

	newInstaller := func(t *testing.T) (*GitHubInstaller, fs.FS) {
		t.Helper()
		memFS := fs.NewMemFS()
		g := newTestGitHubInstaller(t, memFS)
		g.CacheEnabled = true
		g.CacheDir = "/cache"
		g.CacheTTL = time.Hour
		return g, memFS
	}

	writeDiskCache := func(t *testing.T, g *GitHubInstaller, memFS fs.FS, tag string) {
		t.Helper()
		data, err := json.Marshal(githubRelease{TagName: tag})
		if err != nil {
			t.Fatalf("marshalling release: %v", err)
		}
		if err := memFS.MkdirAll(g.CacheDir, 0755); err != nil {
			t.Fatalf("creating cache dir: %v", err)
		}
		if err := memFS.WriteFile(diskCachePath(g.CacheDir, repo+"@"+version), data, 0644); err != nil {
			t.Fatalf("writing cache file: %v", err)
		}
	}

	t.Run("caching disabled", func(t *testing.T) {
		g, _ := newInstaller(t)
		g.CacheEnabled = false
		if _, ok := g.getCachedRelease(context.Background(), repo, version); ok {
			t.Error("a disabled cache returned a hit")
		}
	})

	t.Run("overwrite requested", func(t *testing.T) {
		g, memFS := newInstaller(t)
		writeDiskCache(t, g, memFS, "v1.0.0")
		ctx := config.WithOverwrite(context.Background(), true)
		if _, ok := g.getCachedRelease(ctx, repo, version); ok {
			t.Error("a run asked to overwrite still reused a cached release")
		}
	})

	t.Run("in-memory hit", func(t *testing.T) {
		g, _ := newInstaller(t)
		g.setCachedRelease(repo, version, &githubRelease{TagName: "v1.0.0"})
		rel, ok := g.getCachedRelease(context.Background(), repo, version)
		if !ok {
			t.Fatal("expected a hit from the in-memory cache")
		}
		if rel.TagName != "v1.0.0" {
			t.Errorf("TagName = %q, want v1.0.0", rel.TagName)
		}
	})

	t.Run("disk hit populates memory", func(t *testing.T) {
		g, memFS := newInstaller(t)
		writeDiskCache(t, g, memFS, "v1.0.0")
		rel, ok := g.getCachedRelease(context.Background(), repo, version)
		if !ok {
			t.Fatal("expected a hit from the on-disk cache")
		}
		if rel.TagName != "v1.0.0" {
			t.Errorf("TagName = %q, want v1.0.0", rel.TagName)
		}
		g.fsys = nil // the second answer can only come from memory now
		if _, ok := g.getCachedRelease(context.Background(), repo, version); !ok {
			t.Error("the disk hit was not promoted into the in-memory cache")
		}
	})

	t.Run("expired disk entry", func(t *testing.T) {
		g, memFS := newInstaller(t)
		g.CacheTTL = time.Nanosecond
		writeDiskCache(t, g, memFS, "v1.0.0")
		time.Sleep(time.Millisecond)
		if _, ok := g.getCachedRelease(context.Background(), repo, version); ok {
			t.Error("an entry older than the TTL was reused")
		}
	})

	t.Run("miss when nothing is cached", func(t *testing.T) {
		g, _ := newInstaller(t)
		if _, ok := g.getCachedRelease(context.Background(), repo, version); ok {
			t.Error("expected a miss")
		}
	})
}

// diskCachePath mirrors how getCachedRelease names an on-disk entry.
func diskCachePath(cacheDir, cacheKey string) string {
	h := md5.Sum([]byte(cacheKey))
	return filepath.Join(cacheDir, fmt.Sprintf("%x.json", h))
}

// The Gitea installer keeps the same two-level release cache as the GitHub one:
// an in-process map in front of a directory of JSON entries that age out.
func TestGiteaGetCachedRelease(t *testing.T) {
	const key = "acme/tool@v2.0.0"

	newInstaller := func(t *testing.T) (*GiteaInstaller, fs.FS) {
		t.Helper()
		memFS := fs.NewMemFS()
		g := NewGiteaInstaller(exec.NewMockRunner(), memFS, nil, nil)
		g.CacheDir = "/cache"
		g.CacheTTL = time.Hour
		return g, memFS
	}

	writeDiskCache := func(t *testing.T, g *GiteaInstaller, memFS fs.FS, tag string) {
		t.Helper()
		data, err := json.Marshal(giteaRelease{TagName: tag})
		if err != nil {
			t.Fatalf("marshalling release: %v", err)
		}
		if err := memFS.MkdirAll(g.CacheDir, 0755); err != nil {
			t.Fatalf("creating cache dir: %v", err)
		}
		if err := memFS.WriteFile(diskCachePath(g.CacheDir, key), data, 0644); err != nil {
			t.Fatalf("writing cache file: %v", err)
		}
	}

	t.Run("overwrite requested", func(t *testing.T) {
		g, memFS := newInstaller(t)
		writeDiskCache(t, g, memFS, "v2.0.0")
		if _, ok := g.getCachedRelease(config.WithOverwrite(context.Background(), true), key); ok {
			t.Error("a run asked to overwrite still reused a cached release")
		}
	})

	t.Run("in-memory hit", func(t *testing.T) {
		g, _ := newInstaller(t)
		g.setCachedRelease(key, &giteaRelease{TagName: "v2.0.0"})
		rel, ok := g.getCachedRelease(context.Background(), key)
		if !ok {
			t.Fatal("expected a hit from the in-memory cache")
		}
		if rel.TagName != "v2.0.0" {
			t.Errorf("TagName = %q, want v2.0.0", rel.TagName)
		}
	})

	t.Run("disk hit populates memory", func(t *testing.T) {
		g, memFS := newInstaller(t)
		writeDiskCache(t, g, memFS, "v2.0.0")
		if _, ok := g.getCachedRelease(context.Background(), key); !ok {
			t.Fatal("expected a hit from the on-disk cache")
		}
		g.fsys = nil
		if _, ok := g.getCachedRelease(context.Background(), key); !ok {
			t.Error("the disk hit was not promoted into the in-memory cache")
		}
	})

	t.Run("expired disk entry", func(t *testing.T) {
		g, memFS := newInstaller(t)
		g.CacheTTL = time.Nanosecond
		writeDiskCache(t, g, memFS, "v2.0.0")
		time.Sleep(time.Millisecond)
		if _, ok := g.getCachedRelease(context.Background(), key); ok {
			t.Error("an entry older than the TTL was reused")
		}
	})

	t.Run("corrupt disk entry", func(t *testing.T) {
		g, memFS := newInstaller(t)
		if err := memFS.MkdirAll(g.CacheDir, 0755); err != nil {
			t.Fatalf("creating cache dir: %v", err)
		}
		if err := memFS.WriteFile(diskCachePath(g.CacheDir, key), []byte("{not json"), 0644); err != nil {
			t.Fatalf("writing cache file: %v", err)
		}
		if _, ok := g.getCachedRelease(context.Background(), key); ok {
			t.Error("an unparseable cache entry was treated as a hit")
		}
	})

	t.Run("miss when nothing is cached", func(t *testing.T) {
		g, _ := newInstaller(t)
		if _, ok := g.getCachedRelease(context.Background(), key); ok {
			t.Error("expected a miss")
		}
	})
}

// The apt and dnf installers each run an optional index refresh, then the install
// itself, then a package-manager query for the version that landed. Whether the
// commands are prefixed with sudo is the tool's choice, and a failure at either
// step has to stop the installation.
func TestAptInstall(t *testing.T) {
	newTool := func(sudo, update bool) *config.ToolConfig {
		return &config.ToolConfig{
			Name:               "ripgrep",
			InstallationMethod: "apt",
			Sudo:               sudo,
			Binaries:           []any{map[string]any{"name": "rg"}},
			InstallParams:      map[string]any{"package": "ripgrep", "update": update},
		}
	}

	t.Run("elevated install refreshes the index first", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("dpkg-query", []byte("14.1.0\n"), nil)
		a := NewAptInstaller(runner, fs.NewMemFS(), nil)

		res, err := a.Install(context.Background(), newTool(true, true))
		if err != nil {
			t.Fatalf("Install returned error: %v", err)
		}
		if res.Version != "14.1.0" {
			t.Errorf("Version = %q, want 14.1.0", res.Version)
		}
		if got := res.ShellEnv["APT_INSTALLED_VERSION"]; got != "14.1.0" {
			t.Errorf("APT_INSTALLED_VERSION = %q, want 14.1.0", got)
		}
		assertRan(t, runner, "sudo", []string{"apt-get", "update"})
		assertRan(t, runner, "sudo", []string{"apt-get", "install", "-y", "ripgrep"})
	})

	t.Run("unelevated install calls apt-get directly", func(t *testing.T) {
		runner := exec.NewMockRunner()
		a := NewAptInstaller(runner, fs.NewMemFS(), nil)

		if _, err := a.Install(context.Background(), newTool(false, false)); err != nil {
			t.Fatalf("Install returned error: %v", err)
		}
		assertRan(t, runner, "apt-get", []string{"install", "-y", "ripgrep"})
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" {
				t.Error("a tool that did not ask for sudo was installed with it")
			}
		}
	})

	t.Run("a pinned version becomes a package spec", func(t *testing.T) {
		runner := exec.NewMockRunner()
		a := NewAptInstaller(runner, fs.NewMemFS(), nil)
		tool := newTool(false, false)
		tool.InstallParams["version"] = "13.0.0"

		if _, err := a.Install(context.Background(), tool); err != nil {
			t.Fatalf("Install returned error: %v", err)
		}
		assertRan(t, runner, "apt-get", []string{"install", "-y", "ripgrep=13.0.0"})
	})

	t.Run("a failed index refresh stops the installation", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("apt-get", nil, errors.New("network unreachable"))
		a := NewAptInstaller(runner, fs.NewMemFS(), nil)

		_, err := a.Install(context.Background(), newTool(false, true))
		if err == nil || !strings.Contains(err.Error(), "apt-get update failed") {
			t.Fatalf("error = %v, want it to report the failed update", err)
		}
	})

	t.Run("a failed install is reported", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("apt-get", nil, errors.New("no such package"))
		a := NewAptInstaller(runner, fs.NewMemFS(), nil)

		_, err := a.Install(context.Background(), newTool(false, false))
		if err == nil || !strings.Contains(err.Error(), "apt-get install ripgrep failed") {
			t.Fatalf("error = %v, want it to report the failed install", err)
		}
	})
}

func TestDnfInstall(t *testing.T) {
	newTool := func(sudo, refresh bool) *config.ToolConfig {
		return &config.ToolConfig{
			Name:               "ripgrep",
			InstallationMethod: "dnf",
			Sudo:               sudo,
			Binaries:           []any{map[string]any{"name": "rg"}},
			InstallParams:      map[string]any{"package": "ripgrep", "refresh": refresh},
		}
	}

	t.Run("elevated install refreshes the cache first", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("rpm", []byte("14.1.0-1\n"), nil)
		d := NewDnfInstaller(runner, fs.NewMemFS(), nil)

		res, err := d.Install(context.Background(), newTool(true, true))
		if err != nil {
			t.Fatalf("Install returned error: %v", err)
		}
		if res.Version != "14.1.0-1" {
			t.Errorf("Version = %q, want 14.1.0-1", res.Version)
		}
		assertRan(t, runner, "sudo", []string{"dnf", "makecache"})
		assertRan(t, runner, "sudo", []string{"dnf", "install", "-y", "ripgrep"})
	})

	t.Run("a pinned version becomes a package spec", func(t *testing.T) {
		runner := exec.NewMockRunner()
		d := NewDnfInstaller(runner, fs.NewMemFS(), nil)
		tool := newTool(false, false)
		tool.InstallParams["version"] = "13.0.0"

		if _, err := d.Install(context.Background(), tool); err != nil {
			t.Fatalf("Install returned error: %v", err)
		}
		assertRan(t, runner, "dnf", []string{"install", "-y", "ripgrep-13.0.0"})
	})

	t.Run("a failed install is reported", func(t *testing.T) {
		runner := exec.NewMockRunner()
		runner.Register("dnf", nil, errors.New("no such package"))
		d := NewDnfInstaller(runner, fs.NewMemFS(), nil)

		_, err := d.Install(context.Background(), newTool(false, false))
		if err == nil || !strings.Contains(err.Error(), "dnf install ripgrep failed") {
			t.Fatalf("error = %v, want it to report the failed install", err)
		}
	})
}

// assertRan reports whether the runner was asked for exactly this command.
func assertRan(t *testing.T, runner *exec.MockRunner, name string, args []string) {
	t.Helper()
	for _, cmd := range runner.History {
		if cmd.Name == name && slices.Equal(cmd.Args, args) {
			return
		}
	}
	var ran []string
	for _, cmd := range runner.History {
		ran = append(ran, cmd.Name+" "+strings.Join(cmd.Args, " "))
	}
	t.Errorf("%s %s was never run; the runner saw:\n  %s", name, strings.Join(args, " "), strings.Join(ran, "\n  "))
}

// The messages an assetSelector failure produces name what the release actually
// offered, which is the only way the author can tell why their selector matched
// nothing.
func TestAvailableAssets(t *testing.T) {
	tests := []struct {
		name  string
		names []string
		want  string
	}{
		{name: "no assets", names: nil, want: " The release has no assets."},
		{name: "one asset", names: []string{"tool.tar.gz"}, want: " The release offers: tool.tar.gz."},
		{name: "several assets", names: []string{"a.zip", "b.zip"}, want: " The release offers: a.zip, b.zip."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := availableAssets(tt.names); got != tt.want {
				t.Errorf("availableAssets(%v) = %q, want %q", tt.names, got, tt.want)
			}
		})
	}
}

// A selector that names an asset the release does not have is a mistake worth
// reporting, not a reason to download something else.
func TestPickNamedAsset(t *testing.T) {
	assets := []githubAsset{{Name: "tool-linux.tar.gz"}, {Name: "tool-darwin.tar.gz"}}
	names := assetNames(assets, githubAssetName)

	t.Run("the chosen asset", func(t *testing.T) {
		got, err := pickNamedAsset("tool", "tool-darwin.tar.gz", assets, githubAssetName, names)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Name != "tool-darwin.tar.gz" {
			t.Errorf("Name = %q, want tool-darwin.tar.gz", got.Name)
		}
	})

	t.Run("an asset the release does not have", func(t *testing.T) {
		_, err := pickNamedAsset("tool", "tool-windows.zip", assets, githubAssetName, names)
		if err == nil {
			t.Fatal("expected an error naming the unknown asset")
		}
		for _, want := range []string{"tool-windows.zip", "tool-linux.tar.gz", "tool-darwin.tar.gz"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error does not mention %q: %v", want, err)
			}
		}
	})
}

// `brew info --json=v2` answers in one shape for formulae and another for casks,
// and older brews answer with a bare list. All three have to yield a version.
func TestBrewGetBrewInfo(t *testing.T) {
	tests := []struct {
		name          string
		output        string
		isCask        bool
		wantLatest    string
		wantInstalled string
		wantOutdated  bool
		wantErr       bool
	}{
		{
			name:          "a cask",
			output:        `{"casks":[{"version":"2.1.0","installed":"2.0.0","outdated":true}]}`,
			isCask:        true,
			wantLatest:    "2.1.0",
			wantInstalled: "2.0.0",
			wantOutdated:  true,
		},
		{
			name:          "a formula",
			output:        `{"formulae":[{"versions":{"stable":"14.1.0"},"installed":[{"version":"14.0.0"}],"outdated":false}]}`,
			wantLatest:    "14.1.0",
			wantInstalled: "14.0.0",
		},
		{
			name:       "a formula that is not installed",
			output:     `{"formulae":[{"versions":{"stable":"14.1.0"},"installed":[],"outdated":false}]}`,
			wantLatest: "14.1.0",
		},
		{
			name:       "the older bare-list shape",
			output:     `[{"versions":{"stable":"1.2.3"},"outdated":true}]`,
			wantLatest: "1.2.3", wantOutdated: true,
		},
		{name: "an answer with no version in it", output: `{}`, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			runner.Register("brew", []byte(tt.output), nil)
			b := NewBrewInstaller(runner, fs.NewMemFS(), nil)

			latest, installed, outdated, err := b.getBrewInfo(context.Background(), "tool", tt.isCask)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got version %q", latest)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if latest != tt.wantLatest || installed != tt.wantInstalled || outdated != tt.wantOutdated {
				t.Errorf("got (%q, %q, %v), want (%q, %q, %v)", latest, installed, outdated, tt.wantLatest, tt.wantInstalled, tt.wantOutdated)
			}
		})
	}
}
