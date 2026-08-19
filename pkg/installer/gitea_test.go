package installer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

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
}
