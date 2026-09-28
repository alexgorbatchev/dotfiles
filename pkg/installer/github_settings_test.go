package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// apiRecorder answers every request with one release and records the URLs it was
// asked for. It stands in for the network so that an installer which ignores the
// configured host records api.github.com instead of reaching it.
type apiRecorder struct {
	mu   sync.Mutex
	urls []string
}

func (r *apiRecorder) RoundTrip(req *http.Request) (*http.Response, error) {
	r.mu.Lock()
	r.urls = append(r.urls, req.URL.String())
	r.mu.Unlock()

	body, err := json.Marshal(githubRelease{
		TagName: "v1.0.0",
		Assets:  []githubAsset{{Name: "tool-darwin-arm64.pkg", BrowserDownloadURL: "https://downloads.example.invalid/tool.pkg"}},
	})
	if err != nil {
		return nil, err
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(bytes.NewReader(body)),
		Request:    req,
	}, nil
}

func (r *apiRecorder) recorded() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.urls...)
}

// TestGitHubHostReachesEveryReleaseInstaller proves the project configuration's
// github.host governs the GitHub API request of every installation method that
// resolves a release, not only github-release. Without the wiring dmg, pkg and
// cargo address api.github.com however the configuration is written, so a GitHub
// Enterprise user gets a setting that works for some of their tools only.
func TestGitHubHostReachesEveryReleaseInstaller(t *testing.T) {
	const host = "https://ghe.example.com/api/v3"

	sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
	githubReleaseSource := map[string]interface{}{
		"source": map[string]interface{}{"type": "github-release", "repo": "owner/tool"},
	}

	tests := []struct {
		method string
		// resolve makes the installer resolve a release with settings applied,
		// routing its HTTP traffic through client.
		resolve func(client *http.Client, settings GitHubSettings) error
	}{
		{
			method: "github-release",
			resolve: func(client *http.Client, settings GitHubSettings) error {
				inst := NewGitHubInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysCtx)
				inst.SetGitHubSettings(settings)
				inst.SetHTTPClient(client)
				_, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{
					Name:          "tool",
					InstallParams: map[string]interface{}{"repo": "owner/tool"},
				})
				return err
			},
		},
		{
			method: "dmg",
			resolve: func(client *http.Client, settings GitHubSettings) error {
				inst := NewDmgInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysCtx)
				inst.SetGitHubSettings(settings)
				inst.SetHTTPClient(client)
				_, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{
					Name:          "tool",
					InstallParams: githubReleaseSource,
				})
				return err
			},
		},
		{
			method: "pkg",
			resolve: func(client *http.Client, settings GitHubSettings) error {
				inst := NewPkgInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysCtx)
				inst.SetGitHubSettings(settings)
				inst.SetHTTPClient(client)
				_, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{
					Name:          "tool",
					InstallParams: githubReleaseSource,
				})
				return err
			},
		},
		{
			method: "cargo",
			resolve: func(client *http.Client, settings GitHubSettings) error {
				inst := NewCargoInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, sysCtx)
				inst.SetGitHubSettings(settings)
				inst.SetHTTPClient(client)
				tool := &config.ToolConfig{
					Name:          "tool",
					InstallParams: map[string]interface{}{"binarySource": "github-releases", "githubRepo": "owner/tool"},
				}
				_, err := resolveToolVersion(t, inst, context.Background(), tool, "tool")
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			recorder := &apiRecorder{}
			if err := tt.resolve(&http.Client{Transport: recorder}, GitHubSettings{Host: host}); err != nil {
				t.Fatalf("resolving a release through the %s installer: %v", tt.method, err)
			}

			urls := recorder.recorded()
			if len(urls) == 0 {
				t.Fatalf("the %s installer made no GitHub API request", tt.method)
			}
			for _, u := range urls {
				if !strings.HasPrefix(u, host+"/") {
					t.Errorf("the %s installer requested %s, want a request to the configured host %s", tt.method, u, host)
				}
			}
		})
	}
}

// TestNewGitHubSettings pins how the github section of a project configuration
// becomes the installer's settings: host, token and User-Agent as written, the
// cache directory derived from Paths.GeneratedDir, and cache TTL converted from
// milliseconds.
func TestNewGitHubSettings(t *testing.T) {
	disabled := false
	tests := []struct {
		name string
		cfg  *config.ProjectConfig
		want GitHubSettings
	}{
		{
			name: "nil project configuration returns empty settings",
			cfg:  nil,
			want: GitHubSettings{},
		},
		{
			name: "empty project configuration enables cache with empty dir and zero ttl",
			cfg:  &config.ProjectConfig{},
			want: GitHubSettings{CacheEnabled: true},
		},
		{
			name: "generated dir derives the github-api cache directory",
			cfg:  &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/gen"}},
			want: GitHubSettings{
				CacheEnabled: true,
				CacheDir:     filepath.Join("/gen", "cache", "github-api"),
			},
		},
		{
			name: "every key is carried over as written",
			cfg: &config.ProjectConfig{
				Paths: config.PathsConfig{GeneratedDir: "/gen"},
				Github: config.HostConfig{
					Host:      "https://ghe.example/api/v3",
					Token:     "gh-token",
					UserAgent: "my-bot/1.0",
					Cache: config.CacheConfig{
						Enabled: &disabled,
						TTL:     5000,
					},
				},
			},
			want: GitHubSettings{
				Host:         "https://ghe.example/api/v3",
				Token:        "gh-token",
				UserAgent:    "my-bot/1.0",
				CacheEnabled: false,
				CacheDir:     filepath.Join("/gen", "cache", "github-api"),
				CacheTTL:     5 * time.Second,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NewGitHubSettings(tt.cfg); got != tt.want {
				t.Fatalf("NewGitHubSettings() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestGitHubInstaller_SetGitHubSettings_AppliesCache(t *testing.T) {
	inst := NewGitHubInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, nil)
	settings := GitHubSettings{
		Host:         "https://ghe.example/api/v3",
		Token:        "gh-token",
		UserAgent:    "bot",
		CacheEnabled: true,
		CacheDir:     "/gen/cache/github-api",
		CacheTTL:     15 * time.Minute,
	}
	inst.SetGitHubSettings(settings)

	if inst.BaseURL != settings.Host {
		t.Errorf("inst.BaseURL = %q, want %q", inst.BaseURL, settings.Host)
	}
	if inst.CacheDir != settings.CacheDir {
		t.Errorf("inst.CacheDir = %q, want %q", inst.CacheDir, settings.CacheDir)
	}
	if inst.CacheTTL != settings.CacheTTL {
		t.Errorf("inst.CacheTTL = %v, want %v", inst.CacheTTL, settings.CacheTTL)
	}
	if inst.GitHub != settings {
		t.Errorf("inst.GitHub = %+v, want %+v", inst.GitHub, settings)
	}
}
