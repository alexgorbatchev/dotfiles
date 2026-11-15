package installer

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestMacReleasePrivateAssetAuthentication(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "")
	t.Setenv("GH_TOKEN", "")
	for _, method := range []string{"dmg", "pkg"} {
		for _, tokenSource := range []string{"tool", "project"} {
			t.Run(method+"/"+tokenSource, func(t *testing.T) {
				var mu sync.Mutex
				headers := map[string]http.Header{}
				storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					mu.Lock()
					headers[r.URL.Path] = r.Header.Clone()
					mu.Unlock()
					if r.URL.Path == "/browser" {
						http.NotFound(w, r)
						return
					}
					_, _ = w.Write([]byte("private-package"))
				}))
				defer storage.Close()
				digest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte("private-package")))
				api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					mu.Lock()
					headers[r.URL.Path] = r.Header.Clone()
					mu.Unlock()
					switch r.URL.Path {
					case "/repos/owner/app/releases/latest":
						_ = json.NewEncoder(w).Encode(githubRelease{TagName: "v1.2.3", Assets: []githubAsset{{
							ID: 42, Name: "app-darwin-arm64." + method, Digest: &digest, BrowserDownloadURL: storage.URL + "/browser",
						}}})
					case "/repos/owner/app/releases/assets/42":
						http.Redirect(w, r, storage.URL+"/payload", http.StatusFound)
					default:
						http.NotFound(w, r)
					}
				}))
				defer api.Close()
				inst, _, _, tool := macAssetInstaller(t, method, api.URL)
				if tokenSource == "tool" {
					tool.InstallParams["token"] = "secret"
				} else {
					inst.(interface{ SetGitHubSettings(GitHubSettings) }).SetGitHubSettings(GitHubSettings{Token: "secret"})
				}
				if _, err := inst.Install(context.Background(), tool); err != nil {
					t.Fatal(err)
				}
				mu.Lock()
				defer mu.Unlock()
				for _, path := range []string{"/repos/owner/app/releases/latest", "/repos/owner/app/releases/assets/42"} {
					if got := headers[path].Get("Authorization"); got != "token secret" {
						t.Errorf("%s authorization = %q", path, got)
					}
				}
				if got := headers["/repos/owner/app/releases/assets/42"].Get("Accept"); got != "application/octet-stream" {
					t.Errorf("asset API Accept = %q", got)
				}
				for _, path := range []string{"/browser", "/payload"} {
					header, requested := headers[path]
					if !requested || header.Get("Authorization") != "" {
						t.Errorf("%s requested=%t authorization=%q; unrelated host must receive no token", path, requested, header.Get("Authorization"))
					}
				}
			})
		}
	}
}

func TestGitHubAssetAuthenticationFallbackLimits(t *testing.T) {
	for _, tc := range []struct {
		name          string
		browserStatus int
		apiStatus     int
		token         string
		assetID       int64
		badDigest     bool
		wantAPI       bool
		wantErr       string
	}{
		{name: "unauthorized browser", browserStatus: 401, apiStatus: 200, token: "secret", assetID: 42, wantAPI: true},
		{name: "forbidden browser", browserStatus: 403, apiStatus: 200, token: "secret", assetID: 42, wantAPI: true},
		{name: "API rejects token", browserStatus: 404, apiStatus: 401, token: "secret", assetID: 42, wantAPI: true, wantErr: "status 401"},
		{name: "no token", browserStatus: 404, assetID: 42, wantErr: "status 404"},
		{name: "no asset ID", browserStatus: 404, token: "secret", wantErr: "status 404"},
		{name: "server failure", browserStatus: 500, token: "secret", assetID: 42, wantErr: "status 500"},
		{name: "browser digest failure", browserStatus: 200, token: "secret", assetID: 42, badDigest: true, wantErr: "checksum mismatch"},
		{name: "API digest failure", browserStatus: 404, apiStatus: 200, token: "secret", assetID: 42, badDigest: true, wantAPI: true, wantErr: "checksum mismatch"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
				status := tc.browserStatus
				if strings.HasPrefix(r.URL.Path, "/repos/") {
					status = tc.apiStatus
				}
				w.WriteHeader(status)
				_, _ = w.Write([]byte("payload"))
			})
			fsys := fs.NewMemFS()
			if err := fsys.MkdirAll("/staging", 0755); err != nil {
				t.Fatal(err)
			}
			dl := downloader.NewDownloader(fsys, server.Client())
			digest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte("payload")))
			if tc.badDigest {
				digest = "sha256:" + strings.Repeat("0", 64)
			}
			client := githubReleaseClient{baseURL: server.URL}
			err := client.downloadAsset(context.Background(), githubAssetRequest{
				repo: "owner/app", tag: "v1.2.3", destDir: "/staging", token: tc.token,
				asset: githubAsset{ID: tc.assetID, Name: "app.pkg", BrowserDownloadURL: server.URL + "/browser", Digest: &digest},
			}, fsys, dl)
			if tc.wantErr == "" && err != nil || tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)) {
				t.Fatalf("download error = %v, want %q", err, tc.wantErr)
			}
			if got := server.requested("/repos/owner/app/releases/assets/42"); got != tc.wantAPI {
				t.Fatalf("API fallback = %t, want %t; requests=%v", got, tc.wantAPI, server.paths)
			}
			if exists, err := fsys.Exists("/staging/app.pkg"); tc.badDigest && (exists || err != nil) {
				t.Fatalf("checksum failure retained downloaded package: exists=%t error=%v", exists, err)
			}
		})
	}
}
