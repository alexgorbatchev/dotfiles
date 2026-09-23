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

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
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

		if r.URL.Path == "/repos/myowner/mytool/releases/tags/v1.5.0" {
			tagged := mockRelease
			tagged.TagName = "v1.5.0"
			tagged.Assets = []githubAsset{{ID: 445, Name: "mytool-linux-amd64", BrowserDownloadURL: "http://" + r.Host + "/download/mytool"}}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(tagged)
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

	// The version install parameter is the pin config.ToolConfig.RequestedVersion names
	// for github-release, and the one update refuses to move, so it must be what the
	// installation fetches, whatever .version() says.
	t.Run("the version install parameter selects the release by tag over .version()", func(t *testing.T) {
		dotVersion := "v2.0.0"
		tool := &config.ToolConfig{
			Name:               "mytool",
			InstallationMethod: "github-release",
			Version:            &dotVersion,
			InstallParams: map[string]interface{}{
				"repo":    "myowner/mytool",
				"version": "v1.5.0",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Version != "v1.5.0" {
			t.Errorf("Version = %q, want the v1.5.0 the install parameter names", res.Version)
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
		if err != nil || res.Outdated != nil || res.LatestVersion != "" {
			t.Errorf("unexpected: %v, %v", res, err)
		}
	})

	t.Run("CheckUpdate disk caching and force bypass", func(t *testing.T) {
		callCount := 0
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			callCount++
			rel := githubRelease{
				TagName: "v2.0.0",
				Assets: []githubAsset{
					{Name: "cachetool-linux-amd64"},
				},
			}
			_ = json.NewEncoder(w).Encode(rel)
		}))
		defer srv.Close()

		cMem := fs.NewMemFS()
		cDl := downloader.NewDownloader(cMem, nil)
		cInst := NewGitHubInstaller(exec.NewMockRunner(), cMem, cDl, &SystemContext{OS: "linux", Arch: "amd64"})
		cInst.BaseURL = srv.URL
		cInst.CacheDir = "/cache/github-api"
		cInst.CacheTTL = time.Hour

		tool := &config.ToolConfig{
			Name: "cachetool",
			InstallParams: map[string]interface{}{
				"repo": "owner/cachetool",
			},
		}

		ctx := context.Background()

		// 1. First call -> Cache Miss (live fetch)
		res1, err := cInst.CheckUpdate(ctx, tool)
		if err != nil {
			t.Fatalf("first CheckUpdate failed: %v", err)
		}
		if res1.Cached {
			t.Errorf("expected first call to be uncached, got Cached=true")
		}
		if res1.LatestVersion != "v2.0.0" {
			t.Errorf("expected LatestVersion=v2.0.0, got %s", res1.LatestVersion)
		}
		if callCount != 1 {
			t.Errorf("expected 1 HTTP call, got %d", callCount)
		}

		// 2. Second call -> Cache Hit (no new HTTP call)
		res2, err := cInst.CheckUpdate(ctx, tool)
		if err != nil {
			t.Fatalf("second CheckUpdate failed: %v", err)
		}
		if !res2.Cached {
			t.Errorf("expected second call to be cached, got Cached=false")
		}
		if callCount != 1 {
			t.Errorf("expected still 1 HTTP call after cache hit, got %d", callCount)
		}

		// 3. Third call with force / overwrite -> Cache Bypass (triggers new HTTP call)
		forceCtx := config.WithOverwrite(ctx, true)
		res3, err := cInst.CheckUpdate(forceCtx, tool)
		if err != nil {
			t.Fatalf("forced CheckUpdate failed: %v", err)
		}
		if res3.Cached {
			t.Errorf("expected forced call to be uncached, got Cached=true")
		}
		if callCount != 2 {
			t.Errorf("expected 2 HTTP calls after forced update check, got %d", callCount)
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

	t.Run("assetPattern with negative lookahead regex for bun", func(t *testing.T) {
		instDarwinArm64 := &GitHubInstaller{
			sysCtx: &SystemContext{
				OS:   "darwin",
				Arch: "arm64",
			},
		}
		bunAssets := []githubAsset{
			{Name: "bun-darwin-aarch64-profile.zip"},
			{Name: "bun-darwin-aarch64.zip"},
			{Name: "bun-darwin-x64-profile.zip"},
			{Name: "bun-darwin-x64.zip"},
		}

		matched := instDarwinArm64.matchAsset(bunAssets, "/^(?!.*-profile).*\\.zip$/")
		if matched == nil {
			t.Fatalf("expected to match non-profile bun asset, got nil")
		}
		if matched.Name != "bun-darwin-aarch64.zip" {
			t.Errorf("expected bun-darwin-aarch64.zip, got %q", matched.Name)
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

		// Emulate gh: `gh api ...` prints the release JSON, `gh release download <tag>
		// --dir <dir> --pattern <asset>` writes the asset under its own name into <dir>.
		runnerGh.RegisterFunc("gh", func(c *exec.MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "api" {
				c.SetOutput(mockRelJSON)
				return nil
			}
			var dir, pattern string
			for i := 0; i+1 < len(c.Args); i++ {
				switch c.Args[i] {
				case "--dir":
					dir = c.Args[i+1]
				case "--pattern":
					pattern = c.Args[i+1]
				}
			}
			if dir == "" || pattern == "" {
				t.Fatalf("unexpected gh invocation %v", c.Args)
			}
			return fsysGh.WriteFile(filepath.Join(dir, pattern), []byte("bin"), 0644)
		})

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

// TestGitHubInstaller_MatchAssetCargoDist reproduces issue #28: cargo-dist publishes a
// raw self-updater beside every tarball and the updater must never win by list order.
func TestGitHubInstaller_MatchAssetCargoDist(t *testing.T) {
	assets := make([]githubAsset, 0, len(mdTuiAssets))
	for _, name := range mdTuiAssets {
		assets = append(assets, githubAsset{Name: name})
	}

	tests := []struct {
		name string
		os   string
		arch string
		want string
	}{
		{"darwin arm64", "darwin", "arm64", "md-tui-aarch64-apple-darwin.tar.xz"},
		{"darwin amd64", "darwin", "amd64", "md-tui-x86_64-apple-darwin.tar.xz"},
		{"linux arm64", "linux", "arm64", "md-tui-aarch64-unknown-linux-gnu.tar.xz"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inst := &GitHubInstaller{sysCtx: &SystemContext{OS: tt.os, Arch: tt.arch}}
			matched := inst.matchAsset(assets, "")
			if matched == nil {
				t.Fatalf("expected an asset for %s/%s, got nil", tt.os, tt.arch)
			}
			if matched.Name != tt.want {
				t.Errorf("matchAsset = %q, want %q", matched.Name, tt.want)
			}
		})
	}
}

// TestGitHubInstaller_InstallExtractsArchiveFormats checks that every archive format the
// extractor dispatches is extracted by the release installer rather than copied to disk
// as the binary. The archives nest the binary one level deep, as cargo-dist does.
func TestGitHubInstaller_InstallExtractsArchiveFormats(t *testing.T) {
	const binary = "mytool-linux-amd64/mytool"
	const payload = "binary-payload"

	tests := []struct {
		asset   string
		archive func(t *testing.T) []byte
		viaXz   bool
	}{
		{asset: "mytool-linux-amd64.tar.gz", archive: func(t *testing.T) []byte {
			b, err := createTarGzBytes(map[string]string{binary: payload})
			if err != nil {
				t.Fatal(err)
			}
			return b
		}},
		{asset: "mytool-linux-amd64.tgz", archive: func(t *testing.T) []byte {
			b, err := createTarGzBytes(map[string]string{binary: payload})
			if err != nil {
				t.Fatal(err)
			}
			return b
		}},
		{asset: "mytool-linux-amd64.tar", archive: func(t *testing.T) []byte {
			return createTarBytes(t, map[string]string{binary: payload})
		}},
		{asset: "mytool-linux-amd64.zip", archive: func(t *testing.T) []byte {
			return createZipBytes(t, map[string]string{binary: payload})
		}},
		{asset: "mytool-linux-amd64.tar.xz", viaXz: true, archive: func(t *testing.T) []byte {
			return createTarBytes(t, map[string]string{binary: payload})
		}},
		{asset: "mytool-linux-amd64.txz", viaXz: true, archive: func(t *testing.T) []byte {
			return createTarBytes(t, map[string]string{binary: payload})
		}},
	}

	for _, tt := range tests {
		t.Run(tt.asset, func(t *testing.T) {
			archiveBytes := tt.archive(t)
			downloadBytes := archiveBytes
			runner := exec.NewMockRunner()
			if tt.viaXz {
				// The extractor pipes the download through xz; what reaches the tar reader is
				// whatever the mocked xz emits, so the download itself is opaque.
				downloadBytes = []byte("opaque xz stream")
				mockXz(runner, archiveBytes)
			}
			server := newReleaseServer(t, "v1.0.0", []string{tt.asset}, downloadBytes)

			var logBuf bytes.Buffer
			fsys := fs.NewMemFS()
			inst := NewGitHubInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.httpClient = server.Client()
			inst.BaseURL = server.URL
			inst.BinDir = "/test/bin"
			inst.SetLogger(logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf}))

			tool := &config.ToolConfig{Name: "mytool", InstallParams: map[string]interface{}{"repo": "owner/tool"}}
			res, err := inst.Install(context.Background(), tool)
			if err != nil {
				t.Fatalf("Install(%s) failed: %v", tt.asset, err)
			}
			if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
				t.Errorf("Binaries = %v, want [mytool]", res.Binaries)
			}

			got, err := fsys.ReadFile("/test/bin/mytool")
			if err != nil {
				t.Fatalf("promoted binary missing: %v", err)
			}
			if string(got) != payload {
				t.Errorf("installed file holds %q, want the extracted binary %q", string(got), payload)
			}
			if exists, _ := fsys.Exists(filepath.Join("/test/bin", tt.asset)); exists {
				t.Errorf("downloaded archive %s was left behind", tt.asset)
			}
			if !strings.Contains(logBuf.String(), "Extracting "+tt.asset+"...") {
				t.Errorf("expected an 'Extracting %s...' log line, got:\n%s", tt.asset, logBuf.String())
			}
		})
	}
}

// TestGitHubInstaller_InstallCargoDistTarXz is the end-to-end reproduction from issue #28
// with the minimal md-tui configuration: no assetPattern, binary named differently from
// the tool, .tar.xz-only unix assets.
func TestGitHubInstaller_InstallCargoDistTarXz(t *testing.T) {
	runner := exec.NewMockRunner()
	mockXz(runner, createTarBytes(t, map[string]string{"md-tui-aarch64-apple-darwin/mdt": "mach-o bytes"}))
	server := newReleaseServer(t, "v0.10.4", mdTuiAssets, []byte("opaque xz stream"))

	fsys := fs.NewMemFS()
	inst := NewGitHubInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "darwin", Arch: "arm64"})
	inst.httpClient = server.Client()
	inst.BaseURL = server.URL
	inst.BinDir = "/test/bin"

	tool := &config.ToolConfig{
		Name:          "md-tui",
		Binaries:      testutil.DeclaredBinaries("mdt"),
		InstallParams: map[string]interface{}{"repo": "owner/tool"},
	}
	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if downloads := server.downloads(); len(downloads) != 1 || downloads[0] != "md-tui-aarch64-apple-darwin.tar.xz" {
		t.Errorf("downloaded %v, want only md-tui-aarch64-apple-darwin.tar.xz", downloads)
	}
	if res.Version != "v0.10.4" || len(res.Binaries) != 1 || res.Binaries[0] != "mdt" {
		t.Errorf("result = %+v, want version v0.10.4 and binaries [mdt]", res)
	}
	if got, err := fsys.ReadFile("/test/bin/mdt"); err != nil || string(got) != "mach-o bytes" {
		t.Errorf("mdt = %q, %v; want the extracted binary", string(got), err)
	}
	if exists, _ := fsys.Exists("/test/bin/md-tui"); exists {
		t.Errorf("the archive must not be written to disk as a binary named after the tool")
	}
}

// TestGitHubInstaller_InstallRawBinaryAssets keeps the raw-binary path for assets that
// carry no archive extension, including a cargo-dist self-updater a tool asks for
// explicitly: refusing runnable files would be as wrong as chmod-ing tarballs.
func TestGitHubInstaller_InstallRawBinaryAssets(t *testing.T) {
	tests := []struct {
		name    string
		asset   string
		pattern string
	}{
		{"extensionless", "mytool-linux-amd64", ""},
		{"versioned extensionless", "mytool-1.2.3-linux-amd64", ""},
		{"self-updater selected by pattern", "mytool-linux-amd64-update", "-update$"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newReleaseServer(t, "v1.0.0", []string{tt.asset}, []byte("raw-binary"))
			fsys := fs.NewMemFS()
			inst := NewGitHubInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.httpClient = server.Client()
			inst.BaseURL = server.URL
			inst.BinDir = "/test/bin"

			params := map[string]interface{}{"repo": "owner/tool"}
			if tt.pattern != "" {
				params["assetPattern"] = tt.pattern
			}
			res, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mytool", InstallParams: params})
			if err != nil {
				t.Fatalf("Install(%s) failed: %v", tt.asset, err)
			}
			if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
				t.Errorf("Binaries = %v, want [mytool]", res.Binaries)
			}
			if got, err := fsys.ReadFile("/test/bin/mytool"); err != nil || string(got) != "raw-binary" {
				t.Errorf("mytool = %q, %v; want the downloaded binary", string(got), err)
			}
			info, err := fsys.Stat("/test/bin/mytool")
			if err != nil || info.Mode()&0111 == 0 {
				t.Errorf("mytool mode = %v, %v; want executable", info, err)
			}
			if exists, _ := fsys.Exists(filepath.Join("/test/bin", tt.asset)); exists && tt.asset != "mytool" {
				t.Errorf("download %s was left beside the renamed binary", tt.asset)
			}
		})
	}
}

// TestGitHubInstaller_InstallArchiveFailures covers the extraction path's own failures: a
// corrupt archive and an archive that does not contain the declared binary both fail the
// install and leave no download behind.
func TestGitHubInstaller_InstallArchiveFailures(t *testing.T) {
	tests := []struct {
		name    string
		payload func(t *testing.T) []byte
		wantErr string
	}{
		{"corrupt archive", func(*testing.T) []byte { return []byte("not gzip") }, "extracting asset archive"},
		{"binary missing from archive", func(t *testing.T) []byte {
			b, err := createTarGzBytes(map[string]string{"mytool-linux-amd64/README": "docs only"})
			if err != nil {
				t.Fatal(err)
			}
			return b
		}, `binary "mytool" not found`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			const asset = "mytool-linux-amd64.tar.gz"
			server := newReleaseServer(t, "v1.0.0", []string{asset}, tt.payload(t))
			fsys := fs.NewMemFS()
			inst := NewGitHubInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.httpClient = server.Client()
			inst.BaseURL = server.URL
			inst.BinDir = "/test/bin"

			_, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mytool", InstallParams: map[string]interface{}{"repo": "owner/tool"}})
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("Install error = %v, want one containing %q", err, tt.wantErr)
			}
			if exists, _ := fsys.Exists("/test/bin/mytool"); exists {
				t.Error("a binary was installed despite the failure")
			}
			if exists, _ := fsys.Exists(filepath.Join("/test/bin", asset)); exists {
				t.Error("the downloaded archive was left behind")
			}
		})
	}
}

// TestGitHubInstaller_InstallRejectsUnusableAssets checks that an asset which is neither
// an extractable archive nor a raw executable fails the install instead of being made
// executable and reported as installed.
func TestGitHubInstaller_InstallRejectsUnusableAssets(t *testing.T) {
	tests := []struct {
		name    string
		asset   string
		pattern string
	}{
		{"rar archive", "mytool-linux-amd64.rar", ""},
		{"7z archive", "mytool-linux-amd64.7z", ""},
		{"bare xz stream", "mytool-linux-amd64.xz", ""},
		{"zstd tarball selected by pattern", "mytool-linux-amd64.tar.zst", `\.zst$`},
		{"debian package selected by pattern", "mytool-linux-amd64.deb", `\.deb$`},
		{"checksum selected by pattern", "mytool-linux-amd64.sha256", `\.sha256$`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newReleaseServer(t, "v1.0.0", []string{tt.asset}, []byte("not a program"))
			fsys := fs.NewMemFS()
			inst := NewGitHubInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.httpClient = server.Client()
			inst.BaseURL = server.URL
			inst.BinDir = "/test/bin"

			params := map[string]interface{}{"repo": "owner/tool"}
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
			if exists, _ := fsys.Exists(filepath.Join("/test/bin", tt.asset)); exists {
				t.Errorf("rejected download %s was left behind", tt.asset)
			}
		})
	}
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
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})

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
	if chkErr != nil || chkRes.Outdated != nil || chkRes.LatestVersion != "v1.1.0" {
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
	if err403 != nil || res403.Outdated != nil || res403.LatestVersion != "v1.1.0" {
		t.Errorf("expected CheckUpdate 403 fallback to find v1.1.0, got res=%v, err=%v", res403, err403)
	}
}

// TestGitHubSettingsReachTheAPIRequest proves the project configuration's github
// section governs the API requests the installer makes: github.token authenticates a
// tool that names no token of its own, and github.userAgent replaces the built-in
// User-Agent. Without the wiring both fall back to the built-in values and setting
// them changes nothing.
func TestGitHubSettingsReachTheAPIRequest(t *testing.T) {
	tests := []struct {
		name          string
		settings      GitHubSettings
		params        map[string]interface{}
		wantAuth      string
		wantUserAgent string
	}{
		{
			name:          "section left out",
			params:        map[string]interface{}{"repo": "owner/tool"},
			wantAuth:      "",
			wantUserAgent: githubUserAgent,
		},
		{
			name:          "github.token and github.userAgent apply",
			settings:      GitHubSettings{Token: "project-token", UserAgent: "acme-dotfiles/2.0", CacheEnabled: true},
			params:        map[string]interface{}{"repo": "owner/tool"},
			wantAuth:      "token project-token",
			wantUserAgent: "acme-dotfiles/2.0",
		},
		{
			name:          "a tool's own token still wins",
			settings:      GitHubSettings{Token: "project-token", UserAgent: "acme-dotfiles/2.0", CacheEnabled: true},
			params:        map[string]interface{}{"repo": "owner/tool", "token": "tool-token"},
			wantAuth:      "token tool-token",
			wantUserAgent: "acme-dotfiles/2.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotAuth, gotUserAgent string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth = r.Header.Get("Authorization")
				gotUserAgent = r.Header.Get("User-Agent")
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(githubRelease{TagName: "v1.0.0"})
			}))
			defer server.Close()

			// GITHUB_TOKEN must not stand in for the setting under test.
			t.Setenv("GITHUB_TOKEN", "")
			t.Setenv("GH_TOKEN", "")

			inst := NewGitHubInstaller(exec.NewMockRunner(), fs.NewMemFS(), downloader.NewDownloader(fs.NewMemFS(), nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.SetGitHubSettings(tt.settings)
			inst.httpClient = server.Client()
			inst.BaseURL = server.URL

			if _, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "tool", InstallParams: tt.params}); err != nil {
				t.Fatalf("CheckUpdate failed: %v", err)
			}
			if gotAuth != tt.wantAuth {
				t.Errorf("Authorization = %q, want %q", gotAuth, tt.wantAuth)
			}
			if gotUserAgent != tt.wantUserAgent {
				t.Errorf("User-Agent = %q, want %q", gotUserAgent, tt.wantUserAgent)
			}
		})
	}
}

// TestGitHubCacheEnabledGovernsReleaseMetadata proves github.cache.enabled decides
// whether a release description fetched once is reused.
func TestGitHubCacheEnabledGovernsReleaseMetadata(t *testing.T) {
	tests := []struct {
		name         string
		cacheEnabled bool
		wantRequests int
	}{
		{name: "cache on reuses the release", cacheEnabled: true, wantRequests: 1},
		{name: "cache off refetches it", cacheEnabled: false, wantRequests: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var requests int
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.Header().Set("Content-Type", "application/json")
				// Only a release that carries assets is worth caching, so the
				// subject here needs one.
				_ = json.NewEncoder(w).Encode(githubRelease{
					TagName: "v1.0.0",
					Assets:  []githubAsset{{Name: "tool-linux-amd64", BrowserDownloadURL: "http://" + r.Host + "/download"}},
				})
			}))
			defer server.Close()

			memFS := fs.NewMemFS()
			inst := NewGitHubInstaller(exec.NewMockRunner(), memFS, downloader.NewDownloader(memFS, nil), &SystemContext{OS: "linux", Arch: "amd64"})
			inst.SetGitHubSettings(GitHubSettings{CacheEnabled: tt.cacheEnabled})
			inst.httpClient = server.Client()
			inst.BaseURL = server.URL

			tool := &config.ToolConfig{Name: "tool", InstallParams: map[string]interface{}{"repo": "owner/tool"}}
			for range 2 {
				if _, err := inst.CheckUpdate(context.Background(), tool); err != nil {
					t.Fatalf("CheckUpdate failed: %v", err)
				}
			}
			if requests != tt.wantRequests {
				t.Errorf("API was called %d times, want %d", requests, tt.wantRequests)
			}
		})
	}
}
