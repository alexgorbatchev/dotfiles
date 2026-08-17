package installer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestInstallersCheckUpdateAndMethods(t *testing.T) {
	mockRelease := map[string]interface{}{
		"tag_name": "v3.0.0",
		"assets": []map[string]interface{}{
			{"name": "tool-v3.0.0-linux-amd64.tar.gz", "browser_download_url": "http://127.0.0.1/dl"},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(mockRelease)
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	// 1. GitHubInstaller CheckUpdate
	gh := NewGitHubInstaller(runner, fsys, dl, sysCtx)
	gh.httpClient = server.Client()
	gh.BaseURL = server.URL
	tool := &config.ToolConfig{
		Name: "test-gh",
		InstallParams: map[string]interface{}{
			"repo": "owner/repo",
		},
	}
	res, err := gh.CheckUpdate(context.Background(), tool)
	if err != nil || res == nil || res.LatestVersion != "v3.0.0" {
		t.Errorf("GitHub CheckUpdate failed: res=%v, err=%v", res, err)
	}

	// 2. GiteaInstaller CheckUpdate
	gt := NewGiteaInstaller(runner, fsys, dl, sysCtx)
	gt.httpClient = server.Client()
	giteaTool := &config.ToolConfig{
		Name: "test-gitea",
		InstallParams: map[string]interface{}{
			"repo":        "owner/repo",
			"instanceUrl": server.URL,
		},
	}
	res, err = gt.CheckUpdate(context.Background(), giteaTool)
	if err != nil || res == nil || res.LatestVersion != "v3.0.0" {
		t.Errorf("Gitea CheckUpdate failed: res=%v, err=%v", res, err)
	}

	// 3. DmgInstaller CheckUpdate
	dmg := NewDmgInstaller(runner, fsys, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	dmg.httpClient = server.Client()
	dmg.BaseURL = server.URL
	dmgTool := &config.ToolConfig{
		Name: "test-dmg",
		InstallParams: map[string]interface{}{
			"source": map[string]interface{}{
				"repo": "owner/repo",
			},
		},
	}
	res, err = dmg.CheckUpdate(context.Background(), dmgTool)
	if err != nil || res == nil || res.LatestVersion != "v3.0.0" {
		t.Errorf("Dmg CheckUpdate failed: res=%v, err=%v", res, err)
	}

	// 4. PkgInstaller CheckUpdate
	pkgInst := NewPkgInstaller(runner, fsys, dl, &SystemContext{OS: "darwin", Arch: "arm64"})
	pkgInst.httpClient = server.Client()
	pkgInst.BaseURL = server.URL
	res, err = pkgInst.CheckUpdate(context.Background(), dmgTool)
	if err != nil || res == nil || res.LatestVersion != "v3.0.0" {
		t.Errorf("Pkg CheckUpdate failed: res=%v, err=%v", res, err)
	}

	// 5. CargoInstaller CheckUpdate
	cargo := NewCargoInstaller(runner, fsys, dl, sysCtx)
	cargo.httpClient = server.Client()
	cargo.BaseURL = server.URL
	cargoTool := &config.ToolConfig{
		Name: "test-cargo",
		InstallParams: map[string]interface{}{
			"crate": "test-cargo",
			"repo":  "owner/repo",
		},
	}
	res, err = cargo.CheckUpdate(context.Background(), cargoTool)
	if err != nil || res == nil || res.LatestVersion != "latest" {
		t.Errorf("Cargo CheckUpdate failed: res=%v, err=%v", res, err)
	}

	// 6. BrewInstaller getBrewPrefix & getBrewVersion
	brew := NewBrewInstaller(runner, fsys, sysCtx)
	runner.Register("brew", []byte(`[{"versions":{"stable":"1.2.3"}}]`), nil)
	brewTool := &config.ToolConfig{
		Name: "test-brew",
		InstallParams: map[string]interface{}{
			"formula": "test-brew",
		},
	}
	res, err = brew.CheckUpdate(context.Background(), brewTool)
	if err != nil || res == nil || res.LatestVersion != "1.2.3" {
		t.Errorf("Brew CheckUpdate failed: res=%v, err=%v", res, err)
	}
}
