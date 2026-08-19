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

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestGitHubInstaller(t *testing.T) {
	mockRelease := githubRelease{
		ID:      5678,
		TagName: "v2.0.0",
		Name:    "v2.0.0 Release",
		Assets: []githubAsset{
			{
				ID:   444,
				Name: "mytool-linux-amd64",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ua := r.Header.Get("User-Agent"); ua != "dotfiles-installer/1.0" {
			t.Errorf("expected User-Agent header 'dotfiles-installer/1.0', got %q", ua)
		}

		if r.URL.Path == "/repos/myowner/mytool/releases/latest" {
			mockRelease.Assets[0].BrowserDownloadURL = "http://" + r.Host + "/download/mytool"
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(mockRelease)
			return
		}

		if r.URL.Path == "/download/mytool" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("github-binary-payload"))
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewGitHubInstaller(runner, fsys, dl, &SystemContext{OS: "linux", Arch: "amd64"})
	inst.httpClient = server.Client()
	inst.BaseURL = server.URL
	inst.BinDir = "/test/bin"

	if inst.Name() != "github-release" {
		t.Errorf("expected name to be 'github-release', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success from GitHub", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"repo": "myowner/mytool",
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
		if string(data) != "github-binary-payload" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Install fails repo missing", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"token": "token123",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error for missing repo, got nil")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.MkdirAll(inst.BinDir, 0755)
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
		tool := &config.ToolConfig{Name: "mytool"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected: %v, %v", res, err)
		}
	})

	t.Run("Install HTTP 403 Rate Limit triggers gh CLI fallback", func(t *testing.T) {
		rateLimitServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden)
		}))
		defer rateLimitServer.Close()

		mockRunner := exec.NewMockRunner()
		ghReleaseJson, _ := json.Marshal(githubRelease{
			TagName: "v1.0.0",
			Assets: []githubAsset{
				{Name: "mytool-linux-amd64"},
			},
		})
		mockRunner.Register("gh", ghReleaseJson, nil)

		ghFsys := fs.NewMemFS()
		ghDl := downloader.NewDownloader(ghFsys, nil)
		ghInst := NewGitHubInstaller(mockRunner, ghFsys, ghDl, &SystemContext{OS: "linux", Arch: "amd64"})
		ghInst.httpClient = rateLimitServer.Client()
		ghInst.BaseURL = rateLimitServer.URL
		ghInst.BinDir = "/test/bin"

		// Pre-populate asset at destination as gh release download mock
		_ = ghFsys.MkdirAll("/test/bin", 0755)
		_ = ghFsys.WriteFile("/test/bin/mytool-linux-amd64", []byte("gh-binary-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"repo": "myowner/mytool",
			},
		}

		res, err := ghInst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error on gh CLI fallback: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}
	})
}

func TestGitHubInstaller_ConcurrentAccess(t *testing.T) {
	// Retrieve the registered global singleton
	inst, err := Get("github-release")
	if err != nil {
		t.Fatalf("failed to find github-release installer: %v", err)
	}

	ghInst, ok := inst.(*GitHubInstaller)
	if !ok {
		t.Fatalf("registered installer is not *GitHubInstaller")
	}

	// Read and invoke matchAsset concurrently to check for data races
	const goroutines = 20
	done := make(chan bool)
	for i := 0; i < goroutines; i++ {
		go func() {
			_ = ghInst.matchAsset([]githubAsset{{Name: "test-linux-amd64"}}, "")
			done <- true
		}()
	}

	for i := 0; i < goroutines; i++ {
		<-done
	}
}

func TestGitHubInstaller_MatchAssetHeuristics(t *testing.T) {
	inst := &GitHubInstaller{
		sysCtx: &SystemContext{
			OS:   "linux",
			Arch: "amd64",
		},
	}

	t.Run("Priority and Filtering Heuristics", func(t *testing.T) {
		assets := []githubAsset{
			{Name: "mytool-linux-amd64.sha256"}, // undesired extension (checksum)
			{Name: "mytool-linux-amd64.deb"},    // package extension (low priority)
			{Name: "mytool-linux-amd64.tar.gz"}, // archive extension (high priority)
			{Name: "mytool-linux-amd64"},        // standalone binary (high priority)
			{Name: "mytool-darwin-amd64"},       // incorrect OS
		}

		// Without a pattern, we expect to pick the tar.gz or standalone binary rather than the sha256 or deb
		matched := inst.matchAsset(assets, "")
		if matched == nil {
			t.Fatalf("expected to match an asset, got nil")
		}
		if matched.Name != "mytool-linux-amd64.tar.gz" && matched.Name != "mytool-linux-amd64" {
			t.Errorf("expected to match tar.gz or standalone binary, got %q", matched.Name)
		}
	})

	t.Run("Explicit assetPattern", func(t *testing.T) {
		assets := []githubAsset{
			{Name: "mytool-linux-amd64.deb"},
			{Name: "mytool-linux-amd64.tar.gz"},
			{Name: "mytool-linux-amd64.sha256"},
		}

		// Match specifically the deb package using pattern
		matched := inst.matchAsset(assets, `\.deb$`)
		if matched == nil {
			t.Fatalf("expected to match deb asset with pattern, got nil")
		}
		if matched.Name != "mytool-linux-amd64.deb" {
			t.Errorf("expected mytool-linux-amd64.deb, got %q", matched.Name)
		}

		// Match the checksum with explicit pattern
		matchedChecksum := inst.matchAsset(assets, `\.sha256$`)
		if matchedChecksum == nil {
			t.Fatalf("expected to match sha256 asset with pattern, got nil")
		}
		if matchedChecksum.Name != "mytool-linux-amd64.sha256" {
			t.Errorf("expected mytool-linux-amd64.sha256, got %q", matchedChecksum.Name)
		}
	})

	t.Run("Glob assetPattern yazi-*.zip", func(t *testing.T) {
		assets := []githubAsset{
			{Name: "yazi-x86_64-unknown-linux-gnu.deb"},
			{Name: "yazi-x86_64-unknown-linux-gnu.zip"},
			{Name: "yazi-aarch64-unknown-linux-gnu.zip"},
		}

		matched := inst.matchAsset(assets, "yazi-*.zip")
		if matched == nil {
			t.Fatalf("expected to match yazi asset with glob pattern yazi-*.zip, got nil")
		}
		if matched.Name != "yazi-x86_64-unknown-linux-gnu.zip" {
			t.Errorf("expected yazi-x86_64-unknown-linux-gnu.zip, got %q", matched.Name)
		}
	})

	t.Run("assetPattern with platform filtering", func(t *testing.T) {
		assets := []githubAsset{
			{Name: "nvim-linux-arm64.tar.gz"},
			{Name: "nvim-linux-x86_64.tar.gz"},
			{Name: "nvim-macos-arm64.tar.gz"},
		}

		matched := inst.matchAsset(assets, "*.tar.gz")
		if matched == nil {
			t.Fatalf("expected to match nvim asset with pattern *.tar.gz, got nil")
		}
		if matched.Name != "nvim-linux-x86_64.tar.gz" {
			t.Errorf("expected nvim-linux-x86_64.tar.gz, got %q", matched.Name)
		}
	})

	t.Run("ghCli integration for CheckUpdate and Install", func(t *testing.T) {
		runnerGh := exec.NewMockRunner()
		ghReleaseData := githubRelease{
			ID:      5678,
			TagName: "v2.0.0",
			Name:    "v2.0.0 Release",
			Assets: []githubAsset{
				{
					ID:   444,
					Name: "mytool-linux-amd64",
				},
			},
		}
		mockRelJSON, _ := json.Marshal(ghReleaseData)
		fsysGh := fs.NewMemFS()
		dlGh := downloader.NewDownloader(fsysGh, nil)

		runnerGh.RegisterFunc("gh", func(c *exec.MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "api" {
				_ = fsysGh.WriteFile("/test/ghbin/mytool", []byte("bin"), 0755)
			}
			return nil
		})
		runnerGh.Register("gh", mockRelJSON, nil)

		instGh := NewGitHubInstaller(runnerGh, fsysGh, dlGh, &SystemContext{OS: "linux", Arch: "amd64"})
		instGh.BinDir = "/test/ghbin"

		ghTool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"repo":  "myowner/mytool",
				"ghCli": true,
			},
		}

		chk, err := instGh.CheckUpdate(context.Background(), ghTool)
		if err != nil || chk == nil || chk.LatestVersion != "v2.0.0" {
			t.Fatalf("ghCli CheckUpdate failed: chk=%v, err=%v", chk, err)
		}

		res, err := instGh.Install(context.Background(), ghTool)
		if err != nil || res == nil {
			t.Fatalf("ghCli Install failed: err=%v", err)
		}
	})

	t.Run("assetPattern fallback when no platform keywords exist", func(t *testing.T) {
		assets := []githubAsset{
			{Name: "tool-universal.tar.gz"},
		}

		matched := inst.matchAsset(assets, "*.tar.gz")
		if matched == nil {
			t.Fatalf("expected fallback match for universal asset, got nil")
		}
		if matched.Name != "tool-universal.tar.gz" {
			t.Errorf("expected tool-universal.tar.gz, got %q", matched.Name)
		}
	})

	t.Run("Failures on mismatched OS/Arch", func(t *testing.T) {
		assets := []githubAsset{
			{Name: "mytool-darwin-amd64"},
			{Name: "mytool-linux-arm64"},
			{Name: "mytool-windows-amd64.exe"},
		}

		// None should match since the OS is linux and Arch is amd64, and we eliminated blind fallback
		matched := inst.matchAsset(assets, "")
		if matched != nil {
			t.Errorf("expected no match, but matched %q", matched.Name)
		}
	})
}

func TestGitHubInstaller_ProgressLogging(t *testing.T) {
	mockRelease := githubRelease{
		ID:      1234,
		TagName: "v1.0.0",
		Name:    "v1.0.0 Release",
		Assets: []githubAsset{
			{
				ID:   101,
				Name: "tool-linux-amd64",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/owner/tool/releases/latest" {
			mockRelease.Assets[0].BrowserDownloadURL = "http://" + r.Host + "/download/tool"
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(mockRelease)
			return
		}
		if r.URL.Path == "/download/tool" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("tool-content"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Name: "test-github-log", Level: logger.LogLevelVerbose, Writer: &logBuf})

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewGitHubInstaller(runner, fsys, dl, &SystemContext{OS: "linux", Arch: "amd64"})
	inst.httpClient = server.Client()
	inst.BaseURL = server.URL
	inst.BinDir = "/test/bin"
	inst.SetLogger(log)

	tool := &config.ToolConfig{
		Name: "tool",
		InstallParams: map[string]interface{}{
			"repo": "owner/tool",
		},
	}

	_, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("unexpected error during install: %v", err)
	}

	logOutput := logBuf.String()
	if !strings.Contains(logOutput, "Fetching release info for owner/tool (latest)...") {
		t.Errorf("expected log to contain 'Fetching release info...', got:\n%s", logOutput)
	}
	if !strings.Contains(logOutput, "Downloading release asset tool-linux-amd64...") {
		t.Errorf("expected log to contain 'Downloading release asset...', got:\n%s", logOutput)
	}
}

func TestGitHubInstaller_GhCliAndToken(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	instGh := NewGitHubInstaller(runner, fsys, dl, sysCtx)
	instGh.BinDir = "/test/ghcli"

	// 1. GhCli success
	runner.RegisterFunc("gh", func(c *exec.MockCmd) error {
		if len(c.Args) > 0 && c.Args[0] == "api" {
			resJSON := `{
				"tag_name": "v1.1.0",
				"assets": [{"name": "cli-linux-amd64.tar.gz", "browser_download_url": "http://gh/dl"}]
			}`
			c.SetOutput([]byte(resJSON))
			return nil
		}
		if len(c.Args) > 0 && c.Args[0] == "release" && c.Args[1] == "download" {
			tarBytes, _ := createTarGzBytes(map[string]string{"cli": "cli-binary"})
			_ = fsys.MkdirAll("/test/ghcli", 0755)
			_ = fsys.WriteFile("/test/ghcli/cli-linux-amd64.tar.gz", tarBytes, 0644)
			return nil
		}
		return nil
	})

	toolGhCli := &config.ToolConfig{
		Name: "cli",
		InstallParams: map[string]interface{}{
			"repo":  "owner/ghcli-unique-repo",
			"ghCli": true,
		},
	}

	res, err := instGh.Install(context.Background(), toolGhCli)
	if err != nil {
		t.Fatalf("Install with useGhCli failed: %v", err)
	}
	if len(res.Binaries) == 0 {
		t.Errorf("expected promoted binaries from gh CLI install")
	}

	// 2. Token header verification
	instTok := NewGitHubInstaller(runner, fsys, dl, sysCtx)
	instTok.BinDir = "/test/ghtok"

	var recHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(githubRelease{
			TagName: "v1.0.0",
			Assets: []githubAsset{
				{Name: "tokentool-linux-amd64", BrowserDownloadURL: "http://" + r.Host + "/download"},
			},
		})
	}))
	defer server.Close()

	instTok.httpClient = server.Client()
	instTok.BaseURL = server.URL

	toolToken := &config.ToolConfig{
		Name: "tokentool",
		InstallParams: map[string]interface{}{
			"repo":  "owner/tokentool",
			"token": "secret-gh-token",
		},
	}

	_, err = instTok.Install(context.Background(), toolToken)
	if err != nil {
		t.Fatalf("Install with token failed: %v", err)
	}
	if recHeader != "token secret-gh-token" {
		t.Errorf("expected Authorization header 'token secret-gh-token', got %q", recHeader)
	}

	// 3. CheckUpdate with ghCli and 403 fallback
	currentVer := "v1.0.0"
	toolGh := &config.ToolConfig{
		Name:    "cli",
		Version: &currentVer,
		InstallParams: map[string]interface{}{
			"repo":  "owner/ghcli-chk-repo",
			"ghCli": true,
		},
	}

	chkRes, chkErr := instGh.CheckUpdate(context.Background(), toolGh)
	if chkErr != nil || !chkRes.HasUpdate || chkRes.LatestVersion != "v1.1.0" {
		t.Errorf("expected CheckUpdate with ghCli to find v1.1.0, got chkRes=%v, chkErr=%v", chkRes, chkErr)
	}

	server403 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server403.Close()

	instTok.httpClient = server403.Client()
	instTok.BaseURL = server403.URL

	tool403 := &config.ToolConfig{
		Name:    "tool403",
		Version: &currentVer,
		InstallParams: map[string]interface{}{
			"repo": "owner/tool403",
		},
	}

	res403, err403 := instTok.CheckUpdate(context.Background(), tool403)
	if err403 != nil || !res403.HasUpdate || res403.LatestVersion != "v1.1.0" {
		t.Errorf("expected CheckUpdate 403 fallback to find v1.1.0, got res=%v, err=%v", res403, err403)
	}
}
