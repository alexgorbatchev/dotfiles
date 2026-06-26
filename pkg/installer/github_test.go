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
