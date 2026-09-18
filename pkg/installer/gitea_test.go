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
		if r.URL.Path == "/api/v1/repos/myowner/mytool/releases/latest" {
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
