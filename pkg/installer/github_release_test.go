package installer

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// newReleaseAPIServer serves the release endpoints for owner/tool the way the
// GitHub API does and records the Authorization header of the last request.
func newReleaseAPIServer(t *testing.T, latest githubRelease, listing []githubRelease, lastAuth *string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*lastAuth = r.Header.Get("Authorization")
		if ua := r.Header.Get("User-Agent"); ua != githubUserAgent {
			t.Errorf("User-Agent = %q, want %q", ua, githubUserAgent)
		}
		switch r.URL.Path {
		case "/repos/owner/tool/releases/latest":
			_ = json.NewEncoder(w).Encode(latest)
		case "/repos/owner/tool/releases/tags/v0.9.0":
			_ = json.NewEncoder(w).Encode(githubRelease{TagName: "v0.9.0"})
		case "/repos/owner/tool/releases":
			_ = json.NewEncoder(w).Encode(listing)
		case "/repos/owner/forbidden/releases/latest":
			w.WriteHeader(http.StatusForbidden)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func TestGithubReleaseClientFetch(t *testing.T) {
	latest := githubRelease{TagName: "v1.0.0", Assets: []githubAsset{{Name: "tool-linux-amd64.tar.gz"}}}
	listing := []githubRelease{
		{TagName: "v1.1.0-rc.1", Draft: true},
		{TagName: "v1.1.0-beta.1", Prerelease: true},
		{TagName: "v1.0.0"},
	}

	tests := []struct {
		name        string
		req         githubReleaseRequest
		ghOutput    string
		ghErr       error
		wantTag     string
		wantViaGh   bool
		wantErr     string
		wantAuth    string
		wantGhCalls int
	}{
		{
			name:    "latest release over the API",
			req:     githubReleaseRequest{repo: "owner/tool"},
			wantTag: "v1.0.0",
		},
		{
			name:    "explicit version uses the tags endpoint",
			req:     githubReleaseRequest{repo: "owner/tool", version: "v0.9.0"},
			wantTag: "v0.9.0",
		},
		{
			name:    "prerelease consults the listing and skips drafts",
			req:     githubReleaseRequest{repo: "owner/tool", prerelease: true},
			wantTag: "v1.1.0-beta.1",
		},
		{
			name:     "token is sent as an Authorization header",
			req:      githubReleaseRequest{repo: "owner/tool", token: "secret"},
			wantTag:  "v1.0.0",
			wantAuth: "token secret",
		},
		{
			name:        "ghCli resolves through gh api without touching the REST API",
			req:         githubReleaseRequest{repo: "owner/tool", ghCli: true},
			ghOutput:    `{"tag_name":"v2.0.0","assets":[]}`,
			wantTag:     "v2.0.0",
			wantViaGh:   true,
			wantGhCalls: 1,
		},
		{
			name:        "403 from the API falls back to gh",
			req:         githubReleaseRequest{repo: "owner/forbidden"},
			ghOutput:    `{"tag_name":"v3.0.0","assets":[]}`,
			wantTag:     "v3.0.0",
			wantViaGh:   true,
			wantGhCalls: 1,
		},
		{
			name:    "other API statuses are errors",
			req:     githubReleaseRequest{repo: "owner/missing"},
			wantErr: "GitHub API returned status 404",
		},
		{
			name:        "gh failure is reported",
			req:         githubReleaseRequest{repo: "owner/tool", ghCli: true},
			ghErr:       errors.New("gh: not logged in"),
			wantViaGh:   true,
			wantErr:     "fetching release via gh CLI",
			wantGhCalls: 1,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var lastAuth string
			server := newReleaseAPIServer(t, latest, listing, &lastAuth)
			runner := exec.NewMockRunner()
			runner.Register("gh", []byte(tt.ghOutput), tt.ghErr)
			client := githubReleaseClient{httpClient: server.Client(), runner: runner, baseURL: server.URL + "/"}

			release, viaGh, err := client.fetch(context.Background(), tt.req)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			} else if release.TagName != tt.wantTag {
				t.Fatalf("tag = %q, want %q", release.TagName, tt.wantTag)
			}
			if viaGh != tt.wantViaGh {
				t.Fatalf("viaGhCli = %v, want %v", viaGh, tt.wantViaGh)
			}
			if lastAuth != tt.wantAuth {
				t.Fatalf("Authorization = %q, want %q", lastAuth, tt.wantAuth)
			}
			if len(runner.History) != tt.wantGhCalls {
				t.Fatalf("gh invocations = %d, want %d: %v", len(runner.History), tt.wantGhCalls, runner.History)
			}
		})
	}
}

func TestGithubReleaseClientGhCliArguments(t *testing.T) {
	runner := exec.NewMockRunner()
	runner.Register("gh", []byte(`[{"tag_name":"v1.0.0"}]`), nil)
	client := githubReleaseClient{runner: runner, baseURL: "https://github.example.com/api/v3"}

	release, err := client.fetchViaGhCli(context.Background(), "owner/tool", "latest", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if release.TagName != "v1.0.0" {
		t.Fatalf("tag = %q, want v1.0.0", release.TagName)
	}
	wantArgs := "api --hostname github.example.com repos/owner/tool/releases?per_page=10"
	if got := strings.Join(runner.History[0].Args, " "); got != wantArgs {
		t.Fatalf("gh args = %q, want %q", got, wantArgs)
	}

	runner.Clear()
	runner.Register("gh", nil, nil)
	if err := client.downloadAssetViaGhCli(context.Background(), "owner/tool", "v1.0.0", "tool.dmg", "/dest"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wantArgs = "release download v1.0.0 --repo owner/tool --dir /dest --pattern tool.dmg --clobber"
	if got := strings.Join(runner.History[0].Args, " "); got != wantArgs {
		t.Fatalf("gh args = %q, want %q", got, wantArgs)
	}

	runner.Clear()
	runner.Register("gh", []byte("denied"), errors.New("exit status 1"))
	err = client.downloadAssetViaGhCli(context.Background(), "owner/tool", "v1.0.0", "tool.dmg", "/dest")
	if err == nil || !strings.Contains(err.Error(), "denied") {
		t.Fatalf("expected the gh output in the error, got %v", err)
	}
}

func TestGithubToken(t *testing.T) {
	tests := []struct {
		name string
		// params is the tool's installParams, projectToken the project
		// configuration's github.token.
		params       map[string]interface{}
		projectToken string
		env          map[string]string
		want         string
	}{
		{name: "parameter wins", params: map[string]interface{}{"token": "param"}, projectToken: "project", env: map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"}, want: "param"},
		{name: "github.token before the environment", projectToken: "project", env: map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"}, want: "project"},
		// The environment sources and their order are pinned once, in pkg/github;
		// what matters here is that a tool naming no token reaches them at all.
		{name: "the environment when a tool names no token", env: map[string]string{"GH_TOKEN": "cli"}, want: "cli"},
		{name: "nothing configured", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_TOKEN", tt.env["GITHUB_TOKEN"])
			t.Setenv("GH_TOKEN", tt.env["GH_TOKEN"])
			if got := githubToken(tt.params, tt.projectToken); got != tt.want {
				t.Fatalf("githubToken = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestReleaseInstallers_RequireRepo pins that a github-release or gitea-release tool
// whose repo is missing or malformed fails its update check with the configuration
// error Install gives, before any request is made. The update check used to answer
// such a tool with an empty result, which every caller reads as "up to date", for a
// tool that cannot even be installed (issue #120).
func TestReleaseInstallers_RequireRepo(t *testing.T) {
	type releaseInstaller interface {
		Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error)
		CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error)
	}
	newGitHub := func(t *testing.T) releaseInstaller {
		fsys := fs.NewMemFS()
		inst := NewGitHubInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
		inst.httpClient = &http.Client{Transport: failingTransport{t}}
		return inst
	}
	newGitea := func(t *testing.T) releaseInstaller {
		inst, _ := newGiteaTestInstaller(t, nil)
		inst.httpClient = &http.Client{Transport: failingTransport{t}}
		return inst
	}
	installers := []struct {
		name   string
		inst   func(t *testing.T) releaseInstaller
		params map[string]interface{}
	}{
		{name: "github-release", inst: newGitHub, params: map[string]interface{}{}},
		{name: "gitea-release", inst: newGitea, params: map[string]interface{}{"instanceUrl": "https://codeberg.org"}},
	}
	repos := []struct {
		name    string
		repo    interface{}
		wantErr string
	}{
		{name: "no repo", wantErr: "repository 'repo' is required in installParams"},
		{name: "an empty repo", repo: "", wantErr: "repository 'repo' is required in installParams"},
		{name: "a repo without an owner", repo: "tool", wantErr: `invalid repository format "tool". Expected 'owner/repo'`},
	}
	for _, ri := range installers {
		for _, rp := range repos {
			t.Run(ri.name+" with "+rp.name, func(t *testing.T) {
				params := map[string]interface{}{}
				for k, v := range ri.params {
					params[k] = v
				}
				if rp.repo != nil {
					params["repo"] = rp.repo
				}
				tool := &config.ToolConfig{Name: "tool", InstallParams: params}
				inst := ri.inst(t)

				_, installErr := inst.Install(context.Background(), tool)
				res, checkErr := inst.CheckUpdate(context.Background(), tool)
				assertCheckFailed(t, res, checkErr, rp.wantErr)
				if installErr == nil || installErr.Error() != checkErr.Error() {
					t.Errorf("Install() error = %v, CheckUpdate() error = %v; want the same configuration error", installErr, checkErr)
				}
			})
		}
	}
}
