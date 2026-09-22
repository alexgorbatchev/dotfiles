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
				"type": "github-release",
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

	// 5. BrewInstaller getBrewPrefix & getBrewVersion
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

// TestCheckUpdate_Unsupported pins the installers, and the sources, that have no way to
// learn the latest version upstream. They must say so with ErrUpdateCheckUnsupported
// rather than answer with an empty result, which callers used to read as "up to date".
func TestCheckUpdate_Unsupported(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
	macCtx := &SystemContext{OS: "darwin", Arch: "arm64"}

	urlSource := map[string]interface{}{"source": map[string]interface{}{"type": "url", "url": "https://example.com/app.dmg"}}

	tests := []struct {
		name string
		inst Installer
		tool *config.ToolConfig
	}{
		{"manual", NewManualInstaller(fsys, sysCtx), &config.ToolConfig{Name: "mytool"}},
		{"curl-binary", NewCurlBinaryInstaller(runner, fsys, dl, sysCtx), &config.ToolConfig{Name: "mytool", InstallParams: map[string]interface{}{"url": "https://example.com/mytool"}}},
		{"curl-tar", NewCurlTarInstaller(runner, fsys, dl, sysCtx), &config.ToolConfig{Name: "mytool", InstallParams: map[string]interface{}{"url": "https://example.com/mytool.tar.gz"}}},
		{"curl-script", NewCurlScriptInstaller(runner, fsys, dl, sysCtx), &config.ToolConfig{Name: "mytool"}},
		// Reporting its own version leaves a script with nothing upstream to compare against.
		{"curl-script with versionArgs", NewCurlScriptInstaller(runner, fsys, dl, sysCtx), &config.ToolConfig{Name: "chktool", InstallParams: map[string]interface{}{"versionArgs": []interface{}{"--version"}}}},
		{"zsh-plugin", NewZshPluginInstaller(runner, fsys, sysCtx), &config.ToolConfig{Name: "zsh-autosuggestions"}},
		{"dmg from a direct URL", NewDmgInstaller(runner, fsys, dl, macCtx), &config.ToolConfig{Name: "app", InstallParams: urlSource}},
		{"pkg from a direct URL", NewPkgInstaller(runner, fsys, dl, macCtx), &config.ToolConfig{Name: "app", InstallParams: urlSource}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := tt.inst.CheckUpdate(context.Background(), tt.tool)
			if !errors.Is(err, ErrUpdateCheckUnsupported) {
				t.Fatalf("CheckUpdate() = %+v, %v; want ErrUpdateCheckUnsupported", res, err)
			}
			if res != nil {
				t.Errorf("CheckUpdate() result = %+v, want nil alongside ErrUpdateCheckUnsupported", res)
			}
		})
	}
}

// TestCheckUpdate_MacPackageSourceError pins that a dmg or pkg tool whose source cannot
// be read fails its update check. Nothing was asked upstream, and an empty answer would
// be reported as up to date.
func TestCheckUpdate_MacPackageSourceError(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	macCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
	badRepo := map[string]interface{}{"source": map[string]interface{}{"type": "github-release", "repo": "not-owner-slash-repo"}}

	tests := []struct {
		name string
		inst Installer
		tool *config.ToolConfig
	}{
		{"dmg without a source", NewDmgInstaller(runner, fsys, dl, macCtx), &config.ToolConfig{Name: "app"}},
		{"pkg without a source", NewPkgInstaller(runner, fsys, dl, macCtx), &config.ToolConfig{Name: "app"}},
		{"dmg with a malformed repository", NewDmgInstaller(runner, fsys, dl, macCtx), &config.ToolConfig{Name: "app", InstallParams: badRepo}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := tt.inst.CheckUpdate(context.Background(), tt.tool)
			if err == nil || res != nil {
				t.Fatalf("CheckUpdate() = %+v, %v; want an error and no result", res, err)
			}
			if errors.Is(err, ErrUpdateCheckUnsupported) {
				t.Errorf("CheckUpdate() = %v; a source that cannot be read is a configuration error, not an unsupported check", err)
			}
			if !strings.Contains(err.Error(), "reading app source") {
				t.Errorf("CheckUpdate() = %v; want the error to name the tool whose source failed", err)
			}
		})
	}
}
