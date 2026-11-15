package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path"
	"slices"
	"strings"
	"sync"
	"testing"
)

// mockRelease is what the release server publishes for one repository: the latest
// tag and the executables packed into its single tar.gz asset.
type mockRelease struct {
	Tag      string
	Binaries []string
	// OtherTags are releases the repository also publishes, older or prereleases, which
	// only a lookup by tag finds; they serve the same asset.
	OtherTags []string
}

// releaseAssetName is the one asset every mock release lists. Its name carries no
// platform, so tools select it with assetPattern.
const releaseAssetName = "tool.tar.gz"

// newReleaseServer serves GitHub-style "latest release" metadata and release
// assets for the given repositories and points the CLI at it through
// MOCK_SERVER_PORT, which BootstrapServices maps onto the GitHub host.
// Repositories not listed answer 500 so a failed update check can be exercised;
// every other path answers 404. The asset is served from the same server with the
// release's binaries inside, so the real GitHub installer can install it without
// leaving the machine. Each release lists that asset because the GitHub installer
// only caches releases that have one, and the cached branches are part of what
// is tested.
func newReleaseServer(t *testing.T, releases map[string]mockRelease) *httptest.Server {
	t.Helper()
	assets := make(map[string][]byte, len(releases))
	for repo, rel := range releases {
		files := make(map[string]string, len(rel.Binaries))
		for _, bin := range rel.Binaries {
			files[bin] = "#!/bin/sh\necho " + bin + " " + rel.Tag + "\n"
		}
		assets[repo] = createTestTarGz(t, files)
	}

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const apiPrefix, apiSuffix = "/repos/", "/releases/latest"
		if strings.HasPrefix(r.URL.Path, apiPrefix) && strings.HasSuffix(r.URL.Path, apiSuffix) {
			repo := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, apiPrefix), apiSuffix)
			rel, ok := releases[repo]
			if !ok {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"tag_name": %q, "assets": [{"name": %q, "browser_download_url": "%s/download/%s/%s"}]}`,
				rel.Tag, releaseAssetName, server.URL, repo, releaseAssetName)
			return
		}
		const tagInfix = "/releases/tags/"
		if strings.HasPrefix(r.URL.Path, apiPrefix) && strings.Contains(r.URL.Path, tagInfix) {
			repo, tag, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, apiPrefix), tagInfix)
			rel, ok := releases[repo]
			if !ok || (tag != rel.Tag && !slices.Contains(rel.OtherTags, tag)) {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"tag_name": %q, "assets": [{"name": %q, "browser_download_url": "%s/download/%s/%s"}]}`,
				tag, releaseAssetName, server.URL, repo, releaseAssetName)
			return
		}
		const downloadPrefix, downloadSuffix = "/download/", "/" + releaseAssetName
		if strings.HasPrefix(r.URL.Path, downloadPrefix) && strings.HasSuffix(r.URL.Path, downloadSuffix) {
			repo := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, downloadPrefix), downloadSuffix)
			if asset, ok := assets[repo]; ok {
				w.Header().Set("Content-Type", "application/gzip")
				_, _ = w.Write(asset)
				return
			}
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parsing test server URL: %v", err)
	}
	t.Setenv("MOCK_SERVER_PORT", u.Port())
	return server
}

// cargoUpstream is what newCratesServer publishes: the newest stable crates.io version of each
// crate, and the latest GitHub release tag of each owner/repo.
type cargoUpstream struct {
	crates   map[string]string
	releases map[string]string
	// observe, when set, sees every request before it is answered.
	observe func(r *http.Request)
}

// newCratesServer serves crates.io metadata and the cargo-quickinstall archive of
// every crate version, plus each repository's latest GitHub release and its release
// assets, and routes the CLI to it through MOCK_SERVER_PORT, which points the github
// host and all three cargo hosts at it. Crates not listed answer 500 so a failed check
// can be exercised; a download from another tag answers 404. The returned function
// lists the paths requested so far.
func newCratesServer(t *testing.T, upstream cargoUpstream) func() []string {
	t.Helper()
	const cratesPrefix, quickinstallPrefix, reposPrefix = "/api/v1/crates/", "/cargo-bins/cargo-quickinstall/releases/download/", "/repos/"
	var mu sync.Mutex
	var requested []string
	archive := func(w http.ResponseWriter, binary, version string) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(createTestTarGz(t, map[string]string{binary: "#!/bin/sh\necho " + binary + " " + version + "\n"}))
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requested = append(requested, r.URL.Path)
		mu.Unlock()
		if upstream.observe != nil {
			upstream.observe(r)
		}
		if crate, ok := strings.CutPrefix(r.URL.Path, cratesPrefix); ok {
			version, known := upstream.crates[crate]
			if !known {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"crate": {"name": %q, "max_version": %q, "max_stable_version": %q}}`, crate, version, version)
			return
		}
		for repo, tag := range upstream.releases {
			if r.URL.Path == reposPrefix+repo+"/releases/latest" {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `{"tag_name": %q, "assets": []}`, tag)
				return
			}
			// <owner>/<repo>/releases/download/<tag>/<asset>
			if strings.HasPrefix(r.URL.Path, "/"+repo+"/releases/download/"+tag+"/") {
				archive(w, path.Base(repo), tag)
				return
			}
		}
		// <crate>-<version>/<crate>-<version>-<arch>-<platform>.tar.gz
		if release, ok := strings.CutPrefix(r.URL.Path, quickinstallPrefix); ok {
			dir, _, _ := strings.Cut(release, "/")
			for crate := range upstream.crates {
				if version, isCrate := strings.CutPrefix(dir, crate+"-"); isCrate {
					archive(w, crate, version)
					return
				}
			}
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parsing test server URL: %v", err)
	}
	t.Setenv("MOCK_SERVER_PORT", u.Port())
	return func() []string {
		mu.Lock()
		defer mu.Unlock()
		return append([]string(nil), requested...)
	}
}
