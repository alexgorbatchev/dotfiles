package installer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// The public hosts a cargo installation talks to when the project configuration
// names none, and the User-Agent it identifies itself with.
const (
	defaultCratesIOHost      = "https://crates.io"
	defaultGitHubRawHost     = "https://raw.githubusercontent.com"
	defaultGitHubReleaseHost = "https://github.com"
	defaultCargoUserAgent    = "dotfiles-installer (github.com/alexgorbatchev/dotfiles)"

	// defaultCargoCacheTTL is how long a crates.io or Cargo.toml response is reused
	// when the configuration does not say, v1's cache default.
	defaultCargoCacheTTL = 24 * time.Hour
)

// CargoEndpoint is one host of the project configuration's `cargo` section.
type CargoEndpoint struct {
	// Host is the root every request to this service is built on; a trailing slash is
	// ignored. Empty selects the public host.
	Host string
	// Token authenticates requests to Host, and is never sent anywhere else.
	Token string
}

// CargoCacheSettings govern a cache of responses from one cargo host.
type CargoCacheSettings struct {
	// Enabled reuses stored responses when true.
	Enabled bool
	// TTL is how long a stored response is reused.
	TTL time.Duration
	// Dir holds the stored responses; empty keeps nothing.
	Dir string
}

// CargoSettings is the project configuration's `cargo` section: the hosts a crate's
// version and prebuilt archive are fetched from, their credentials and response
// caches, and the User-Agent crates.io requires of every client.
type CargoSettings struct {
	// CratesIO is the crates.io site root; the API is addressed under /api/v1/crates.
	CratesIO      CargoEndpoint
	CratesIOCache CargoCacheSettings
	// GitHubRaw serves the Cargo.toml a githubRepo's version is read from.
	GitHubRaw      CargoEndpoint
	GitHubRawCache CargoCacheSettings
	// GitHubRelease serves cargo-quickinstall and github-releases archives.
	GitHubRelease CargoEndpoint
	// UserAgent is sent with crates.io and Cargo.toml requests; empty selects the
	// built-in value.
	UserAgent string
}

// CargoSettingsSetter is implemented by installers that fetch crates.
type CargoSettingsSetter interface {
	SetCargoSettings(CargoSettings)
}

// SetCargoSettings configures crate hosts, credentials and caches on installer
// plugins prior to execution.
func SetCargoSettings(inst Installer, settings CargoSettings) {
	if s, ok := inst.(CargoSettingsSetter); ok {
		s.SetCargoSettings(settings)
	}
}

// NewCargoSettings carries the project configuration's `cargo` section over as it is
// written, and turns its cache keys into both response caches, on for a day under
// <generatedDir>/cache/cargo unless the configuration says otherwise. Hosts and the
// User-Agent the configuration leaves out stay empty: CargoInstaller fills those in
// when it builds a request, so an installer nobody configured addresses the public
// hosts too.
func NewCargoSettings(projCfg *config.ProjectConfig) CargoSettings {
	cargo := projCfg.Cargo
	cacheDir := func(name string) string {
		if projCfg.Paths.GeneratedDir == "" {
			return ""
		}
		return filepath.Join(projCfg.Paths.GeneratedDir, "cache", "cargo", name)
	}
	return CargoSettings{
		CratesIO:       CargoEndpoint{Host: cargo.CratesIo.Host, Token: cargo.CratesIo.Token},
		CratesIOCache:  newCargoCacheSettings(cargo.CratesIo.Cache, cacheDir("crates-io")),
		GitHubRaw:      CargoEndpoint{Host: cargo.GithubRaw.Host, Token: cargo.GithubRaw.Token},
		GitHubRawCache: newCargoCacheSettings(cargo.GithubRaw.Cache, cacheDir("github-raw")),
		GitHubRelease:  CargoEndpoint{Host: cargo.GithubRelease.Host, Token: cargo.GithubRelease.Token},
		UserAgent:      cargo.UserAgent,
	}
}

func newCargoCacheSettings(cfg config.CacheConfig, dir string) CargoCacheSettings {
	ttl := defaultCargoCacheTTL
	if cfg.TTL > 0 {
		ttl = time.Duration(cfg.TTL) * time.Millisecond
	}
	return CargoCacheSettings{Enabled: cfg.IsEnabled(), TTL: ttl, Dir: dir}
}

// hostOrDefault returns host without a trailing slash, or fallback when it is empty.
func hostOrDefault(host, fallback string) string {
	if host == "" {
		return fallback
	}
	return strings.TrimSuffix(host, "/")
}

// serves reports whether rawURL addresses host: the same scheme and authority, and a
// path at or below the host's own path. It decides whether a URL the tool wrote
// itself (cargoTomlUrl) may carry the token configured for host.
func serves(host, rawURL string) bool {
	h, err := url.Parse(host)
	if err != nil {
		return false
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if !strings.EqualFold(h.Scheme, u.Scheme) || !strings.EqualFold(h.Host, u.Host) {
		return false
	}
	root := strings.TrimSuffix(h.Path, "/")
	return u.Path == root || strings.HasPrefix(u.Path, root+"/")
}

// path is where the response to rawURL is stored. The URL is the whole key: the
// credentials a request carried are not part of what it asked for, and must never
// reach the file system.
func (s CargoCacheSettings) path(rawURL string) string {
	sum := sha256.Sum256([]byte(rawURL))
	return filepath.Join(s.Dir, hex.EncodeToString(sum[:]))
}

// load returns the stored response to rawURL while it is younger than the TTL. A run
// that forces fresh data (--force) never reads the cache.
func (s CargoCacheSettings) load(ctx context.Context, fsys fs.FS, rawURL string) ([]byte, bool) {
	if !s.Enabled || s.Dir == "" || fsys == nil || config.IsOverwriteEnabled(ctx) {
		return nil, false
	}
	entry := s.path(rawURL)
	info, err := fsys.Stat(entry)
	if err != nil || time.Since(info.ModTime()) >= s.TTL {
		return nil, false
	}
	data, err := fsys.ReadFile(entry)
	if err != nil {
		return nil, false
	}
	return data, true
}

// store keeps body as the response to rawURL. Failing to store it only costs the next
// run a request, so the error is not the caller's concern.
func (s CargoCacheSettings) store(fsys fs.FS, rawURL string, body []byte) {
	if !s.Enabled || s.Dir == "" || fsys == nil {
		return
	}
	if err := fsys.MkdirAll(s.Dir, 0755); err != nil {
		return
	}
	_ = fsys.WriteFile(s.path(rawURL), body, 0644) // best effort, see above
}
