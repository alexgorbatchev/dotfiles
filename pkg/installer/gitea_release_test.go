package installer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// giteaAPIServer serves the release endpoints of one Gitea repository, owner/tool, the
// way a Gitea instance does: releases/latest answers with the newest stable release
// or 404, releases/tags/{tag} answers with that release or 404, and the releases
// listing returns every release newest first, drafts included. Every asset download
// hands out payload. It records the paths requested and the headers of the last
// request so tests can assert which endpoint a parameter selected.
type giteaAPIServer struct {
	*httptest.Server
	mu         sync.Mutex
	paths      []string
	lastAuth   string
	lastAccept string
}

type giteaAPIFixture struct {
	latest  *giteaRelease
	tagged  map[string]giteaRelease
	listing []giteaRelease
	payload []byte
}

func newGiteaAPIServer(t *testing.T, fixture giteaAPIFixture) *giteaAPIServer {
	t.Helper()
	srv := &giteaAPIServer{}
	withDownloadURLs := func(host string, rel giteaRelease) giteaRelease {
		assets := make([]giteaAsset, len(rel.Assets))
		for i, a := range rel.Assets {
			a.BrowserDownloadURL = "http://" + host + "/download/" + a.Name
			assets[i] = a
		}
		rel.Assets = assets
		return rel
	}
	srv.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		srv.mu.Lock()
		srv.paths = append(srv.paths, r.URL.RequestURI())
		srv.lastAuth = r.Header.Get("Authorization")
		srv.lastAccept = r.Header.Get("Accept")
		srv.mu.Unlock()

		const tagsPrefix = "/api/v1/repos/owner/tool/releases/tags/"
		switch {
		case r.URL.Path == "/api/v1/repos/owner/tool/releases/latest":
			if fixture.latest == nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(withDownloadURLs(r.Host, *fixture.latest))
		case strings.HasPrefix(r.URL.Path, tagsPrefix):
			rel, ok := fixture.tagged[strings.TrimPrefix(r.URL.Path, tagsPrefix)]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(withDownloadURLs(r.Host, rel))
		case r.URL.Path == "/api/v1/repos/owner/tool/releases":
			listing := make([]giteaRelease, len(fixture.listing))
			for i, rel := range fixture.listing {
				listing[i] = withDownloadURLs(r.Host, rel)
			}
			_ = json.NewEncoder(w).Encode(listing)
		case r.URL.Path == "/api/v1/repos/owner/broken/releases/latest":
			w.WriteHeader(http.StatusInternalServerError)
		case strings.HasPrefix(r.URL.Path, "/download/"):
			_, _ = w.Write(fixture.payload)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (s *giteaAPIServer) requested(uri string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.paths {
		if p == uri {
			return true
		}
	}
	return false
}

func (s *giteaAPIServer) requestedPaths() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.paths...)
}

func (s *giteaAPIServer) headers() (auth, accept string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastAuth, s.lastAccept
}

func giteaClientFixture() giteaAPIFixture {
	linuxAsset := giteaAsset{ID: 1, Name: "tool-linux-amd64"}
	return giteaAPIFixture{
		latest: &giteaRelease{TagName: "v1.0.0", Assets: []giteaAsset{linuxAsset}},
		tagged: map[string]giteaRelease{
			"v0.9.0": {TagName: "v0.9.0", Assets: []giteaAsset{linuxAsset}},
		},
		listing: []giteaRelease{
			{TagName: "v1.2.0", Draft: true, Assets: []giteaAsset{linuxAsset}},
			{TagName: "v1.1.0-rc.1", Prerelease: true, Assets: []giteaAsset{linuxAsset}},
			{TagName: "v1.0.0", Assets: []giteaAsset{linuxAsset}},
		},
		payload: []byte("gitea-binary-payload"),
	}
}

func TestGiteaReleaseClientFetch(t *testing.T) {
	tests := []struct {
		name       string
		req        giteaReleaseRequest
		wantTag    string
		wantPath   string
		wantErr    string
		wantAuth   string
		wantAccept string
	}{
		{
			name:       "latest release uses releases/latest",
			req:        giteaReleaseRequest{repo: "owner/tool"},
			wantTag:    "v1.0.0",
			wantPath:   "/api/v1/repos/owner/tool/releases/latest",
			wantAccept: "application/json",
		},
		{
			name:     "the literal latest is the same as no version",
			req:      giteaReleaseRequest{repo: "owner/tool", version: "latest"},
			wantTag:  "v1.0.0",
			wantPath: "/api/v1/repos/owner/tool/releases/latest",
		},
		{
			name:     "explicit version uses the tags endpoint",
			req:      giteaReleaseRequest{repo: "owner/tool", version: "v0.9.0"},
			wantTag:  "v0.9.0",
			wantPath: "/api/v1/repos/owner/tool/releases/tags/v0.9.0",
		},
		{
			name:     "prerelease consults the listing and skips drafts",
			req:      giteaReleaseRequest{repo: "owner/tool", prerelease: true},
			wantTag:  "v1.1.0-rc.1",
			wantPath: "/api/v1/repos/owner/tool/releases?limit=10",
		},
		{
			name:     "prerelease does not change an explicit version",
			req:      giteaReleaseRequest{repo: "owner/tool", version: "v0.9.0", prerelease: true},
			wantTag:  "v0.9.0",
			wantPath: "/api/v1/repos/owner/tool/releases/tags/v0.9.0",
		},
		{
			name:     "token is sent as a token Authorization header",
			req:      giteaReleaseRequest{repo: "owner/tool", token: "secret"},
			wantTag:  "v1.0.0",
			wantPath: "/api/v1/repos/owner/tool/releases/latest",
			wantAuth: "token secret",
		},
		{
			name:    "unknown tag names the tag and the repository",
			req:     giteaReleaseRequest{repo: "owner/tool", version: "v9.9.9"},
			wantErr: `release "v9.9.9" not found for owner/tool`,
		},
		{
			name:    "repository without releases is reported",
			req:     giteaReleaseRequest{repo: "owner/missing"},
			wantErr: "no release found for owner/missing",
		},
		{
			name:    "other API statuses are errors",
			req:     giteaReleaseRequest{repo: "owner/broken"},
			wantErr: "Gitea API returned status 500",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newGiteaAPIServer(t, giteaClientFixture())
			client := giteaReleaseClient{httpClient: server.Client(), instanceURL: server.URL}

			release, err := client.fetch(context.Background(), tt.req)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if release.TagName != tt.wantTag {
				t.Fatalf("tag = %q, want %q", release.TagName, tt.wantTag)
			}
			if !server.requested(tt.wantPath) {
				t.Fatalf("requested %v, want %q", server.requestedPaths(), tt.wantPath)
			}
			auth, accept := server.headers()
			if auth != tt.wantAuth {
				t.Fatalf("Authorization = %q, want %q", auth, tt.wantAuth)
			}
			if tt.wantAccept != "" && accept != tt.wantAccept {
				t.Fatalf("Accept = %q, want %q", accept, tt.wantAccept)
			}
		})
	}
}

func TestGiteaReleaseClientListingWithoutPublishedRelease(t *testing.T) {
	server := newGiteaAPIServer(t, giteaAPIFixture{
		listing: []giteaRelease{{TagName: "v1.0.0", Draft: true}},
	})
	client := giteaReleaseClient{httpClient: server.Client(), instanceURL: server.URL}

	_, err := client.fetch(context.Background(), giteaReleaseRequest{repo: "owner/tool", prerelease: true})
	if err == nil || !strings.Contains(err.Error(), "no published release found for owner/tool") {
		t.Fatalf("error = %v, want a no-published-release error", err)
	}
}

func TestGiteaReleaseClientDecodeErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html>not json</html>"))
	}))
	t.Cleanup(server.Close)
	client := giteaReleaseClient{httpClient: server.Client(), instanceURL: server.URL}

	tests := []struct {
		name    string
		req     giteaReleaseRequest
		wantErr string
	}{
		{"single release body", giteaReleaseRequest{repo: "owner/tool"}, "decoding Gitea release response"},
		{"listing body", giteaReleaseRequest{repo: "owner/tool", prerelease: true}, "decoding Gitea releases response"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := client.fetch(context.Background(), tt.req)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestGiteaInstanceURL(t *testing.T) {
	tests := []struct {
		name    string
		params  map[string]interface{}
		want    string
		wantErr string
	}{
		{
			name:   "valid URL is returned without a trailing slash",
			params: map[string]interface{}{"instanceUrl": "https://codeberg.org/"},
			want:   "https://codeberg.org",
		},
		{
			name:   "URL with a path prefix is kept",
			params: map[string]interface{}{"instanceUrl": "https://git.example.com/gitea"},
			want:   "https://git.example.com/gitea",
		},
		{
			name:    "missing instanceUrl is an error",
			params:  map[string]interface{}{"repo": "owner/tool"},
			wantErr: "'instanceUrl' is required in installParams",
		},
		{
			name:    "blank instanceUrl is an error",
			params:  map[string]interface{}{"instanceUrl": "   "},
			wantErr: "'instanceUrl' is required in installParams",
		},
		{
			name:    "instanceUrl without a scheme is rejected",
			params:  map[string]interface{}{"instanceUrl": "codeberg.org"},
			wantErr: `instanceUrl "codeberg.org" must be a valid URL`,
		},
		{
			name:    "nil params are an error",
			params:  nil,
			wantErr: "'instanceUrl' is required in installParams",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := giteaInstanceURL(tt.params)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("instanceURL = %q, want %q", got, tt.want)
			}
		})
	}
}
