package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// TestGiteaInstaller_InstallExtractsTarXz mirrors the github-release case from issue #28:
// a .tar.xz asset is extracted and its nested binary promoted, not copied out as the
// binary.
func TestGiteaInstaller_InstallExtractsTarXz(t *testing.T) {
	runner := exec.NewMockRunner()
	mockXz(runner, createTarBytes(t, map[string]string{"mytool-linux-amd64/mytool": "binary-payload"}))
	server := newReleaseServer(t, "v1.0.0", []string{"mytool-linux-amd64-update", "mytool-linux-amd64.tar.xz"}, []byte("opaque xz stream"))

	var logBuf bytes.Buffer
	fsys := fs.NewMemFS()
	inst := NewGiteaInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
	inst.httpClient = server.Client()
	inst.BinDir = "/test/bin"
	inst.SetLogger(logger.New(logger.Config{Name: "test", Level: logger.LogLevelVerbose, Writer: &logBuf}))

	tool := &config.ToolConfig{
		Name:          "mytool",
		InstallParams: map[string]interface{}{"instanceUrl": server.URL, "repo": "owner/tool"},
	}
	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if downloads := server.downloads(); len(downloads) != 1 || downloads[0] != "mytool-linux-amd64.tar.xz" {
		t.Errorf("downloaded %v, want only the .tar.xz archive", downloads)
	}
	if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
		t.Errorf("Binaries = %v, want [mytool]", res.Binaries)
	}
	if got, err := fsys.ReadFile("/test/bin/mytool"); err != nil || string(got) != "binary-payload" {
		t.Errorf("mytool = %q, %v; want the extracted binary", string(got), err)
	}
	if exists, _ := fsys.Exists("/test/bin/mytool-linux-amd64.tar.xz"); exists {
		t.Error("downloaded archive was left behind")
	}
	if !strings.Contains(logBuf.String(), "Extracting mytool-linux-amd64.tar.xz...") {
		t.Errorf("expected an 'Extracting ...' log line, got:\n%s", logBuf.String())
	}
}

func TestGiteaInstaller_InstallRejectsUnusableAssets(t *testing.T) {
	tests := []struct {
		name    string
		asset   string
		pattern string
	}{
		{"rar archive", "mytool-linux-amd64.rar", ""},
		{"debian package selected by pattern", "mytool-linux-amd64.deb", `\.deb$`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newReleaseServer(t, "v1.0.0", []string{tt.asset}, []byte("not a program"))
			fsys := fs.NewMemFS()
			inst := NewGiteaInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.httpClient = server.Client()
			inst.BinDir = "/test/bin"

			params := map[string]interface{}{"instanceUrl": server.URL, "repo": "owner/tool"}
			if tt.pattern != "" {
				params["assetPattern"] = tt.pattern
			}
			_, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mytool", InstallParams: params})
			if err == nil {
				t.Fatalf("Install(%s) succeeded, want an error", tt.asset)
			}
			if !strings.Contains(err.Error(), tt.asset) {
				t.Errorf("error %q does not name the asset %s", err, tt.asset)
			}
			if exists, _ := fsys.Exists("/test/bin/mytool"); exists {
				t.Errorf("%s was installed as the binary", tt.asset)
			}
		})
	}
}

func TestGiteaInstaller(t *testing.T) {
	// Create a mock Gitea server
	mockRelease := giteaRelease{
		ID:      12345,
		TagName: "v1.2.0",
		Name:    "v1.2.0 Release",
		Assets: []giteaAsset{
			{
				ID:   999,
				Name: "mytool-linux-amd64",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/repos/myowner/mytool/releases/latest" || r.URL.Path == "/api/v1/repos/myowner/mytool/releases/tags/v1.2.0" {
			mockRelease.Assets[0].BrowserDownloadURL = "http://" + r.Host + "/download/mytool"
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(mockRelease)
			return
		}

		if r.URL.Path == "/download/mytool" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("gitea-binary-payload"))
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewGiteaInstaller(runner, fsys, dl, &SystemContext{OS: "linux", Arch: "amd64"})
	inst.httpClient = server.Client()
	inst.BinDir = "/test/bin"

	if inst.Name() != "gitea-release" {
		t.Errorf("expected name to be 'gitea-release', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success from Gitea", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"instanceUrl": server.URL,
				"repo":        "myowner/mytool",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected downloaded file to exist at %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil {
			t.Fatalf("reading downloaded file: %v", err)
		}
		if string(data) != "gitea-binary-payload" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Install success with tar.gz archive and token", func(t *testing.T) {
		tarBytes, _ := createTarGzBytes(map[string]string{"giteatool": "archive-content"})
		var authHeader string

		giteaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if h := r.Header.Get("Authorization"); h != "" {
				authHeader = h
			}
			if r.URL.Path == "/api/v1/repos/myowner/giteatool/releases/latest" {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(giteaRelease{
					TagName: "v1.0.0",
					Assets: []giteaAsset{
						{Name: "giteatool-linux-amd64.tar.gz", BrowserDownloadURL: "http://" + r.Host + "/download.tar.gz"},
					},
				})
				return
			}
			if r.URL.Path == "/download.tar.gz" {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(tarBytes)
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer giteaServer.Close()

		gInst := NewGiteaInstaller(runner, fsys, dl, &SystemContext{OS: "linux", Arch: "amd64"})
		gInst.httpClient = giteaServer.Client()
		gInst.BinDir = "/test/gitea-tar"

		tool := &config.ToolConfig{
			Name: "giteatool",
			InstallParams: map[string]interface{}{
				"instanceUrl": giteaServer.URL,
				"repo":        "myowner/giteatool",
				"token":       "gitea-sec-token",
			},
		}

		res, err := gInst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error installing gitea tar.gz: %v", err)
		}
		if len(res.Binaries) == 0 {
			t.Errorf("expected promoted binaries from gitea tar.gz install")
		}
		if authHeader != "token gitea-sec-token" {
			t.Errorf("expected token auth header 'token gitea-sec-token', got %q", authHeader)
		}
	})

	t.Run("Install fails repo missing", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"instanceUrl": server.URL,
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error for missing repo, got nil")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.WriteFile(destPath, []byte("content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be uninstalled")
		}
	})

	t.Run("CheckUpdate and basic details", func(t *testing.T) {
		currentVer := "v1.0.0"
		tool := &config.ToolConfig{
			Name:    "mytool",
			Version: &currentVer,
			InstallParams: map[string]interface{}{
				"instanceUrl": server.URL,
				"repo":        "myowner/mytool",
			},
		}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || !res.HasUpdate || res.LatestVersion != "v1.2.0" {
			t.Errorf("unexpected CheckUpdate result: res=%v, err=%v", res, err)
		}
	})

	t.Run("CheckUpdate disk caching and force bypass", func(t *testing.T) {
		gMem := fs.NewMemFS()
		gDl := downloader.NewDownloader(gMem, nil)
		gInst := NewGiteaInstaller(exec.NewMockRunner(), gMem, gDl, &SystemContext{OS: "linux", Arch: "amd64"})
		gInst.CacheDir = "/cache/gitea-api"
		gInst.CacheTTL = time.Hour

		tool := &config.ToolConfig{
			Name: "cache-gitea-tool",
			InstallParams: map[string]interface{}{
				"instanceUrl": server.URL,
				"repo":        "myowner/mytool",
			},
		}

		ctx := context.Background()

		// 1. First call -> Cache Miss (live fetch)
		res1, err := gInst.CheckUpdate(ctx, tool)
		if err != nil {
			t.Fatalf("first CheckUpdate failed: %v", err)
		}
		if res1.Cached {
			t.Errorf("expected first call to be uncached, got Cached=true")
		}

		// 2. Second call -> Cache Hit
		res2, err := gInst.CheckUpdate(ctx, tool)
		if err != nil {
			t.Fatalf("second CheckUpdate failed: %v", err)
		}
		if !res2.Cached {
			t.Errorf("expected second call to be cached, got Cached=false")
		}

		// 3. Third call with force -> Cache Bypass
		forceCtx := config.WithOverwrite(ctx, true)
		res3, err := gInst.CheckUpdate(forceCtx, tool)
		if err != nil {
			t.Fatalf("forced CheckUpdate failed: %v", err)
		}
		if res3.Cached {
			t.Errorf("expected forced call to be uncached, got Cached=true")
		}

		// 4. Install with cached release (fixed version)
		toolFixed := &config.ToolConfig{
			Name: "cache-gitea-tool",
			InstallParams: map[string]interface{}{
				"instanceUrl": server.URL,
				"repo":        "myowner/mytool",
				"version":     "v1.2.0",
			},
		}
		resInst, err := gInst.Install(ctx, toolFixed)
		if err != nil {
			t.Fatalf("Install with fixed version failed: %v", err)
		}
		if len(resInst.Binaries) == 0 {
			t.Errorf("expected binaries installed")
		}

		// Install again -> hits cache
		_, err = gInst.Install(ctx, toolFixed)
		if err != nil {
			t.Fatalf("second Install failed: %v", err)
		}
	})
}

// newGiteaTestInstaller wires a GiteaInstaller to an in-memory filesystem and the given
// API server, installing into /test/bin for linux/amd64.
func newGiteaTestInstaller(t *testing.T, server *giteaAPIServer) (*GiteaInstaller, fs.FS) {
	t.Helper()
	fsys := fs.NewMemFS()
	inst := NewGiteaInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
	if server != nil {
		inst.httpClient = server.Client()
	}
	inst.BinDir = "/test/bin"
	return inst, fsys
}

func giteaToolConfig(instanceURL string, params map[string]interface{}, toolVersion string) *config.ToolConfig {
	installParams := map[string]interface{}{"repo": "owner/tool"}
	if instanceURL != "" {
		installParams["instanceUrl"] = instanceURL
	}
	for k, v := range params {
		installParams[k] = v
	}
	tool := &config.ToolConfig{Name: "tool", InstallParams: installParams}
	if toolVersion != "" {
		tool.Version = &toolVersion
	}
	return tool
}

// TestGiteaInstaller_InstallVersionSelection covers issue #32: the `version` and
// `prerelease` install parameters select which release endpoint is consulted, exactly
// as they did in v1, and `.version()` is only the fallback for a missing `version`.
func TestGiteaInstaller_InstallVersionSelection(t *testing.T) {
	tests := []struct {
		name        string
		params      map[string]interface{}
		toolVersion string
		wantTag     string
		wantPath    string
	}{
		{
			name:     "no version resolves the latest stable release",
			wantTag:  "v1.0.0",
			wantPath: "/api/v1/repos/owner/tool/releases/latest",
		},
		{
			name:     "installParams version pins the release by tag",
			params:   map[string]interface{}{"version": "v0.9.0"},
			wantTag:  "v0.9.0",
			wantPath: "/api/v1/repos/owner/tool/releases/tags/v0.9.0",
		},
		{
			name:        ".version() is the fallback when installParams has no version",
			toolVersion: "v0.9.0",
			wantTag:     "v0.9.0",
			wantPath:    "/api/v1/repos/owner/tool/releases/tags/v0.9.0",
		},
		{
			name:        "installParams version wins over .version()",
			params:      map[string]interface{}{"version": "v0.9.0"},
			toolVersion: "latest",
			wantTag:     "v0.9.0",
			wantPath:    "/api/v1/repos/owner/tool/releases/tags/v0.9.0",
		},
		{
			name:     "prerelease resolves the newest published release from the listing",
			params:   map[string]interface{}{"prerelease": true},
			wantTag:  "v1.1.0-rc.1",
			wantPath: "/api/v1/repos/owner/tool/releases?limit=10",
		},
		{
			name:     "prerelease false keeps releases/latest",
			params:   map[string]interface{}{"prerelease": false},
			wantTag:  "v1.0.0",
			wantPath: "/api/v1/repos/owner/tool/releases/latest",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newGiteaAPIServer(t, giteaClientFixture())
			inst, fsys := newGiteaTestInstaller(t, server)

			res, err := inst.Install(context.Background(), giteaToolConfig(server.URL, tt.params, tt.toolVersion))
			if err != nil {
				t.Fatalf("Install failed: %v", err)
			}
			if res.Version != tt.wantTag {
				t.Errorf("Version = %q, want %q", res.Version, tt.wantTag)
			}
			if !server.requested(tt.wantPath) {
				t.Errorf("requested %v, want %q", server.requestedPaths(), tt.wantPath)
			}
			if got, err := fsys.ReadFile("/test/bin/tool"); err != nil || string(got) != "gitea-binary-payload" {
				t.Errorf("installed binary = %q, %v; want the downloaded asset", string(got), err)
			}
		})
	}
}

func TestGiteaInstaller_InstallUnknownTag(t *testing.T) {
	server := newGiteaAPIServer(t, giteaClientFixture())
	inst, _ := newGiteaTestInstaller(t, server)

	_, err := inst.Install(context.Background(), giteaToolConfig(server.URL, map[string]interface{}{"version": "v9.9.9"}, ""))
	if err == nil || !strings.Contains(err.Error(), `release "v9.9.9" not found for owner/tool`) {
		t.Fatalf("error = %v, want the unknown-tag error", err)
	}
}

// TestGiteaInstaller_RequiresInstanceURL: v1 declared instanceUrl as a required URL and
// rejected a config without it; the Go port silently defaulted to codeberg.org, which
// sent a request for a repository that only exists on the user's own instance to a
// public host.
func TestGiteaInstaller_RequiresInstanceURL(t *testing.T) {
	inst, _ := newGiteaTestInstaller(t, nil)
	inst.httpClient = &http.Client{Transport: failingTransport{t}}
	tool := giteaToolConfig("", nil, "")

	if _, err := inst.Install(context.Background(), tool); err == nil || !strings.Contains(err.Error(), "'instanceUrl' is required in installParams") {
		t.Fatalf("Install error = %v, want the missing instanceUrl error", err)
	}
	if _, err := inst.CheckUpdate(context.Background(), tool); err == nil || !strings.Contains(err.Error(), "'instanceUrl' is required in installParams") {
		t.Fatalf("CheckUpdate error = %v, want the missing instanceUrl error", err)
	}
}

// failingTransport fails the test on any request: the installer must reject a tool
// before it talks to a host it was never told about.
type failingTransport struct{ t *testing.T }

func (f failingTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	f.t.Errorf("unexpected request to %s", r.URL)
	return nil, http.ErrNotSupported
}

func TestGiteaInstaller_CheckUpdateHonoursPrerelease(t *testing.T) {
	server := newGiteaAPIServer(t, giteaClientFixture())
	inst, _ := newGiteaTestInstaller(t, server)
	ctx := context.Background()

	stable, err := inst.CheckUpdate(ctx, giteaToolConfig(server.URL, nil, ""))
	if err != nil || stable.LatestVersion != "v1.0.0" {
		t.Fatalf("stable CheckUpdate = %+v, %v; want v1.0.0", stable, err)
	}

	// A cached stable answer must not be served to a tool that opted into prereleases.
	pre, err := inst.CheckUpdate(ctx, giteaToolConfig(server.URL, map[string]interface{}{"prerelease": true}, ""))
	if err != nil {
		t.Fatalf("prerelease CheckUpdate failed: %v", err)
	}
	if pre.LatestVersion != "v1.1.0-rc.1" || pre.Cached {
		t.Errorf("prerelease CheckUpdate = %+v, want v1.1.0-rc.1 fetched from the listing", pre)
	}
	if !server.requested("/api/v1/repos/owner/tool/releases?limit=10") {
		t.Errorf("requested %v, want the releases listing", server.requestedPaths())
	}
}
