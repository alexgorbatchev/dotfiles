package installer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// recordingReleaseServer serves the GitHub release endpoints a tool resolution can
// reach and records which paths were requested.
//
// GitHub's releases/latest endpoint omits prereleases entirely, so it answers 404 for
// a repository that has published nothing else. The releases listing returns every
// release, newest first. Serving both the way the real API does is what makes the
// difference between the two endpoints observable.
type recordingReleaseServer struct {
	*httptest.Server
	mu    sync.Mutex
	paths []string
}

func newRecordingReleaseServer(t *testing.T, listing []githubRelease, latest *githubRelease) *recordingReleaseServer {
	t.Helper()
	rec := &recordingReleaseServer{}
	rec.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec.mu.Lock()
		rec.paths = append(rec.paths, r.URL.Path)
		rec.mu.Unlock()

		if r.URL.Path == "/repos/owner/tool/releases" {
			_ = json.NewEncoder(w).Encode(listing)
			return
		}
		if r.URL.Path == "/repos/owner/tool/releases/latest" {
			if latest == nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(latest)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(rec.Close)
	return rec
}

func (rec *recordingReleaseServer) requested(path string) bool {
	rec.mu.Lock()
	defer rec.mu.Unlock()
	for _, p := range rec.paths {
		if p == path {
			return true
		}
	}
	return false
}

func newPrereleaseTestInstaller(t *testing.T, baseURL string) *GitHubInstaller {
	t.Helper()
	memFS := fs.NewMemFS()
	inst := NewGitHubInstaller(
		exec.NewMockRunner(),
		memFS,
		downloader.NewDownloader(memFS, nil),
		&SystemContext{OS: "linux", Arch: "amd64"},
	)
	inst.BaseURL = baseURL
	return inst
}

func prereleaseTool(prerelease bool) *config.ToolConfig {
	params := map[string]interface{}{"repo": "owner/tool"}
	if prerelease {
		params["prerelease"] = true
	}
	return &config.ToolConfig{Name: "tool", InstallParams: params}
}

// A repository that publishes only prereleases is the case that distinguishes the two
// endpoints: releases/latest has nothing to return, so opting in has to change which
// endpoint is consulted, not merely filter the response.
func TestGitHubInstaller_CheckUpdateResolvesPrerelease(t *testing.T) {
	srv := newRecordingReleaseServer(t,
		[]githubRelease{{TagName: "v2.0.0-rc.1", Prerelease: true, Assets: []githubAsset{{Name: "tool-linux-amd64"}}}},
		nil,
	)
	inst := newPrereleaseTestInstaller(t, srv.URL)

	res, err := inst.CheckUpdate(context.Background(), prereleaseTool(true))
	if err != nil {
		t.Fatalf("CheckUpdate returned error: %v", err)
	}
	if res.LatestVersion != "v2.0.0-rc.1" {
		t.Errorf("LatestVersion = %q, want %q", res.LatestVersion, "v2.0.0-rc.1")
	}
	if !srv.requested("/repos/owner/tool/releases") {
		t.Errorf("expected the releases listing to be requested, got %v", srv.paths)
	}
}

// Opting in must not change behaviour for everyone else.
func TestGitHubInstaller_CheckUpdateWithoutPrereleaseUsesLatest(t *testing.T) {
	srv := newRecordingReleaseServer(t,
		[]githubRelease{{TagName: "v2.0.0-rc.1", Prerelease: true}},
		&githubRelease{TagName: "v1.0.0", Assets: []githubAsset{{Name: "tool-linux-amd64"}}},
	)
	inst := newPrereleaseTestInstaller(t, srv.URL)

	res, err := inst.CheckUpdate(context.Background(), prereleaseTool(false))
	if err != nil {
		t.Fatalf("CheckUpdate returned error: %v", err)
	}
	if res.LatestVersion != "v1.0.0" {
		t.Errorf("LatestVersion = %q, want the stable release %q", res.LatestVersion, "v1.0.0")
	}
	if srv.requested("/repos/owner/tool/releases") {
		t.Errorf("releases listing must not be consulted without prerelease opt-in, got %v", srv.paths)
	}
}

// The listing returns drafts to callers with push access, and a draft carries no
// downloadable assets, so the newest published release is the one to take.
func TestGitHubInstaller_PrereleaseSkipsDrafts(t *testing.T) {
	srv := newRecordingReleaseServer(t,
		[]githubRelease{
			{TagName: "v3.0.0-draft", Draft: true},
			{TagName: "v2.0.0-rc.1", Prerelease: true, Assets: []githubAsset{{Name: "tool-linux-amd64"}}},
		},
		nil,
	)
	inst := newPrereleaseTestInstaller(t, srv.URL)

	res, err := inst.CheckUpdate(context.Background(), prereleaseTool(true))
	if err != nil {
		t.Fatalf("CheckUpdate returned error: %v", err)
	}
	if res.LatestVersion != "v2.0.0-rc.1" {
		t.Errorf("LatestVersion = %q, want the newest published release %q", res.LatestVersion, "v2.0.0-rc.1")
	}
}

// Install resolves the release independently of CheckUpdate, so it needs its own
// proof that the opt-in reaches the listing endpoint.
func TestGitHubInstaller_InstallResolvesPrerelease(t *testing.T) {
	srv := newRecordingReleaseServer(t,
		[]githubRelease{{TagName: "v2.0.0-rc.1", Prerelease: true}},
		nil,
	)
	inst := newPrereleaseTestInstaller(t, srv.URL)
	inst.BinDir = "/binaries/tool"

	// No asset matches, so the install fails after resolution. The endpoint that was
	// consulted is what this asserts; a failure to resolve at all reports differently.
	_, err := inst.Install(context.Background(), prereleaseTool(true))
	if err == nil {
		t.Fatalf("expected the install to fail once no asset matches")
	}
	if !srv.requested("/repos/owner/tool/releases") {
		t.Errorf("expected the releases listing to be requested, got %v (err: %v)", srv.paths, err)
	}
}
