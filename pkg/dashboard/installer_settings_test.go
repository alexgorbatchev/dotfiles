package dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// settingsRecordingInstaller records the project settings it holds when it is asked
// for an update check.
type settingsRecordingInstaller struct {
	mockCheckUpdateInstaller
	mu            sync.Mutex
	github        installer.GitHubSettings
	cargo         installer.CargoSettings
	checkedGitHub []installer.GitHubSettings
	checkedCargo  []installer.CargoSettings
}

func (m *settingsRecordingInstaller) SetGitHubSettings(settings installer.GitHubSettings) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.github = settings
}

func (m *settingsRecordingInstaller) SetCargoSettings(settings installer.CargoSettings) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cargo = settings
}

func (m *settingsRecordingInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	m.mu.Lock()
	m.checkedGitHub = append(m.checkedGitHub, m.github)
	m.checkedCargo = append(m.checkedCargo, m.cargo)
	m.mu.Unlock()
	return m.mockCheckUpdateInstaller.CheckUpdate(ctx, tool)
}

// TestDashboard_CheckUpdateAppliesProjectSettings pins that the dashboard's update
// check reaches the installer configured by the project, as tool check and tool update
// do: the github and cargo sections are in place when CheckUpdate runs, so a cargo
// tool is checked against the configured crates.io host with the configured
// User-Agent and token.
func TestDashboard_CheckUpdateAppliesProjectSettings(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	sqlDB, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	inst := &settingsRecordingInstaller{mockCheckUpdateInstaller: mockCheckUpdateInstaller{name: "mock-settings-recording-inst", latestVersion: "2.0.0"}}
	instReg := installer.NewRegistry()
	if err := instReg.Register(inst); err != nil {
		t.Fatalf("registering mock installer: %v", err)
	}

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{ToolConfigsDir: t.TempDir(), GeneratedDir: "/gen"},
		Github: config.HostConfig{
			Host:  "https://ghe.example/api/v3",
			Token: "github-secret",
			Cache: config.CacheConfig{TTL: 7200000},
		},
		Cargo: config.CargoConfig{
			CratesIo:  config.CargoHostConfig{Host: "https://crates.mirror.example", Token: "crates-secret"},
			UserAgent: "my-bot",
		},
	}
	toolConfigs := []*config.ToolConfig{{Name: "mycrate", InstallationMethod: inst.name}}
	server := NewServer(log, "127.0.0.1", 0, registry.NewRegistry(sqlDB), testFS(), "", projCfg, toolConfigs, nil, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/mycrate/check-update", server.Port()), "application/json", nil)
	if err != nil {
		t.Fatalf("POST check-update: %v", err)
	}
	resp.Body.Close()

	inst.mu.Lock()
	defer inst.mu.Unlock()
	if inst.calls.Load() != 1 {
		t.Fatalf("CheckUpdate ran %d time(s), want 1", inst.calls.Load())
	}
	wantCargo := installer.NewCargoSettings(projCfg)
	if len(inst.checkedCargo) != 1 || inst.checkedCargo[0] != wantCargo {
		t.Errorf("cargo settings at check time = %+v, want %+v", inst.checkedCargo, wantCargo)
	}
	wantGitHub := installer.NewGitHubSettings(projCfg)
	if len(inst.checkedGitHub) != 1 || inst.checkedGitHub[0] != wantGitHub {
		t.Errorf("github settings at check time = %+v, want %+v", inst.checkedGitHub, wantGitHub)
	}
}

// TestDashboard_CheckUpdateUsesConfiguredGitHubCache pins that the dashboard's update
// checks for a github-release tool use the configured cache directory and TTL so that
// release metadata is cached on disk rather than running without a cache.
func TestDashboard_CheckUpdateUsesConfiguredGitHubCache(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	sqlDB, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	fsys := fs.NewMemFS()
	gh := installer.NewGitHubInstaller(exec.NewMockRunner(), fsys, nil, nil)
	instReg := installer.NewRegistry()
	if err := instReg.Register(gh); err != nil {
		t.Fatalf("registering mock installer: %v", err)
	}

	var apiCalls atomic.Int32
	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiCalls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"tag_name": "v1.2.0", "assets": [{"id": 1, "name": "mytool.tar.gz"}]}`)
	}))
	defer apiServer.Close()

	tempDir := "/test/project"
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			ToolConfigsDir: tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
		},
		Github: config.HostConfig{
			Host: apiServer.URL,
			Cache: config.CacheConfig{
				TTL: 1800000, // 30 minutes
			},
		},
	}
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "mytool",
			InstallationMethod: "github-release",
			InstallParams:      map[string]interface{}{"repo": "owner/mytool"},
		},
	}

	reg := registry.NewRegistry(sqlDB)
	recordInstallation(t, reg, "mytool", "1.0.0")

	server := NewServer(log, "127.0.0.1", 0, reg, fsys, "", projCfg, toolConfigs, nil, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	// 1. Verify installer received CacheDir and CacheTTL from NewGitHubSettings at server start
	wantCacheDir := filepath.Join(tempDir, ".generated", "cache", "github-api")
	if gh.CacheDir != wantCacheDir {
		t.Errorf("gh.CacheDir = %q, want %q", gh.CacheDir, wantCacheDir)
	}
	wantTTL := 30 * time.Minute
	if gh.CacheTTL != wantTTL {
		t.Errorf("gh.CacheTTL = %v, want %v", gh.CacheTTL, wantTTL)
	}

	// 2. Perform check-update request through dashboard HTTP API
	resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/mytool/check-update", server.Port()), "application/json", nil)
	if err != nil {
		t.Fatalf("POST check-update: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST check-update status = %d, want 200", resp.StatusCode)
	}

	if apiCalls.Load() != 1 {
		t.Fatalf("expected 1 API call, got %d", apiCalls.Load())
	}

	// 3. Verify on-disk cache entry was written under gh.CacheDir
	cacheEntries, err := fsys.ReadDir(wantCacheDir)
	if err != nil {
		t.Fatalf("reading cache directory %q: %v", wantCacheDir, err)
	}
	if len(cacheEntries) == 0 {
		t.Fatalf("expected cached release metadata file in %q, but directory is empty", wantCacheDir)
	}

	// 4. Perform second check-update request, confirming it is served from cache without another API call
	resp2, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/mytool/check-update", server.Port()), "application/json", nil)
	if err != nil {
		t.Fatalf("POST check-update (second): %v", err)
	}
	defer resp2.Body.Close()

	if apiCalls.Load() != 1 {
		t.Fatalf("expected cached check to not make another API call, but API calls = %d", apiCalls.Load())
	}
}

func TestConfigureInstallerForUpdate(t *testing.T) {
	destDir := "/opt/bin/tool/current"
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			GeneratedDir: "/gen",
		},
		Github: config.HostConfig{
			Host:  "https://github.example.com",
			Token: "gh-token",
			Cache: config.CacheConfig{
				TTL: 5000,
			},
		},
	}

	t.Run("nil projectConfig is a no-op", func(t *testing.T) {
		gh := &installer.GitHubInstaller{}
		configureInstallerForUpdate(gh, destDir, nil)
		if gh.BinDir != "" {
			t.Errorf("expected empty BinDir, got %q", gh.BinDir)
		}
	})

	t.Run("github installer receives settings, dir, cache dir, and ttl", func(t *testing.T) {
		gh := &installer.GitHubInstaller{}
		configureInstallerForUpdate(gh, destDir, projCfg)
		if gh.BinDir != destDir {
			t.Errorf("BinDir = %q, want %q", gh.BinDir, destDir)
		}
		wantCache := filepath.Join(projCfg.Paths.GeneratedDir, "cache", "github-api")
		if gh.CacheDir != wantCache {
			t.Errorf("CacheDir = %q, want %q", gh.CacheDir, wantCache)
		}
		wantTTL := 5000 * time.Millisecond
		if gh.CacheTTL != wantTTL {
			t.Errorf("CacheTTL = %v, want %v", gh.CacheTTL, wantTTL)
		}
	})

	t.Run("gitea installer receives dir and cache dir", func(t *testing.T) {
		gitea := &installer.GiteaInstaller{}
		configureInstallerForUpdate(gitea, destDir, projCfg)
		if gitea.BinDir != destDir {
			t.Errorf("BinDir = %q, want %q", gitea.BinDir, destDir)
		}
		wantCache := filepath.Join(projCfg.Paths.GeneratedDir, "cache", "gitea-api")
		if gitea.CacheDir != wantCache {
			t.Errorf("CacheDir = %q, want %q", gitea.CacheDir, wantCache)
		}
	})

	binDirOnly := []struct {
		name   string
		inst   installer.Installer
		binDir func() string
	}{
		{"cargo", &installer.CargoInstaller{}, func() string { return (&installer.CargoInstaller{}).BinDir }},
		{"curl-binary", &installer.CurlBinaryInstaller{}, func() string { return (&installer.CurlBinaryInstaller{}).BinDir }},
		{"curl-script", &installer.CurlScriptInstaller{}, func() string { return (&installer.CurlScriptInstaller{}).BinDir }},
		{"curl-tar", &installer.CurlTarInstaller{}, func() string { return (&installer.CurlTarInstaller{}).BinDir }},
		{"dmg", &installer.DmgInstaller{}, func() string { return (&installer.DmgInstaller{}).BinDir }},
		{"manual", &installer.ManualInstaller{}, func() string { return (&installer.ManualInstaller{}).BinDir }},
		{"zsh-plugin", &installer.ZshPluginInstaller{}, func() string { return (&installer.ZshPluginInstaller{}).BinDir }},
		{"pkg", &installer.PkgInstaller{}, func() string { return (&installer.PkgInstaller{}).BinDir }},
		{"uv", installer.NewUvInstaller(nil, nil, nil), func() string { return "" }},
	}
	cargo := &installer.CargoInstaller{}
	curlBinary := &installer.CurlBinaryInstaller{}
	curlScript := &installer.CurlScriptInstaller{}
	curlTar := &installer.CurlTarInstaller{}
	dmg := &installer.DmgInstaller{}
	manual := &installer.ManualInstaller{}
	zshPlugin := &installer.ZshPluginInstaller{}
	pkg := &installer.PkgInstaller{}
	uv := installer.NewUvInstaller(nil, nil, nil)

	binDirOnly = []struct {
		name   string
		inst   installer.Installer
		binDir func() string
	}{
		{"cargo", cargo, func() string { return cargo.BinDir }},
		{"curl-binary", curlBinary, func() string { return curlBinary.BinDir }},
		{"curl-script", curlScript, func() string { return curlScript.BinDir }},
		{"curl-tar", curlTar, func() string { return curlTar.BinDir }},
		{"dmg", dmg, func() string { return dmg.BinDir }},
		{"manual", manual, func() string { return manual.BinDir }},
		{"zsh-plugin", zshPlugin, func() string { return zshPlugin.BinDir }},
		{"pkg", pkg, func() string { return pkg.BinDir }},
		{"uv", uv, func() string { return uv.BinDir }},
	}

	for _, tt := range binDirOnly {
		t.Run(tt.name+" installer receives the destination dir", func(t *testing.T) {
			configureInstallerForUpdate(tt.inst, destDir, projCfg)
			if got := tt.binDir(); got != destDir {
				t.Errorf("BinDir = %q, want %q", got, destDir)
			}
		})
	}
}

func TestDashboard_NilInstallersRegistry(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	sqlDB, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	tool := &config.ToolConfig{Name: "mytool", InstallationMethod: "github-release"}
	recordInstallation(t, reg, "mytool", "1.0.0")

	// Server with nil installers registry
	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", &config.ProjectConfig{}, []*config.ToolConfig{tool}, nil, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	t.Run("check-update reports error when installers is nil", func(t *testing.T) {
		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/mytool/check-update", server.Port()), "application/json", nil)
		if err != nil {
			t.Fatalf("POST check-update: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		if body["success"] != false {
			t.Errorf("success = %v, want false", body["success"])
		}
		if body["error"] != "Installers not initialized" {
			t.Errorf("error = %v, want 'Installers not initialized'", body["error"])
		}
	})

	t.Run("update reports error when installers is nil", func(t *testing.T) {
		// Server needs an orchestrator to get past the orchestrator nil check
		orch := orchestrator.NewOrchestrator(log, fs.NewMemFS(), nil, reg, nil)
		serverWithOrch := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", &config.ProjectConfig{}, []*config.ToolConfig{tool}, orch, nil)
		if err := serverWithOrch.Start(); err != nil {
			t.Fatalf("starting server: %v", err)
		}
		defer serverWithOrch.Stop()

		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/mytool/update", serverWithOrch.Port()), "application/json", nil)
		if err != nil {
			t.Fatalf("POST update: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		if body["success"] != false {
			t.Errorf("success = %v, want false", body["success"])
		}
		if body["error"] != "Update failed: installers not initialized" {
			t.Errorf("error = %v, want 'Update failed: installers not initialized'", body["error"])
		}
	})
}
