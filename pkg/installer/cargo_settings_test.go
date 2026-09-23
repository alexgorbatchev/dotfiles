package installer

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// cargoHostRequest is one request a stand-in cargo host received.
type cargoHostRequest struct {
	path          string
	userAgent     string
	authorization string
}

// cargoHost is an httptest server standing in for one of the hosts the cargo
// section configures. It records every request with the headers the settings govern.
type cargoHost struct {
	*recordingServer
	mu       sync.Mutex
	requests []cargoHostRequest
}

func newCargoHost(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) *cargoHost {
	t.Helper()
	host := &cargoHost{}
	host.recordingServer = newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
		host.mu.Lock()
		host.requests = append(host.requests, cargoHostRequest{
			path:          r.URL.Path,
			userAgent:     r.Header.Get("User-Agent"),
			authorization: r.Header.Get("Authorization"),
		})
		host.mu.Unlock()
		handler(w, r)
	})
	return host
}

func (h *cargoHost) received() []cargoHostRequest {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]cargoHostRequest(nil), h.requests...)
}

// cargoHosts stands in for all three cargo hosts: crates.io (mycrate 1.5.0), the raw
// host serving owner/repo's Cargo.toml (2.0.0) and the release host serving every
// quickinstall and GitHub release archive.
type cargoHosts struct {
	cratesIO, raw, release *cargoHost
}

func newCargoHosts(t *testing.T) cargoHosts {
	t.Helper()
	tarData, err := createTarGzBytes(map[string]string{"mycrate": "binary-content"})
	if err != nil {
		t.Fatalf("creating archive: %v", err)
	}
	return cargoHosts{
		cratesIO: newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v1/crates/mycrate" {
				http.NotFound(w, r)
				return
			}
			_, _ = w.Write([]byte(`{"crate":{"max_version":"1.5.0","max_stable_version":"1.5.0"}}`))
		}),
		raw: newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasSuffix(r.URL.Path, "/Cargo.toml") {
				http.NotFound(w, r)
				return
			}
			_, _ = w.Write([]byte("[package]\nname = \"mycrate\"\nversion = \"2.0.0\"\n"))
		}),
		release: newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasSuffix(r.URL.Path, ".tar.gz") {
				http.NotFound(w, r)
				return
			}
			_, _ = w.Write(tarData)
		}),
	}
}

// cargoConfig is the project configuration's cargo section pointing at the hosts.
func (h cargoHosts) cargoConfig() config.CargoConfig {
	return config.CargoConfig{
		CratesIo:      config.HostConfig{Host: h.cratesIO.URL, Token: "crates-secret"},
		GithubRaw:     config.HostConfig{Host: h.raw.URL, Token: "raw-secret"},
		GithubRelease: config.CargoReleaseHostConfig{Host: h.release.URL, Token: "release-secret"},
		UserAgent:     "my-bot (me@example.com)",
	}
}

func newCargoSettingsInstaller(t *testing.T, fsys fs.FS, settings CargoSettings) *CargoInstaller {
	t.Helper()
	dl := downloader.NewDownloader(fsys, http.DefaultClient)
	dl.CacheEnabled = false
	dl.RetryDelay = time.Millisecond
	inst := NewCargoInstaller(exec.NewMockRunner(), fsys, dl, &SystemContext{OS: "linux", Arch: "amd64"})
	inst.BinDir = "/test/bin"
	SetCargoSettings(inst, settings)
	return inst
}

// TestCargoSettingsReachConfiguredHosts pins that the cargo section decides where
// every cargo request goes and what it carries, as v1's CargoClient and
// CargoInstallerPlugin did: crates.io API requests go to cratesIo.host under
// /api/v1/crates, Cargo.toml fetches to githubRaw.host, quickinstall and GitHub
// release archives to githubRelease.host, and crates.io and Cargo.toml requests
// identify themselves with cargo.userAgent. Each host receives its own token in the
// header form its protocol uses, and never another host's.
func TestCargoSettingsReachConfiguredHosts(t *testing.T) {
	tests := []struct {
		name   string
		params map[string]interface{}
		// want is the request each host must receive, in order; a nil entry means none.
		wantCratesIO, wantRaw, wantRelease []cargoHostRequest
	}{
		{
			name:   "quickinstall with the crates.io version",
			params: map[string]interface{}{"crateName": "mycrate"},
			wantCratesIO: []cargoHostRequest{
				{path: "/api/v1/crates/mycrate", userAgent: "my-bot (me@example.com)", authorization: "crates-secret"},
			},
			wantRelease: []cargoHostRequest{{
				path:          "/cargo-bins/cargo-quickinstall/releases/download/mycrate-1.5.0/mycrate-1.5.0-x86_64-unknown-linux-gnu.tar.gz",
				userAgent:     "dotfiles-installer/1.0",
				authorization: "token release-secret",
			}},
		},
		{
			name:   "github-releases with the Cargo.toml version",
			params: map[string]interface{}{"crateName": "mycrate", "binarySource": "github-releases", "versionSource": "cargo-toml", "githubRepo": "owner/repo"},
			wantRaw: []cargoHostRequest{
				{path: "/owner/repo/main/Cargo.toml", userAgent: "my-bot (me@example.com)", authorization: "token raw-secret"},
			},
			wantRelease: []cargoHostRequest{{
				path:          "/owner/repo/releases/download/v2.0.0/mycrate-2.0.0-unknown-linux-gnu-x86_64.tar.gz",
				userAgent:     "dotfiles-installer/1.0",
				authorization: "token release-secret",
			}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hosts := newCargoHosts(t)
			settings := NewCargoSettings(&config.ProjectConfig{Cargo: hosts.cargoConfig()})
			inst := newCargoSettingsInstaller(t, fs.NewMemFS(), settings)
			// The github section's token belongs to the GitHub API; no cargo host may
			// receive it.
			inst.SetGitHubSettings(GitHubSettings{Token: "github-api-secret"})

			res, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mycrate", InstallParams: tt.params})
			if err != nil {
				t.Fatalf("Install() error = %v", err)
			}
			if len(res.Binaries) != 1 || res.Binaries[0] != "mycrate" {
				t.Fatalf("Install() binaries = %v, want the prebuilt mycrate", res.Binaries)
			}
			for _, host := range []struct {
				name string
				got  []cargoHostRequest
				want []cargoHostRequest
			}{
				{"cratesIo", hosts.cratesIO.received(), tt.wantCratesIO},
				{"githubRaw", hosts.raw.received(), tt.wantRaw},
				{"githubRelease", hosts.release.received(), tt.wantRelease},
			} {
				if !slices.Equal(host.got, host.want) {
					t.Errorf("%s host received %+v, want %+v", host.name, host.got, host.want)
				}
			}
		})
	}
}

// TestCargoSettingsTokensStayOnTheirHost pins that a configured token is only ever
// sent to the host it was configured for: a Cargo.toml named by cargoTomlUrl on
// another host is fetched without the githubRaw token, and hosts without a token
// receive no Authorization header at all.
func TestCargoSettingsTokensStayOnTheirHost(t *testing.T) {
	t.Run("a cargoTomlUrl on another host gets no githubRaw token", func(t *testing.T) {
		hosts := newCargoHosts(t)
		elsewhere := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("[package]\nversion = \"3.0.0\"\n"))
		})
		inst := newCargoSettingsInstaller(t, fs.NewMemFS(), NewCargoSettings(&config.ProjectConfig{Cargo: hosts.cargoConfig()}))

		got, err := inst.resolveVersion(context.Background(), &config.ToolConfig{
			Name:          "mycrate",
			InstallParams: map[string]interface{}{"cargoTomlUrl": elsewhere.URL + "/owner/repo/main/Cargo.toml"},
		}, "mycrate", cargoBinarySourceQuickinstall)
		if err != nil || got.version != "3.0.0" {
			t.Fatalf("resolveVersion() = %+v, %v; want 3.0.0 from the cargoTomlUrl", got, err)
		}
		want := []cargoHostRequest{{path: "/owner/repo/main/Cargo.toml", userAgent: "my-bot (me@example.com)"}}
		if received := elsewhere.received(); !slices.Equal(received, want) {
			t.Fatalf("cargoTomlUrl host received %+v, want %+v", received, want)
		}
	})

	t.Run("a cargoTomlUrl on the githubRaw host gets its token", func(t *testing.T) {
		hosts := newCargoHosts(t)
		inst := newCargoSettingsInstaller(t, fs.NewMemFS(), NewCargoSettings(&config.ProjectConfig{Cargo: hosts.cargoConfig()}))

		_, err := inst.resolveVersion(context.Background(), &config.ToolConfig{
			Name:          "mycrate",
			InstallParams: map[string]interface{}{"cargoTomlUrl": hosts.raw.URL + "/owner/repo/v2/Cargo.toml"},
		}, "mycrate", cargoBinarySourceQuickinstall)
		if err != nil {
			t.Fatalf("resolveVersion() error = %v", err)
		}
		want := []cargoHostRequest{{path: "/owner/repo/v2/Cargo.toml", userAgent: "my-bot (me@example.com)", authorization: "token raw-secret"}}
		if received := hosts.raw.received(); !slices.Equal(received, want) {
			t.Fatalf("githubRaw host received %+v, want %+v", received, want)
		}
	})

	t.Run("hosts without a token get no Authorization header", func(t *testing.T) {
		hosts := newCargoHosts(t)
		cfg := hosts.cargoConfig()
		cfg.CratesIo.Token, cfg.GithubRaw.Token, cfg.GithubRelease.Token = "", "", ""
		inst := newCargoSettingsInstaller(t, fs.NewMemFS(), NewCargoSettings(&config.ProjectConfig{Cargo: cfg}))
		inst.SetGitHubSettings(GitHubSettings{Token: "github-api-secret"})

		for _, params := range []map[string]interface{}{
			{"crateName": "mycrate"},
			{"crateName": "mycrate", "binarySource": "github-releases", "versionSource": "cargo-toml", "githubRepo": "owner/repo"},
		} {
			if _, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mycrate", InstallParams: params}); err != nil {
				t.Fatalf("Install(%v) error = %v", params, err)
			}
		}
		for name, host := range map[string]*cargoHost{"cratesIo": hosts.cratesIO, "githubRaw": hosts.raw, "githubRelease": hosts.release} {
			received := host.received()
			if len(received) == 0 {
				t.Errorf("%s host received no request", name)
			}
			for _, req := range received {
				if req.authorization != "" {
					t.Errorf("%s host received Authorization %q for %s, want none", name, req.authorization, req.path)
				}
			}
		}
	})
}

// TestNewCargoSettings pins how the cargo section of a project configuration becomes
// the installer's settings: hosts, tokens and the User-Agent as written, and both
// caches on for a day under the generated directory unless the configuration says
// otherwise. The public hosts an empty configuration gets are pinned by
// TestCargoSettingsDefaultURLs.
func TestNewCargoSettings(t *testing.T) {
	disabled := false
	tests := []struct {
		name string
		cfg  config.ProjectConfig
		want CargoSettings
	}{
		{
			name: "an empty configuration turns both caches on",
			cfg:  config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/gen"}},
			want: CargoSettings{
				CratesIOCache:  CargoCacheSettings{Enabled: true, TTL: 24 * time.Hour, Dir: filepath.Join("/gen", "cache", "cargo", "crates-io")},
				GitHubRawCache: CargoCacheSettings{Enabled: true, TTL: 24 * time.Hour, Dir: filepath.Join("/gen", "cache", "cargo", "github-raw")},
			},
		},
		{
			name: "every key is carried over as written",
			cfg: config.ProjectConfig{Cargo: config.CargoConfig{
				CratesIo:      config.HostConfig{Host: "https://mirror.example/", Token: "a", Cache: config.CacheConfig{Enabled: &disabled, TTL: 1000}},
				GithubRaw:     config.HostConfig{Host: "https://raw.example", Token: "b", Cache: config.CacheConfig{TTL: 2000}},
				GithubRelease: config.CargoReleaseHostConfig{Host: "https://ghe.example/", Token: "c"},
				UserAgent:     "bot",
			}},
			want: CargoSettings{
				CratesIO:       CargoEndpoint{Host: "https://mirror.example/", Token: "a"},
				CratesIOCache:  CargoCacheSettings{Enabled: false, TTL: time.Second},
				GitHubRaw:      CargoEndpoint{Host: "https://raw.example", Token: "b"},
				GitHubRawCache: CargoCacheSettings{Enabled: true, TTL: 2 * time.Second},
				GitHubRelease:  CargoEndpoint{Host: "https://ghe.example/", Token: "c"},
				UserAgent:      "bot",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NewCargoSettings(&tt.cfg); got != tt.want {
				t.Fatalf("NewCargoSettings() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// TestCargoSettingsDefaultURLs pins that an installer nobody configured still
// addresses the public hosts at the paths it always has.
func TestCargoSettingsDefaultURLs(t *testing.T) {
	inst := NewCargoInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, nil)
	for _, tt := range []struct{ got, want string }{
		{inst.cratesIOCrateURL("ripgrep"), "https://crates.io/api/v1/crates/ripgrep"},
		{inst.cargoTomlURL("owner/repo"), "https://raw.githubusercontent.com/owner/repo/main/Cargo.toml"},
		{inst.quickinstallURL("rg", "1.0.0", "x86_64", "apple-darwin"), "https://github.com/cargo-bins/cargo-quickinstall/releases/download/rg-1.0.0/rg-1.0.0-x86_64-apple-darwin.tar.gz"},
		{inst.githubReleaseURL("owner/repo", "v1.0.0", "rg.tar.gz"), "https://github.com/owner/repo/releases/download/v1.0.0/rg.tar.gz"},
	} {
		if tt.got != tt.want {
			t.Errorf("URL = %q, want %q", tt.got, tt.want)
		}
	}
	if agent := inst.userAgent(); agent != "dotfiles-installer (github.com/alexgorbatchev/dotfiles)" {
		t.Errorf("userAgent() = %q, want the built-in User-Agent", agent)
	}

	// A configured host is used as written, less a trailing slash.
	SetCargoSettings(inst, NewCargoSettings(&config.ProjectConfig{Cargo: config.CargoConfig{
		CratesIo:      config.HostConfig{Host: "https://mirror.example/"},
		GithubRaw:     config.HostConfig{Host: "https://raw.example/"},
		GithubRelease: config.CargoReleaseHostConfig{Host: "https://ghe.example/"},
	}}))
	for _, tt := range []struct{ got, want string }{
		{inst.cratesIOCrateURL("ripgrep"), "https://mirror.example/api/v1/crates/ripgrep"},
		{inst.cargoTomlURL("owner/repo"), "https://raw.example/owner/repo/main/Cargo.toml"},
		{inst.githubReleaseURL("owner/repo", "v1.0.0", "rg.tar.gz"), "https://ghe.example/owner/repo/releases/download/v1.0.0/rg.tar.gz"},
	} {
		if tt.got != tt.want {
			t.Errorf("URL = %q, want %q", tt.got, tt.want)
		}
	}
}

// TestCargoTokensDoNotFollowRedirects pins that a token configured for a cargo host is
// not forwarded when that host redirects elsewhere, as GitHub does with release
// assets. Both test servers listen on 127.0.0.1, which net/http alone treats as the
// same domain and would forward the header to.
func TestCargoTokensDoNotFollowRedirects(t *testing.T) {
	tarData, err := createTarGzBytes(map[string]string{"mycrate": "binary-content"})
	if err != nil {
		t.Fatalf("creating archive: %v", err)
	}
	storage := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, ".tar.gz"):
			_, _ = w.Write(tarData)
		case strings.HasSuffix(r.URL.Path, "Cargo.toml"):
			_, _ = w.Write([]byte("[package]\nversion = \"2.0.0\"\n"))
		default:
			_, _ = w.Write([]byte(`{"crate":{"max_version":"1.5.0","max_stable_version":"1.5.0"}}`))
		}
	})
	redirecting := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, storage.URL+r.URL.Path, http.StatusFound)
	})
	inst := newCargoSettingsInstaller(t, fs.NewMemFS(), NewCargoSettings(&config.ProjectConfig{Cargo: config.CargoConfig{
		CratesIo:      config.HostConfig{Host: redirecting.URL, Token: "crates-secret"},
		GithubRaw:     config.HostConfig{Host: redirecting.URL, Token: "raw-secret"},
		GithubRelease: config.CargoReleaseHostConfig{Host: redirecting.URL, Token: "release-secret"},
	}}))

	for _, params := range []map[string]interface{}{
		{"crateName": "mycrate"},
		{"crateName": "mycrate", "binarySource": "github-releases", "versionSource": "cargo-toml", "githubRepo": "owner/repo"},
	} {
		res, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mycrate", InstallParams: params})
		if err != nil || len(res.Binaries) != 1 {
			t.Fatalf("Install(%v) = %+v, %v; want the prebuilt mycrate", params, res, err)
		}
	}
	if n := len(redirecting.received()); n != 4 {
		t.Errorf("configured host received %d requests, want 4 (crates.io, archive, Cargo.toml, archive)", n)
	}
	for _, req := range redirecting.received() {
		if req.authorization == "" {
			t.Errorf("configured host received %s without its token", req.path)
		}
	}
	received := storage.received()
	if len(received) != 4 {
		t.Fatalf("redirect target received %d requests, want 4: %+v", len(received), received)
	}
	for _, req := range received {
		if req.authorization != "" {
			t.Errorf("redirect target received Authorization %q for %s, want none", req.authorization, req.path)
		}
	}
}

// TestServes pins which URLs count as on a configured host, and so may carry its
// token: the same scheme and authority, at or below the host's own path.
func TestServes(t *testing.T) {
	tests := []struct {
		host, url string
		want      bool
	}{
		{"https://raw.example", "https://raw.example/owner/repo/main/Cargo.toml", true},
		{"https://RAW.example", "https://raw.example/Cargo.toml", true},
		{"https://ghe.example/raw", "https://ghe.example/raw/owner/Cargo.toml", true},
		{"https://ghe.example/raw", "https://ghe.example/raw", true},
		{"https://ghe.example/raw", "https://ghe.example/rawer/Cargo.toml", false},
		{"https://ghe.example/raw", "https://ghe.example/other/Cargo.toml", false},
		{"https://raw.example", "http://raw.example/Cargo.toml", false},
		{"https://raw.example", "https://raw.example:8443/Cargo.toml", false},
		{"https://raw.example", "https://raw.example.attacker.test/Cargo.toml", false},
		{"https://raw.example", "https://attacker.test/raw.example/Cargo.toml", false},
		{"https://raw.example", "://not a url", false},
		{"://not a url", "https://raw.example/Cargo.toml", false},
	}
	for _, tt := range tests {
		if got := serves(tt.host, tt.url); got != tt.want {
			t.Errorf("serves(%q, %q) = %t, want %t", tt.host, tt.url, got, tt.want)
		}
	}
}

// TestCargoResponseCache pins the two response caches v1 kept for cargo
// (cargo.cratesIo.cache and cargo.githubRaw.cache): a response is reused within its
// TTL, fetched again once it expires, never reused when the cache is off or the run
// forces fresh data, never stored when the request failed, and keyed by the URL
// alone so no token reaches the cache.
func TestCargoResponseCache(t *testing.T) {
	type source struct {
		name   string
		params map[string]interface{}
		host   func(cargoHosts) *cargoHost
		cache  func(*config.CargoConfig) *config.CacheConfig
		want   string
	}
	sources := []source{
		{
			name:   "crates.io",
			params: map[string]interface{}{"versionSource": "crates-io"},
			host:   func(h cargoHosts) *cargoHost { return h.cratesIO },
			cache:  func(c *config.CargoConfig) *config.CacheConfig { return &c.CratesIo.Cache },
			want:   "1.5.0",
		},
		{
			name:   "Cargo.toml",
			params: map[string]interface{}{"versionSource": "cargo-toml", "githubRepo": "owner/repo"},
			host:   func(h cargoHosts) *cargoHost { return h.raw },
			cache:  func(c *config.CargoConfig) *config.CacheConfig { return &c.GithubRaw.Cache },
			want:   "2.0.0",
		},
	}
	disabled := false

	for _, src := range sources {
		setup := func(t *testing.T, fsys fs.FS, edit func(*config.CargoConfig)) (*CargoInstaller, cargoHosts, string) {
			t.Helper()
			hosts := newCargoHosts(t)
			cfg := hosts.cargoConfig()
			if edit != nil {
				edit(&cfg)
			}
			generated := t.TempDir()
			inst := newCargoSettingsInstaller(t, fsys, NewCargoSettings(&config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: generated}, Cargo: cfg}))
			return inst, hosts, generated
		}
		resolve := func(t *testing.T, ctx context.Context, inst *CargoInstaller) {
			t.Helper()
			got, err := inst.resolveVersion(ctx, &config.ToolConfig{Name: "mycrate", InstallParams: src.params}, "mycrate", cargoBinarySourceQuickinstall)
			if err != nil || got.version != src.want {
				t.Fatalf("resolveVersion() = %+v, %v; want %s", got, err, src.want)
			}
		}

		t.Run(src.name+": reused within its TTL, without the token in the cache", func(t *testing.T) {
			fsys := &fs.OSFS{}
			inst, hosts, generated := setup(t, fsys, nil)
			resolve(t, context.Background(), inst)
			resolve(t, context.Background(), inst)
			if n := len(src.host(hosts).received()); n != 1 {
				t.Fatalf("host received %d requests, want 1: the second must come from the cache", n)
			}

			// A different token must not change what is cached or where.
			inst.Cargo.CratesIO.Token, inst.Cargo.GitHubRaw.Token = "rotated", "rotated"
			resolve(t, context.Background(), inst)
			if n := len(src.host(hosts).received()); n != 1 {
				t.Fatalf("host received %d requests after the token changed, want 1: the key is the URL alone", n)
			}
			assertNoSecretUnder(t, generated, "crates-secret", "raw-secret", "release-secret", "rotated")
		})

		t.Run(src.name+": fetched again once its TTL expires", func(t *testing.T) {
			fsys := &fs.OSFS{}
			inst, hosts, generated := setup(t, fsys, func(c *config.CargoConfig) { src.cache(c).TTL = time.Hour.Milliseconds() })
			resolve(t, context.Background(), inst)
			ageFilesUnder(t, generated, 2*time.Hour)
			resolve(t, context.Background(), inst)
			if n := len(src.host(hosts).received()); n != 2 {
				t.Fatalf("host received %d requests, want 2: an expired entry must be fetched again", n)
			}
		})

		t.Run(src.name+": not reused when the cache is off", func(t *testing.T) {
			fsys := &fs.OSFS{}
			inst, hosts, generated := setup(t, fsys, func(c *config.CargoConfig) { src.cache(c).Enabled = &disabled })
			resolve(t, context.Background(), inst)
			resolve(t, context.Background(), inst)
			if n := len(src.host(hosts).received()); n != 2 {
				t.Fatalf("host received %d requests, want 2 with the cache off", n)
			}
			if entries, _ := os.ReadDir(filepath.Join(generated, "cache")); len(entries) != 0 {
				t.Fatalf("cache directory holds %d entries with the cache off, want none", len(entries))
			}
		})

		t.Run(src.name+": not reused when the run forces fresh data", func(t *testing.T) {
			fsys := &fs.OSFS{}
			inst, hosts, _ := setup(t, fsys, nil)
			resolve(t, context.Background(), inst)
			resolve(t, config.WithOverwrite(context.Background(), true), inst)
			if n := len(src.host(hosts).received()); n != 2 {
				t.Fatalf("host received %d requests, want 2: an overwrite run must not read the cache", n)
			}
		})
	}

	t.Run("a failed response is not cached", func(t *testing.T) {
		failures := 1
		var mu sync.Mutex
		host := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			defer mu.Unlock()
			if failures > 0 {
				failures--
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			_, _ = w.Write([]byte(`{"crate":{"max_version":"1.5.0","max_stable_version":"1.5.0"}}`))
		})
		inst := newCargoSettingsInstaller(t, &fs.OSFS{}, NewCargoSettings(&config.ProjectConfig{
			Paths: config.PathsConfig{GeneratedDir: t.TempDir()},
			Cargo: config.CargoConfig{CratesIo: config.HostConfig{Host: host.URL}},
		}))
		tool := &config.ToolConfig{Name: "mycrate"}
		if _, err := inst.resolveVersion(context.Background(), tool, "mycrate", cargoBinarySourceQuickinstall); err == nil {
			t.Fatal("resolveVersion() succeeded against a failing host")
		}
		for range 2 {
			if got, err := inst.resolveVersion(context.Background(), tool, "mycrate", cargoBinarySourceQuickinstall); err != nil || got.version != "1.5.0" {
				t.Fatalf("resolveVersion() = %+v, %v; want 1.5.0", got, err)
			}
		}
		if n := len(host.received()); n != 2 {
			t.Fatalf("host received %d requests, want 2: the failure must not be cached, the success must", n)
		}
	})

	// A crate that has published only prereleases: a prerelease lookup and a stable one
	// share its one cached description, and "no stable version" is as definitive an
	// answer as a version, so it is reused from the cache and still stops Install from
	// compiling the crate.
	t.Run("a prerelease-only crate is answered from one cached description", func(t *testing.T) {
		host := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"crate":{"max_version":"3.0.0-alpha.1","max_stable_version":null}}`))
		})
		runner := exec.NewMockRunner()
		inst := newCargoSettingsInstaller(t, &fs.OSFS{}, NewCargoSettings(&config.ProjectConfig{
			Paths: config.PathsConfig{GeneratedDir: t.TempDir()},
			Cargo: config.CargoConfig{CratesIo: config.HostConfig{Host: host.URL}},
		}))
		inst.runner = runner

		if got, err := inst.fetchCratesIOVersion(context.Background(), "mycrate", true); err != nil || got != "3.0.0-alpha.1" {
			t.Fatalf("prerelease lookup = %q, %v; want 3.0.0-alpha.1", got, err)
		}
		for range 2 {
			if _, err := inst.fetchCratesIOVersion(context.Background(), "mycrate", false); !errors.Is(err, errNoCrateVersion) {
				t.Fatalf("stable lookup error = %v, want errNoCrateVersion", err)
			}
		}
		if _, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mycrate"}); !errors.Is(err, errNoCrateVersion) {
			t.Fatalf("Install() error = %v, want errNoCrateVersion", err)
		}
		if len(runner.History) != 0 {
			t.Fatalf("Install() ran %v; a crate with no stable version must not be compiled", runner.History)
		}
		if n := len(host.received()); n != 1 {
			t.Fatalf("host received %d requests, want 1: every lookup after the first reads the cached description", n)
		}
	})

	t.Run("a crate with no stable version is cached when first seen by a stable lookup", func(t *testing.T) {
		host := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"crate":{"max_version":"3.0.0-alpha.1","max_stable_version":null}}`))
		})
		inst := newCargoSettingsInstaller(t, &fs.OSFS{}, NewCargoSettings(&config.ProjectConfig{
			Paths: config.PathsConfig{GeneratedDir: t.TempDir()},
			Cargo: config.CargoConfig{CratesIo: config.HostConfig{Host: host.URL}},
		}))
		for range 2 {
			if _, err := inst.fetchCratesIOVersion(context.Background(), "mycrate", false); !errors.Is(err, errNoCrateVersion) {
				t.Fatalf("stable lookup error = %v, want errNoCrateVersion", err)
			}
		}
		if n := len(host.received()); n != 1 {
			t.Fatalf("host received %d requests, want 1: the definitive answer must be cached", n)
		}
	})

	// A 200 answer without max_version is not the shape crates.io answers in, so it
	// fails the run that saw it but is not kept for the next one.
	t.Run("a response with no max_version is not cached", func(t *testing.T) {
		var mu sync.Mutex
		served := 0
		host := newCargoHost(t, func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			defer mu.Unlock()
			served++
			if served == 1 {
				_, _ = w.Write([]byte(`{}`))
				return
			}
			_, _ = w.Write([]byte(`{"crate":{"max_version":"1.5.0","max_stable_version":"1.5.0"}}`))
		})
		inst := newCargoSettingsInstaller(t, &fs.OSFS{}, NewCargoSettings(&config.ProjectConfig{
			Paths: config.PathsConfig{GeneratedDir: t.TempDir()},
			Cargo: config.CargoConfig{CratesIo: config.HostConfig{Host: host.URL}},
		}))
		if _, err := inst.fetchCratesIOVersion(context.Background(), "mycrate", false); !errors.Is(err, errNoCrateVersion) {
			t.Fatalf("first lookup error = %v, want errNoCrateVersion", err)
		}
		if got, err := inst.fetchCratesIOVersion(context.Background(), "mycrate", false); err != nil || got != "1.5.0" {
			t.Fatalf("second lookup = %q, %v; want 1.5.0 fetched again", got, err)
		}
		if n := len(host.received()); n != 2 {
			t.Fatalf("host received %d requests, want 2", n)
		}
	})

	t.Run("a cached response that no longer parses is fetched again", func(t *testing.T) {
		hosts := newCargoHosts(t)
		generated := t.TempDir()
		inst := newCargoSettingsInstaller(t, &fs.OSFS{}, NewCargoSettings(&config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: generated}, Cargo: hosts.cargoConfig()}))
		tool := &config.ToolConfig{Name: "mycrate"}
		if _, err := inst.resolveVersion(context.Background(), tool, "mycrate", cargoBinarySourceQuickinstall); err != nil {
			t.Fatalf("resolveVersion() error = %v", err)
		}
		if !strings.HasPrefix(inst.Cargo.CratesIOCache.Dir, generated) {
			t.Fatalf("crates.io cache directory = %q, want one under %s", inst.Cargo.CratesIOCache.Dir, generated)
		}
		entry := inst.Cargo.CratesIOCache.path(inst.cratesIOCrateURL("mycrate"))
		if err := os.WriteFile(entry, []byte("not json"), 0644); err != nil {
			t.Fatalf("corrupting the cache entry: %v", err)
		}
		if got, err := inst.resolveVersion(context.Background(), tool, "mycrate", cargoBinarySourceQuickinstall); err != nil || got.version != "1.5.0" {
			t.Fatalf("resolveVersion() = %+v, %v; want 1.5.0 fetched again", got, err)
		}
		if n := len(hosts.cratesIO.received()); n != 2 {
			t.Fatalf("host received %d requests, want 2", n)
		}
	})
}

// ageFilesUnder moves the modification time of every file under dir back by age.
func ageFilesUnder(t *testing.T, dir string, age time.Duration) {
	t.Helper()
	old := time.Now().Add(-age)
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		return os.Chtimes(path, old, old)
	})
	if err != nil {
		t.Fatalf("ageing cache entries: %v", err)
	}
}

// assertNoSecretUnder fails when any file name or content under dir holds a secret.
func assertNoSecretUnder(t *testing.T, dir string, secrets ...string) {
	t.Helper()
	files := 0
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		files++
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, secret := range secrets {
			if strings.Contains(path, secret) || strings.Contains(string(data), secret) {
				t.Errorf("cache entry %s holds the secret %q", path, secret)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("reading cache entries: %v", err)
	}
	if files == 0 {
		t.Fatal("no cache entry was written")
	}
}
