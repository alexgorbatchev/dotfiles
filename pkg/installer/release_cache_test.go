package installer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// githubReleaseServer answers the GitHub releases endpoints of acme/tool: releases/latest
// with a stable release tagged stableTag, and the listing with a prerelease tagged
// preTag ahead of it. It counts requests and remembers the Authorization header of
// the last one.
type githubReleaseServer struct {
	*httptest.Server
	mu       sync.Mutex
	requests int
	lastAuth string
}

func newGitHubReleaseServer(t *testing.T, stableTag, preTag string) *githubReleaseServer {
	t.Helper()
	srv := &githubReleaseServer{}
	release := func(host, tag string, prerelease bool) githubRelease {
		return githubRelease{
			TagName:    tag,
			Prerelease: prerelease,
			// Only a release that carries assets is cached, and caching is the subject.
			Assets: []githubAsset{{Name: "tool-linux-amd64", BrowserDownloadURL: "http://" + host + "/download"}},
		}
	}
	srv.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		srv.mu.Lock()
		srv.requests++
		srv.lastAuth = r.Header.Get("Authorization")
		srv.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/repos/acme/tool/releases/latest":
			_ = json.NewEncoder(w).Encode(release(r.Host, stableTag, false))
		case "/repos/acme/tool/releases":
			_ = json.NewEncoder(w).Encode([]githubRelease{release(r.Host, preTag, true), release(r.Host, stableTag, false)})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (s *githubReleaseServer) requestCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.requests
}

func (s *githubReleaseServer) authorization() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastAuth
}

// newCachingGitHubInstaller returns a GitHub installer whose release cache is in
// memory only, so every cached answer in a test comes from the process, never from
// a directory another run may have written.
func newCachingGitHubInstaller(t *testing.T) *GitHubInstaller {
	t.Helper()
	memFS := fs.NewMemFS()
	inst := NewGitHubInstaller(exec.NewMockRunner(), memFS, downloader.NewDownloader(memFS, nil), &SystemContext{OS: "linux", Arch: "amd64"})
	inst.SetGitHubSettings(GitHubSettings{CacheEnabled: true})
	inst.CacheTTL = time.Hour
	return inst
}

func acmeTool(params map[string]interface{}) *config.ToolConfig {
	installParams := map[string]interface{}{"repo": "acme/tool"}
	for k, v := range params {
		installParams[k] = v
	}
	return &config.ToolConfig{Name: "tool", InstallationMethod: "github-release", InstallParams: installParams}
}

func checkLatest(t *testing.T, inst *GitHubInstaller, tool *config.ToolConfig) *UpdateCheckResult {
	t.Helper()
	res, err := inst.CheckUpdate(context.Background(), tool)
	if err != nil {
		t.Fatalf("CheckUpdate failed: %v", err)
	}
	return res
}

// A release cached from one API host is never the answer for another: an installer
// repointed at a second host (a changed github.host, or the next run of a test that
// serves releases from its own httptest server) asks that host.
func TestGitHubInstaller_ReleaseCacheIsPerHost(t *testing.T) {
	first := newGitHubReleaseServer(t, "v1.0.0", "v1.1.0-rc.1")
	second := newGitHubReleaseServer(t, "v2.0.0", "v2.1.0-rc.1")
	inst := newCachingGitHubInstaller(t)
	tool := acmeTool(nil)

	inst.BaseURL = first.URL
	if res := checkLatest(t, inst, tool); res.LatestVersion != "v1.0.0" {
		t.Fatalf("first host: LatestVersion = %q, want v1.0.0", res.LatestVersion)
	}

	inst.BaseURL = second.URL
	res := checkLatest(t, inst, tool)
	if res.LatestVersion != "v2.0.0" || res.Cached {
		t.Errorf("second host: result = %+v, want v2.0.0 fetched from the second host", res)
	}
	if second.requestCount() != 1 {
		t.Errorf("second host was asked %d times, want 1", second.requestCount())
	}
}

// A release fetched with one token is not reused for another, because what a
// repository shows depends on who asks.
func TestGitHubInstaller_ReleaseCacheIsPerToken(t *testing.T) {
	server := newGitHubReleaseServer(t, "v1.0.0", "v1.1.0-rc.1")
	inst := newCachingGitHubInstaller(t)
	inst.BaseURL = server.URL

	checkLatest(t, inst, acmeTool(map[string]interface{}{"token": "first-token"}))
	res := checkLatest(t, inst, acmeTool(map[string]interface{}{"token": "second-token"}))
	if res.Cached {
		t.Error("a release fetched with another token was served from the cache")
	}
	if got := server.authorization(); got != "token second-token" {
		t.Errorf("last Authorization = %q, want the second token", got)
	}

	// The same token is still answered from the cache.
	if res := checkLatest(t, inst, acmeTool(map[string]interface{}{"token": "second-token"})); !res.Cached {
		t.Error("a repeated check with the same token was not served from the cache")
	}
}

// The latest release of a tool that allows prereleases is a different release from
// the latest stable one, so neither answers for the other.
func TestGitHubInstaller_ReleaseCacheSeparatesPrerelease(t *testing.T) {
	server := newGitHubReleaseServer(t, "v1.0.0", "v1.1.0-rc.1")
	inst := newCachingGitHubInstaller(t)
	inst.BaseURL = server.URL

	if res := checkLatest(t, inst, acmeTool(nil)); res.LatestVersion != "v1.0.0" {
		t.Fatalf("stable: LatestVersion = %q, want v1.0.0", res.LatestVersion)
	}
	pre := checkLatest(t, inst, acmeTool(map[string]interface{}{"prerelease": true}))
	if pre.LatestVersion != "v1.1.0-rc.1" || pre.Cached {
		t.Errorf("prerelease: result = %+v, want v1.1.0-rc.1 fetched from the listing", pre)
	}
	stable := checkLatest(t, inst, acmeTool(nil))
	if stable.LatestVersion != "v1.0.0" || !stable.Cached {
		t.Errorf("stable again: result = %+v, want the cached v1.0.0", stable)
	}
}

// An in-memory entry is subject to the same TTL as one on disk: once CacheTTL has
// passed, the release is fetched again, so a long-running process (the dashboard)
// sees releases published after it started.
func TestGitHubInstaller_MemoryCacheExpires(t *testing.T) {
	server := newGitHubReleaseServer(t, "v1.0.0", "v1.1.0-rc.1")
	inst := newCachingGitHubInstaller(t)
	inst.BaseURL = server.URL
	inst.CacheTTL = 10 * time.Minute
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	inst.releases.now = func() time.Time { return now }
	tool := acmeTool(nil)

	checkLatest(t, inst, tool)
	now = now.Add(9 * time.Minute)
	if res := checkLatest(t, inst, tool); !res.Cached {
		t.Fatal("a release inside its TTL was fetched again")
	}
	now = now.Add(2 * time.Minute)
	if res := checkLatest(t, inst, tool); res.Cached {
		t.Error("a release older than CacheTTL was served from memory")
	}
	if server.requestCount() != 2 {
		t.Errorf("API was asked %d times, want 2", server.requestCount())
	}
}

// An entry read from disk keeps the age it had there: promoting it into memory must
// not restart its TTL, or a process would keep serving a release long after the file
// it came from expired.
func TestReleaseCache_DiskPromotionKeepsFetchTime(t *testing.T) {
	memFS := fs.NewMemFS()
	store := releaseCacheStore{fsys: memFS, dir: "/cache", ttl: 10 * time.Minute}
	const key = "https://api.github.com/acme/tool@v1.0.0"

	var writer releaseCache[githubRelease]
	writer.set(store, key, &githubRelease{TagName: "v1.0.0"})
	info, err := memFS.Stat(store.path(key))
	if err != nil {
		t.Fatalf("stat cache file: %v", err)
	}

	now := info.ModTime().Add(9 * time.Minute)
	reader := releaseCache[githubRelease]{now: func() time.Time { return now }}
	if _, ok := reader.get(store, key); !ok {
		t.Fatal("a disk entry inside its TTL was not reused")
	}

	now = now.Add(2 * time.Minute)
	memoryOnly := releaseCacheStore{ttl: store.ttl}
	if _, ok := reader.get(memoryOnly, key); ok {
		t.Error("an entry promoted from disk outlived the TTL of the file it came from")
	}
}

// A disk entry read while memory already holds a later fetch of the same key (a
// concurrent set between get's memory lookup and its disk read) never replaces it.
func TestReleaseCache_PromotionKeepsNewerMemoryEntry(t *testing.T) {
	memFS := fs.NewMemFS()
	store := releaseCacheStore{fsys: memFS, dir: "/cache", ttl: time.Hour}
	const key = "https://api.github.com/acme/tool@latest"

	var writer releaseCache[githubRelease]
	writer.set(store, key, &githubRelease{TagName: "v1.0.0"})
	info, err := memFS.Stat(store.path(key))
	if err != nil {
		t.Fatalf("stat cache file: %v", err)
	}

	var cache releaseCache[githubRelease]
	cache.store(key, releaseCacheEntry[githubRelease]{release: githubRelease{TagName: "v2.0.0"}, fetchedAt: info.ModTime().Add(time.Minute)})
	cache.promote(key, releaseCacheEntry[githubRelease]{release: githubRelease{TagName: "v1.0.0"}, fetchedAt: info.ModTime()})

	rel, ok := cache.get(releaseCacheStore{ttl: store.ttl}, key)
	if !ok || rel.TagName != "v2.0.0" {
		t.Errorf("get = %+v, %v; want the newer v2.0.0 kept in memory", rel, ok)
	}
}

// Neither the release a caller stored nor the one it was handed shares assets with
// what the cache holds, so changing either cannot change a later answer.
func TestReleaseCache_CopiesAssets(t *testing.T) {
	var cache releaseCache[githubRelease]
	store := releaseCacheStore{}
	const key = "https://api.github.com/acme/tool@v1.0.0"

	stored := &githubRelease{TagName: "v1.0.0", Assets: []githubAsset{{Name: "tool-linux-amd64"}}}
	cache.set(store, key, stored)
	stored.Assets[0].Name = "changed-by-caller"

	got, ok := cache.get(store, key)
	if !ok {
		t.Fatal("expected a hit")
	}
	got.Assets[0].Name = "changed-by-reader"

	again, _ := cache.get(store, key)
	if again.Assets[0].Name != "tool-linux-amd64" {
		t.Errorf("cached asset name = %q, want tool-linux-amd64", again.Assets[0].Name)
	}
}

// The Gitea installer's in-memory entries age out after CacheTTL as its on-disk
// entries do.
func TestGiteaInstaller_MemoryCacheExpires(t *testing.T) {
	server := newGiteaAPIServer(t, giteaClientFixture())
	inst, _ := newGiteaTestInstaller(t, server)
	inst.CacheTTL = 10 * time.Minute
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	inst.releases.now = func() time.Time { return now }
	tool := giteaToolConfig(server.URL, nil, "")
	ctx := context.Background()

	if _, err := inst.CheckUpdate(ctx, tool); err != nil {
		t.Fatalf("first CheckUpdate failed: %v", err)
	}
	now = now.Add(9 * time.Minute)
	if res, err := inst.CheckUpdate(ctx, tool); err != nil || !res.Cached {
		t.Fatalf("CheckUpdate inside the TTL = %+v, %v; want a cached answer", res, err)
	}
	now = now.Add(2 * time.Minute)
	if res, err := inst.CheckUpdate(ctx, tool); err != nil || res.Cached {
		t.Errorf("CheckUpdate past the TTL = %+v, %v; want a fresh fetch", res, err)
	}
}

// A Gitea release fetched with one token is not reused for another.
func TestGiteaInstaller_ReleaseCacheIsPerToken(t *testing.T) {
	server := newGiteaAPIServer(t, giteaClientFixture())
	inst, _ := newGiteaTestInstaller(t, server)
	ctx := context.Background()

	if _, err := inst.CheckUpdate(ctx, giteaToolConfig(server.URL, map[string]interface{}{"token": "first-token"}, "")); err != nil {
		t.Fatalf("first CheckUpdate failed: %v", err)
	}
	res, err := inst.CheckUpdate(ctx, giteaToolConfig(server.URL, map[string]interface{}{"token": "second-token"}, ""))
	if err != nil {
		t.Fatalf("second CheckUpdate failed: %v", err)
	}
	if res.Cached {
		t.Error("a release fetched with another token was served from the cache")
	}
	if auth, _ := server.headers(); auth != "token second-token" {
		t.Errorf("last Authorization = %q, want the second token", auth)
	}
}
