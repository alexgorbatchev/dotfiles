package dashboard

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/usagelog"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

func TestToolInstallRefreshesShellConfiguration(t *testing.T) {
	for _, failGeneration := range []bool{false, true} {
		t.Run(fmt.Sprintf("shell generation failure=%t", failGeneration), func(t *testing.T) {
			ctx := context.Background()
			database, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			reg := registry.NewRegistry(database)
			mem := newMemFS()
			log := logger.New(logger.Config{Writer: io.Discard})
			installers := installer.NewRegistry()
			orch := orchestrator.NewOrchestrator(log, mem, exec.NewMockRunner(), reg, installers)
			project := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: "/home/user", TargetDir: "/target", GeneratedDir: "/generated", BinariesDir: "/binaries",
			}}
			tools := []*config.ToolConfig{
				{Name: "workspace", ShellConfigs: &config.ShellConfigs{Zsh: &config.ShellTypeConfig{Functions: map[string]string{"workspace": "echo workspace-ready"}}}},
				{Name: "other", ShellConfigs: &config.ShellConfigs{Zsh: &config.ShellTypeConfig{Functions: map[string]string{"other": "echo other-ready"}}}},
			}
			if failGeneration {
				if err := mem.MkdirAll("/generated", 0755); err != nil {
					t.Fatal(err)
				}
				if err := mem.WriteFile("/generated/shell-scripts", []byte("not a directory"), 0644); err != nil {
					t.Fatal(err)
				}
			}
			server := NewServer(log, "127.0.0.1", 0, reg, mem, "", project, tools, orch, installers)
			recorder := httptest.NewRecorder()
			server.handleToolInstall(recorder, httptest.NewRequest(http.MethodPost, "/api/tools/workspace/install", nil), "workspace")
			var response struct {
				Success bool `json:"success"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if response.Success == failGeneration {
				t.Fatalf("unexpected install response: %s", recorder.Body.String())
			}
			if !failGeneration {
				script, err := mem.ReadFile("/generated/shell-scripts/main.zsh")
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(string(script), "echo workspace-ready") || !strings.Contains(string(script), "echo other-ready") {
					t.Fatalf("install dropped configured shell functions: %s", script)
				}
			}
		})
	}
}

func TestDashboardServer(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil, nil) // 0 lets system select an ephemeral port

	if err := server.Start(); err != nil {
		t.Fatalf("expected no error starting server, got %v", err)
	}

	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/", server.Port()))
	if err != nil {
		server.Stop()
		t.Fatalf("failed to fetch index: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		server.Stop()
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		server.Stop()
		t.Fatalf("failed to read response body: %v", err)
	}

	body := string(bodyBytes)
	if !strings.Contains(body, "<title>Dotfiles Dashboard</title>") {
		server.Stop()
		t.Errorf("expected body to contain dashboard title, got: %s", body)
	}

	// Test SPA fallback route
	spaResp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/tools/bat", server.Port()))
	if err != nil {
		server.Stop()
		t.Fatalf("failed to fetch SPA route: %v", err)
	}
	defer spaResp.Body.Close()

	if spaResp.StatusCode != http.StatusOK {
		server.Stop()
		t.Fatalf("expected SPA route status 200, got %d", spaResp.StatusCode)
	}

	spaBytes, _ := io.ReadAll(spaResp.Body)
	if !strings.Contains(string(spaBytes), "<title>Dotfiles Dashboard</title>") {
		server.Stop()
		t.Errorf("expected SPA fallback body to contain dashboard title, got: %s", string(spaBytes))
	}

	if err := server.Stop(); err != nil {
		t.Errorf("expected no error stopping server, got %v", err)
	}
}

type mockInstallerForTest struct {
	name string
}

func (m *mockInstallerForTest) Name() string {
	return m.name
}

func (m *mockInstallerForTest) SupportsSudo() bool {
	return false
}

func (m *mockInstallerForTest) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{
		Binaries: []string{tool.Name},
	}, nil
}

func (m *mockInstallerForTest) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	return nil
}

func (m *mockInstallerForTest) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

func TestDashboard_ToolsSchemaAndConcurrency(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	sqlDB, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	tempDir := t.TempDir()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    "/test/dotfiles",
			GeneratedDir:   "/test/generated",
			BinariesDir:    "/test/binaries",
			TargetDir:      "/test/target",
			ToolConfigsDir: tempDir,
		},
	}

	toolConfigs := []*config.ToolConfig{
		{
			Name:               "toolA",
			Version:            new(string),
			InstallationMethod: "github-release",
		},
		{
			Name:               "toolB",
			Version:            new(string),
			InstallationMethod: "github-release",
		},
	}
	*toolConfigs[0].Version = "1.0.0"
	*toolConfigs[1].Version = "2.0.0"

	memFS := newMemFS()
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()

	// Create a concurrency-safe mock installer
	var wg sync.WaitGroup
	wg.Add(2)

	type record struct {
		toolName string
		force    bool
	}
	var mu sync.Mutex
	records := []record{}

	mockInst := &mockInstallerWithCallback{
		name: "github-release",
		installCallback: func(ctx context.Context, tool *config.ToolConfig) {
			mu.Lock()
			records = append(records, record{
				toolName: tool.Name,
				force:    config.IsOverwriteEnabled(ctx),
			})
			mu.Unlock()
			wg.Done()
		},
	}
	_ = instReg.Register(mockInst)

	orch := orchestrator.NewOrchestrator(log, memFS, runner, reg, instReg)

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	// 1. Verify GET /api/tools returns correct nested schema
	t.Run("GET /api/tools Schema Shape", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools", server.Port()))
		if err != nil {
			t.Fatalf("failed to GET tools: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected status 200, got %d", resp.StatusCode)
		}

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode JSON: %v", err)
		}

		if body["success"] != true {
			t.Errorf("expected success: true, got: %v", body["success"])
		}

		dataList, ok := body["data"].([]any)
		if !ok {
			t.Fatalf("expected data to be an array, got %T", body["data"])
		}

		if len(dataList) != 2 {
			t.Errorf("expected 2 tools, got %d", len(dataList))
		}

		for _, item := range dataList {
			tool, ok := item.(map[string]any)
			if !ok {
				t.Fatalf("expected tool item to be a map, got %T", item)
			}

			// Validate nested schema fields of IToolDetail
			configMap, hasConfig := tool["config"].(map[string]any)
			if !hasConfig {
				t.Error("expected tool to have 'config' object")
			} else {
				if _, ok := configMap["name"].(string); !ok {
					t.Error("expected config to have 'name'")
				}
			}

			runtime, hasRuntime := tool["runtime"].(map[string]any)
			if !hasRuntime {
				t.Error("expected tool to have 'runtime' object")
			} else {
				status, ok := runtime["status"].(string)
				if !ok || (status != "installed" && status != "not-installed") {
					t.Errorf("expected runtime status to be installed or not-installed, got %v", runtime["status"])
				}
			}

			files, hasFiles := tool["files"].([]any)
			if !hasFiles || files == nil {
				t.Error("expected tool to have 'files' slice")
			}

			_, hasDiskSize := tool["binaryDiskSize"].(float64) // JSON numbers parse as float64
			if !hasDiskSize {
				t.Error("expected tool to have 'binaryDiskSize' number")
			}

			usage, hasUsage := tool["usage"].(map[string]any)
			if !hasUsage {
				t.Error("expected tool to have 'usage' object")
			} else {
				if _, ok := usage["totalCount"].(float64); !ok {
					t.Error("expected usage to have 'totalCount'")
				}
			}
		}
	})

	// 2. Trigger concurrent POST installation requests (one force, one normal)
	t.Run("Concurrent Requests Overwrite Isolation", func(t *testing.T) {
		// Start toolA install with force: true
		urlA := fmt.Sprintf("http://127.0.0.1:%d/api/tools/toolA/install", server.Port())
		respA, err := http.Post(urlA, "application/json", strings.NewReader(`{"force": true}`))
		if err != nil {
			t.Fatalf("failed to POST toolA install: %v", err)
		}
		respA.Body.Close()

		// Start toolB install with force: false
		urlB := fmt.Sprintf("http://127.0.0.1:%d/api/tools/toolB/install", server.Port())
		respB, err := http.Post(urlB, "application/json", strings.NewReader(`{"force": false}`))
		if err != nil {
			t.Fatalf("failed to POST toolB install: %v", err)
		}
		respB.Body.Close()

		// Wait for both background installs to finish
		wg.Wait()

		mu.Lock()
		defer mu.Unlock()

		if len(records) != 2 {
			t.Fatalf("expected 2 install records, got %d", len(records))
		}

		for _, rec := range records {
			if rec.toolName == "toolA" {
				if !rec.force {
					t.Error("expected toolA (force: true) to have overwrite enabled in context")
				}
			} else if rec.toolName == "toolB" {
				if rec.force {
					t.Error("expected toolB (force: false) to NOT have overwrite enabled in context")
				}
			}
		}
	})
}

type mockInstallerWithCallback struct {
	name            string
	installCallback func(ctx context.Context, tool *config.ToolConfig)
}

func (m *mockInstallerWithCallback) Name() string {
	return m.name
}

func (m *mockInstallerWithCallback) SupportsSudo() bool {
	return false
}

func (m *mockInstallerWithCallback) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	if m.installCallback != nil {
		m.installCallback(ctx, tool)
	}
	return &installer.InstallResult{
		Binaries: []string{tool.Name},
	}, nil
}

func (m *mockInstallerWithCallback) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	return nil
}

func (m *mockInstallerWithCallback) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

type mockCheckUpdateInstaller struct {
	name          string
	localVersion  string
	latestVersion string
	outdated      *bool
	err           error
	// detectedVersion is the version Install reports having installed, which the
	// installation records when the update asked for no particular version.
	detectedVersion string
	calls           atomic.Int32
	installs        atomic.Int32
}

func (m *mockCheckUpdateInstaller) Name() string       { return m.name }
func (m *mockCheckUpdateInstaller) SupportsSudo() bool { return false }
func (m *mockCheckUpdateInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	m.installs.Add(1)
	return &installer.InstallResult{Version: m.detectedVersion}, nil
}
func (m *mockCheckUpdateInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	return nil
}
func (m *mockCheckUpdateInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	m.calls.Add(1)
	if m.err != nil {
		return nil, m.err
	}
	return &installer.UpdateCheckResult{
		LocalVersion:  m.localVersion,
		LatestVersion: m.latestVersion,
		Outdated:      m.outdated,
	}, nil
}

type mockGitHubInstallerForUpdateRoute struct {
	*mockCheckUpdateInstaller
	realInst installer.Installer
}

func (m *mockGitHubInstallerForUpdateRoute) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return m.realInst.CheckUpdate(ctx, tool)
}

func (m *mockGitHubInstallerForUpdateRoute) SetGitHubSettings(settings installer.GitHubSettings) {
	installer.SetGitHubSettings(m.realInst, settings)
}

// recordInstallation records toolName as installed at version, as an installation would.
func recordInstallation(t *testing.T, reg *registry.Registry, toolName, version string) {
	t.Helper()
	ctx := context.Background()
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    toolName,
			Version:     version,
			InstallPath: filepath.Join("/test/binaries", toolName),
			InstalledAt: time.Now().UnixMilli(),
		})
	}); err != nil {
		t.Fatalf("recording the installation of %s: %v", toolName, err)
	}
}

// TestDashboard_CheckUpdateRoute_UpdateCheckSettings pins the two things a tool's
// .updateCheck() block does to the dashboard's answer: enabled:false keeps the
// installer out of the request entirely, and a constraint bounds which upstream
// release counts as an update.
func TestDashboard_CheckUpdateRoute_UpdateCheckSettings(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})

	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	mockInst := &mockCheckUpdateInstaller{
		name:          "mock-updatecheck-settings-inst",
		localVersion:  "1.2.3",
		latestVersion: "2.0.0",
	}
	instReg := installer.NewRegistry()
	if err := instReg.Register(mockInst); err != nil {
		t.Fatalf("registering mock installer: %v", err)
	}

	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{ToolConfigsDir: t.TempDir()}}
	disabled, caret, wide := false, "^1.2.3", ">=1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "checks-off",
			InstallationMethod: mockInst.name,
			UpdateCheck:        &config.ToolConfigUpdateCheck{Enabled: &disabled},
		},
		{
			Name:               "constrained-out",
			InstallationMethod: mockInst.name,
			UpdateCheck:        &config.ToolConfigUpdateCheck{Constraint: &caret},
		},
		{
			Name:               "constrained-in",
			InstallationMethod: mockInst.name,
			UpdateCheck:        &config.ToolConfigUpdateCheck{Constraint: &wide},
		},
	}

	reg := registry.NewRegistry(sqlDB)
	for _, tool := range toolConfigs {
		recordInstallation(t, reg, tool.Name, "1.2.3")
	}
	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	checkUpdate := func(t *testing.T, tool string) map[string]any {
		t.Helper()
		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/%s/check-update", server.Port(), tool)
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("POST check-update for %s: %v", tool, err)
		}
		defer resp.Body.Close()
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding check-update response for %s: %v", tool, err)
		}
		data, ok := body["data"].(map[string]any)
		if !ok {
			t.Fatalf("check-update for %s returned no data object: %v", tool, body)
		}
		return data
	}

	t.Run("enabled false answers without asking the installer", func(t *testing.T) {
		before := mockInst.calls.Load()
		data := checkUpdate(t, "checks-off")
		if data["status"] != "unsupported" {
			t.Errorf("status = %v, want unsupported for a tool with update checks disabled", data["status"])
		}
		if got := mockInst.calls.Load(); got != before {
			t.Errorf("the installer was asked %d time(s); a disabled update check must not reach it", got-before)
		}
	})

	t.Run("a constraint excludes an out-of-range release", func(t *testing.T) {
		data := checkUpdate(t, "constrained-out")
		if data["status"] != "up-to-date" {
			t.Errorf("status = %v, want up-to-date: 2.0.0 is outside ^1.2.3", data["status"])
		}
		if data["latestVersion"] != "2.0.0" {
			t.Errorf("latestVersion = %v, want the release to still be reported", data["latestVersion"])
		}
	})

	t.Run("a constraint that admits the release leaves the update alone", func(t *testing.T) {
		data := checkUpdate(t, "constrained-in")
		if data["status"] != "update-available" {
			t.Errorf("status = %v, want update-available: 2.0.0 satisfies >=1.0.0", data["status"])
		}
	})
}

// TestDashboard_UpdateRoute_RefusesPinnedTool is the regression test for the update
// endpoint installing the latest upstream release over a .version() pin. As in v1, a
// pinned tool is refused before its installer is asked anything, with a message naming
// the pin and how to enable updates; an unpinned tool on the same installer is still
// checked and installed, so the refusal is not the harness failing to install.
func TestDashboard_UpdateRoute_RefusesPinnedTool(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})

	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	mockInst := &mockCheckUpdateInstaller{name: "mock-update-pinned-inst", latestVersion: "v9.9.9"}
	instReg := installer.NewRegistry()
	if err := instReg.Register(mockInst); err != nil {
		t.Fatalf("registering mock installer with the orchestrator: %v", err)
	}
	// The `version` install parameter pins only for the methods whose installers read
	// it, so that pin is exercised on github-release: the route asks the real
	// github-release installer, pointed at githubAPI, and the orchestrator installs
	// through githubInst.
	realGH := installer.NewGitHubInstaller(exec.NewMockRunner(), newMemFS(), nil, nil)
	githubInst := &mockCheckUpdateInstaller{name: "github-release", latestVersion: "v9.9.9"}
	wrappedGH := &mockGitHubInstallerForUpdateRoute{
		mockCheckUpdateInstaller: githubInst,
		realInst:                 realGH,
	}
	if err := instReg.Register(wrappedGH); err != nil {
		t.Fatalf("registering mock github-release installer with the orchestrator: %v", err)
	}
	var githubRequests atomic.Int32
	var upstreamTag atomic.Value
	upstreamTag.Store("v9.9.9")
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		githubRequests.Add(1)
		if r.URL.Path == "/repos/acme/param-latest/releases/latest" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"tag_name": %q, "assets": []}`, upstreamTag.Load())
			return
		}
		http.NotFound(w, r)
	}))
	defer githubAPI.Close()
	orch := orchestrator.NewOrchestrator(log, newMemFS(), exec.NewMockRunner(), reg, instReg)

	tempDir := t.TempDir()
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
		Github: config.HostConfig{Host: githubAPI.URL, Cache: config.CacheConfig{Enabled: new(false)}},
	}
	pinned, latest := "v1.0.0", "latest"
	disabled := false
	toolConfigs := []*config.ToolConfig{
		{Name: "pinned", Version: &pinned, InstallationMethod: mockInst.name},
		{Name: "unpinned", Version: &latest, InstallationMethod: mockInst.name},
		{
			Name:               "param-pinned",
			Version:            &latest,
			InstallationMethod: githubInst.name,
			InstallParams:      map[string]any{"repo": "acme/param-pinned", "version": "v2.1.0"},
		},
		{
			Name:               "param-latest",
			Version:            &latest,
			InstallationMethod: githubInst.name,
			InstallParams:      map[string]any{"repo": "acme/param-latest", "version": "latest"},
		},
		{
			Name:               "disabled-check",
			Version:            &latest,
			InstallationMethod: mockInst.name,
			UpdateCheck:        &config.ToolConfigUpdateCheck{Enabled: &disabled},
		},
		// Pinned and never installed: the CLI reports such a tool as not installed.
		{Name: "pinned-uninstalled", Version: &pinned, InstallationMethod: mockInst.name},
	}
	// Only an installed tool is updated, and a pinned one is refused only once it is
	// installed, so the other tools start installed at an older release than upstream's.
	for _, tool := range toolConfigs[:5] {
		if err := orch.InstallTool(ctx, tool.WithRequestedVersion("v1.0.0"), projCfg); err != nil {
			t.Fatalf("installing %s: %v", tool.Name, err)
		}
	}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	update := func(t *testing.T, tool string) (int, map[string]any) {
		t.Helper()
		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/%s/update", server.Port(), tool)
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("POST update for %s: %v", tool, err)
		}
		defer resp.Body.Close()
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding update response for %s: %v", tool, err)
		}
		return resp.StatusCode, body
	}

	t.Run("a pinned tool that is not installed is refused as not installed, as the CLI refuses it", func(t *testing.T) {
		_, body := update(t, "pinned-uninstalled")
		want := `Tool "pinned-uninstalled" is not installed`
		if body["success"] != false || body["error"] != want {
			t.Errorf("response = %v, want success false with error %q", body, want)
		}
	})

	t.Run("a pinned tool is refused without asking or running the installer", func(t *testing.T) {
		checks, installs := mockInst.calls.Load(), mockInst.installs.Load()
		status, body := update(t, "pinned")
		if status != http.StatusOK {
			t.Errorf("status = %d, want %d, the status every refusal from this route carries", status, http.StatusOK)
		}
		if body["success"] != false {
			t.Errorf("success = %v, want false for a refused update", body["success"])
		}
		want := "Tool \"pinned\" is pinned to version `v1.0.0`. Set version to \"latest\" in the tool config to enable updates"
		if body["error"] != want {
			t.Errorf("error = %v, want %q", body["error"], want)
		}
		if got := mockInst.calls.Load() - checks; got != 0 {
			t.Errorf("the installer was asked for updates %d time(s); a pinned tool is refused before its check", got)
		}
		if got := mockInst.installs.Load() - installs; got != 0 {
			t.Errorf("the installer installed %d time(s); a pinned tool must not be installed", got)
		}
		if got := toolConfigs[0].Version; got == nil || *got != pinned {
			t.Errorf("the pinned tool configuration lost its version %s", pinned)
		}
	})

	t.Run("a tool pinned by its version install parameter is refused without asking upstream or installing", func(t *testing.T) {
		requests, installs := githubRequests.Load(), githubInst.installs.Load()
		status, body := update(t, "param-pinned")
		if status != http.StatusOK {
			t.Errorf("status = %d, want %d, the status every refusal from this route carries", status, http.StatusOK)
		}
		if body["success"] != false {
			t.Errorf("success = %v, want false for a refused update", body["success"])
		}
		want := "Tool \"param-pinned\" is pinned to version `v2.1.0` by its \"version\" install parameter. Set \"version\" to \"latest\" in the tool config to enable updates"
		if body["error"] != want {
			t.Errorf("error = %v, want %q", body["error"], want)
		}
		if got := githubRequests.Load() - requests; got != 0 {
			t.Errorf("GitHub was asked %d time(s); a pinned tool is refused before its check", got)
		}
		if got := githubInst.installs.Load() - installs; got != 0 {
			t.Errorf("the installer installed %d time(s); a pinned tool must not be installed", got)
		}
		if got := toolConfigs[2].InstallParams["version"]; got != "v2.1.0" {
			t.Errorf("the pinned tool's version install parameter = %v, want the configured v2.1.0", got)
		}
	})

	t.Run("a tool with updateCheck.enabled false is refused with 400 Bad Request", func(t *testing.T) {
		checks, installs := mockInst.calls.Load(), mockInst.installs.Load()
		status, body := update(t, "disabled-check")
		if status != http.StatusBadRequest {
			t.Errorf("status = %d, want %d", status, http.StatusBadRequest)
		}
		if body["success"] != false {
			t.Errorf("success = %v, want false for a refused update", body["success"])
		}
		errMsg := fmt.Sprint(body["error"])
		if !strings.Contains(errMsg, "updateCheck.enabled") {
			t.Errorf("error = %q, want containing updateCheck.enabled", errMsg)
		}
		if got := mockInst.calls.Load() - checks; got != 0 {
			t.Errorf("the installer was asked for updates %d time(s); an enabled:false tool is refused before its check", got)
		}
		if got := mockInst.installs.Load() - installs; got != 0 {
			t.Errorf("the installer installed %d time(s); an enabled:false tool must not be installed", got)
		}
	})

	t.Run("an unpinned tool is checked and installed", func(t *testing.T) {
		checks, installs := mockInst.calls.Load(), mockInst.installs.Load()
		_, body := update(t, "unpinned")
		if body["success"] != true {
			t.Fatalf("success = %v, error = %v, want the update to succeed", body["success"], body["error"])
		}
		if mockInst.calls.Load() == checks || mockInst.installs.Load() == installs {
			t.Errorf("checks %d -> %d, installs %d -> %d; an unpinned tool must be checked and installed",
				checks, mockInst.calls.Load(), installs, mockInst.installs.Load())
		}
	})

	// The install route answers with the version the installation recorded, which for
	// a tool pinned by its version install parameter is that pin, not the .version()
	// of "latest" the parameter overrides.
	t.Run("the install route reports the version a version install parameter pins", func(t *testing.T) {
		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/param-pinned/install", server.Port())
		resp, err := http.Post(url, "application/json", strings.NewReader(`{"force": true}`))
		if err != nil {
			t.Fatalf("POST install for param-pinned: %v", err)
		}
		defer resp.Body.Close()
		var body struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
			Error   string         `json:"error"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding install response: %v", err)
		}
		if !body.Success || body.Data["version"] != "v2.1.0" {
			t.Errorf("install response = %+v, want success with version v2.1.0", body)
		}
	})

	// A `version: "latest"` install parameter wins over .version(), so the release the
	// route picks must be written where the installer reads it; otherwise the
	// installation asks for "latest" again, counts the installed tool as current and
	// installs nothing, while the route reports an update.
	t.Run("a tool whose version install parameter is latest installs each new release", func(t *testing.T) {
		for _, tag := range []string{"v9.9.9", "v10.0.0"} {
			upstreamTag.Store(tag)
			installs := githubInst.installs.Load()
			_, body := update(t, "param-latest")
			if body["success"] != true {
				t.Fatalf("update to %s: success = %v, error = %v, want the update to succeed", tag, body["success"], body["error"])
			}
			if got := githubInst.installs.Load() - installs; got != 1 {
				t.Errorf("update to %s installed %d time(s), want 1", tag, got)
			}
			rec, err := reg.GetToolInstallation(ctx, "param-latest")
			if err != nil || rec == nil || rec.Version != tag {
				t.Errorf("installation record after the update to %s = %+v, %v; want version %s", tag, rec, err, tag)
			}
		}
		if got := toolConfigs[3].InstallParams["version"]; got != "latest" {
			t.Errorf("the server's configuration now says version %v, want the configured latest", got)
		}
	})

	// The release an update installs is not written into the server's configuration,
	// where the next update would read it as a pin and refuse the tool.
	t.Run("updating an unpinned tool again is not refused as pinned", func(t *testing.T) {
		checks := mockInst.calls.Load()
		_, body := update(t, "unpinned")
		if body["success"] != true {
			t.Fatalf("success = %v, error = %v, want the update to succeed", body["success"], body["error"])
		}
		if mockInst.calls.Load() == checks {
			t.Error("the installer was not asked for updates; an unpinned tool must be checked every time")
		}
		if got := toolConfigs[1].Version; got == nil || *got != latest {
			t.Errorf("the unpinned tool configuration no longer says %q", latest)
		}
	})
}

// TestDashboard_UpdateRoute_ReportsCheckOutcome is the regression test for the update
// endpoint discarding every way its update check can go wrong and answering updated:true
// for an installation the orchestrator skipped. Each tool is installed and healthy at
// 1.0.0 with version "latest", the configuration an unforced reinstall skips, and the
// route has to report what the check and the installation records actually say, as the
// CLI's tool update does.
func TestDashboard_UpdateRoute_ReportsCheckOutcome(t *testing.T) {
	// The server log is kept to check that a failure is logged with its cause (#131).
	serverLog := &lockedBuffer{}
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: serverLog})

	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	const installedVersion = "1.0.0"
	failing := &mockCheckUpdateInstaller{name: "update-outcome-failing", err: errors.New("API rate limit exceeded")}
	unsupported := &mockCheckUpdateInstaller{
		name:            "update-outcome-unsupported",
		err:             installer.ErrUpdateCheckUnsupported,
		detectedVersion: installedVersion,
	}
	current := &mockCheckUpdateInstaller{name: "update-outcome-current", latestVersion: installedVersion}
	newer := &mockCheckUpdateInstaller{name: "update-outcome-newer", latestVersion: "2.0.0"}
	// A package manager that says the tool is outdated without naming a release.
	outdated := &mockCheckUpdateInstaller{name: "update-outcome-outdated", outdated: new(true)}
	// A release upstream older than the installed version (#130).
	ahead := &mockCheckUpdateInstaller{name: "update-outcome-ahead", latestVersion: "0.9.0"}
	mocks := []*mockCheckUpdateInstaller{failing, unsupported, current, newer, outdated, ahead}
	instReg := installer.NewRegistry()
	for _, m := range mocks {
		if err := instReg.Register(m); err != nil {
			t.Fatalf("registering %s with the orchestrator: %v", m.name, err)
		}
	}
	orch := orchestrator.NewOrchestrator(log, newMemFS(), exec.NewMockRunner(), reg, instReg)

	tempDir := t.TempDir()
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}
	toolConfigs := []*config.ToolConfig{
		{Name: "failing", Version: new("latest"), InstallationMethod: failing.name},
		{Name: "unsupported", Version: new("latest"), InstallationMethod: unsupported.name},
		{Name: "current", Version: new("latest"), InstallationMethod: current.name},
		{Name: "newer", Version: new("latest"), InstallationMethod: newer.name},
		{Name: "outdated", Version: new("latest"), InstallationMethod: outdated.name},
		{Name: "ahead", Version: new("latest"), InstallationMethod: ahead.name},
		{Name: "unknown-installer", Version: new("latest"), InstallationMethod: "update-outcome-missing"},
		{Name: "not-installed", Version: new("latest"), InstallationMethod: newer.name},
	}
	for _, tool := range toolConfigs[:6] {
		if err := orch.InstallTool(ctx, tool.WithRequestedVersion(installedVersion), projCfg); err != nil {
			t.Fatalf("installing %s at %s: %v", tool.Name, installedVersion, err)
		}
	}
	// No installer of this name exists, so its installation can only be recorded.
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "unknown-installer",
			Version:     installedVersion,
			InstallPath: filepath.Join(tempDir, "binaries", "unknown-installer"),
			InstalledAt: time.Now().UnixMilli(),
		})
	}); err != nil {
		t.Fatalf("recording unknown-installer: %v", err)
	}
	for _, m := range mocks {
		m.installs.Store(0)
	}
	configured := make([]config.ToolConfig, len(toolConfigs))
	for i, tool := range toolConfigs {
		configured[i] = *tool
	}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	type updateAnswer struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
		Error   string         `json:"error"`
	}
	// update posts the update and returns its answer with everything the route
	// broadcast to the tool's log stream meanwhile.
	update := func(t *testing.T, tool string) (updateAnswer, string) {
		t.Helper()
		logs := make(chan string, 64)
		server.broadcaster.Subscribe(tool, logs)
		defer server.broadcaster.Unsubscribe(tool, logs)

		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/%s/update", server.Port(), tool)
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("POST update for %s: %v", tool, err)
		}
		defer resp.Body.Close()
		var body updateAnswer
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding update response for %s: %v", tool, err)
		}
		var broadcast strings.Builder
		for {
			select {
			case line := <-logs:
				broadcast.WriteString(line)
			default:
				return body, broadcast.String()
			}
		}
	}
	recordedVersion := func(t *testing.T, tool string) string {
		t.Helper()
		rec, err := reg.GetToolInstallation(ctx, tool)
		if err != nil || rec == nil {
			t.Fatalf("installation record of %s = %+v, %v", tool, rec, err)
		}
		return rec.Version
	}

	t.Run("a failed update check is reported and installs nothing", func(t *testing.T) {
		body, broadcast := update(t, "failing")
		want := `Update failed: checking update for "failing": API rate limit exceeded`
		if body.Success || body.Error != want {
			t.Errorf("response = %+v, want success false with error %q", body, want)
		}
		if !strings.Contains(broadcast, `ERROR	[failing] `+want) {
			t.Errorf("broadcast = %q, want the failure in the tool's log stream", broadcast)
		}
		if !strings.Contains(serverLog.String(), "[failing] "+want) {
			t.Errorf("server log = %q, want the failure with its cause", serverLog.String())
		}
		if got := failing.installs.Load(); got != 0 {
			t.Errorf("the installer installed %d time(s) after its update check failed, want 0", got)
		}
	})

	t.Run("an installer that is not registered is reported and installs nothing", func(t *testing.T) {
		body, broadcast := update(t, "unknown-installer")
		wantPrefix := `Update failed: getting installer for "unknown-installer": `
		if body.Success || !strings.HasPrefix(body.Error, wantPrefix) || !strings.Contains(body.Error, "update-outcome-missing") {
			t.Errorf("response = %+v, want success false with an error starting %q and naming the installer", body, wantPrefix)
		}
		if !strings.Contains(broadcast, `ERROR	[unknown-installer] `+wantPrefix) {
			t.Errorf("broadcast = %q, want the failure in the tool's log stream", broadcast)
		}
	})

	t.Run("an installer that cannot check reinstalls with the CLI's warning", func(t *testing.T) {
		body, broadcast := update(t, "unsupported")
		if !body.Success {
			t.Fatalf("response = %+v, want success", body)
		}
		wantWarning := `WARN	[unsupported] Update check not supported for installer "update-outcome-unsupported", performing regular install instead`
		if !strings.Contains(broadcast, wantWarning) {
			t.Errorf("broadcast = %q, want it to contain %q", broadcast, wantWarning)
		}
		if got := unsupported.installs.Load(); got != 1 {
			t.Errorf("the installer installed %d time(s), want the forced reinstall", got)
		}
		want := map[string]any{"updated": false, "oldVersion": installedVersion, "newVersion": installedVersion, "status": "unsupported", "latestVersion": "unknown", "reinstalled": true}
		if !reflect.DeepEqual(body.Data, want) {
			t.Errorf("data = %v, want %v: the reinstall recorded the version it detected, the one installed before", body.Data, want)
		}
	})

	t.Run("a tool already at the latest release is not reinstalled", func(t *testing.T) {
		body, _ := update(t, "current")
		want := map[string]any{"updated": false, "oldVersion": installedVersion, "newVersion": installedVersion, "status": "up-to-date", "latestVersion": installedVersion, "reinstalled": false}
		if !body.Success || !reflect.DeepEqual(body.Data, want) {
			t.Errorf("response = %+v, want success with data %v", body, want)
		}
		if got := current.installs.Load(); got != 0 {
			t.Errorf("the installer installed %d time(s) for a tool with no update, want 0", got)
		}
	})

	t.Run("an installation ahead of the latest release is neither downgraded nor called up to date", func(t *testing.T) {
		body, broadcast := update(t, "ahead")
		want := map[string]any{"updated": false, "oldVersion": installedVersion, "newVersion": installedVersion, "status": "ahead-of-latest", "latestVersion": "0.9.0", "reinstalled": false}
		if !body.Success || !reflect.DeepEqual(body.Data, want) {
			t.Errorf("response = %+v, want success with data %v", body, want)
		}
		if got := ahead.installs.Load(); got != 0 {
			t.Errorf("the installer installed %d time(s), want 0: 0.9.0 is older than the installed 1.0.0", got)
		}
		if !strings.Contains(broadcast, "INFO	[ahead] 1.0.0 is ahead of the latest known version (0.9.0)") || strings.Contains(broadcast, "Already up to date") {
			t.Errorf("broadcast = %q, want the ahead-of-latest status, not up to date", broadcast)
		}
	})

	t.Run("a newer release is installed and reported from the installation records", func(t *testing.T) {
		body, broadcast := update(t, "newer")
		want := map[string]any{"updated": true, "oldVersion": installedVersion, "newVersion": "2.0.0", "status": "update-available", "latestVersion": "2.0.0", "reinstalled": true}
		if !body.Success || !reflect.DeepEqual(body.Data, want) {
			t.Errorf("response = %+v, want success with data %v", body, want)
		}
		if got := newer.installs.Load(); got != 1 {
			t.Errorf("the installer installed %d time(s), want 1", got)
		}
		if got := recordedVersion(t, "newer"); got != "2.0.0" {
			t.Errorf("recorded version = %q, want 2.0.0", got)
		}
		if !strings.Contains(broadcast, "INFO	[newer] New version available: 1.0.0 -> 2.0.0") {
			t.Errorf("broadcast = %q, want the version the update moves to", broadcast)
		}
	})

	// The reinstall records the version it had before, so only reinstalled tells this
	// answer apart from a tool that had no update.
	t.Run("a reinstall that keeps the recorded version is reported as a reinstall", func(t *testing.T) {
		body, _ := update(t, "outdated")
		want := map[string]any{"updated": false, "oldVersion": installedVersion, "newVersion": installedVersion, "status": "update-available", "latestVersion": "unknown", "reinstalled": true}
		if !body.Success || !reflect.DeepEqual(body.Data, want) {
			t.Errorf("response = %+v, want success with data %v", body, want)
		}
		if got := outdated.installs.Load(); got != 1 {
			t.Errorf("the installer installed %d time(s), want 1", got)
		}
	})

	t.Run("a tool that is not installed is refused", func(t *testing.T) {
		installs := newer.installs.Load()
		body, _ := update(t, "not-installed")
		want := `Tool "not-installed" is not installed`
		if body.Success || body.Error != want {
			t.Errorf("response = %+v, want success false with error %q", body, want)
		}
		if got := newer.installs.Load() - installs; got != 0 {
			t.Errorf("the installer installed %d time(s), want 0", got)
		}
	})

	// A registry that cannot be read says nothing about whether the tool is installed.
	t.Run("a registry that cannot be read is reported with its cause", func(t *testing.T) {
		brokenDB, err := db.NewConnection(ctx, ":memory:")
		if err != nil {
			t.Fatalf("connecting to db: %v", err)
		}
		brokenReg := registry.NewRegistry(brokenDB)
		if err := brokenDB.Close(); err != nil {
			t.Fatalf("closing db: %v", err)
		}
		brokenServer := NewServer(log, "127.0.0.1", 0, brokenReg, testFS(), "", projCfg, toolConfigs, orch, instReg)
		if err := brokenServer.Start(); err != nil {
			t.Fatalf("starting server: %v", err)
		}
		defer brokenServer.Stop()

		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/newer/update", brokenServer.Port())
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("POST update: %v", err)
		}
		defer resp.Body.Close()
		var body updateAnswer
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding update response: %v", err)
		}
		wantPrefix := `Update failed: reading the installation of "newer": `
		if body.Success || !strings.HasPrefix(body.Error, wantPrefix) || !strings.Contains(body.Error, "closed") {
			t.Errorf("response = %+v, want success false with an error starting %q and keeping the database's cause", body, wantPrefix)
		}
	})

	t.Run("the server's tool configurations are unchanged", func(t *testing.T) {
		for i, tool := range toolConfigs {
			// The snapshot shares the Version pointer and the InstallParams map with
			// the live configuration, so what they hold is compared to what was
			// configured rather than to the snapshot.
			if tool.Version == nil || *tool.Version != "latest" {
				t.Errorf("tool configuration %s has version %v, want the configured latest", tool.Name, tool.Version)
			}
			if tool.InstallParams != nil {
				t.Errorf("tool configuration %s has install parameters %v, want none", tool.Name, tool.InstallParams)
			}
			if !reflect.DeepEqual(*tool, configured[i]) {
				t.Errorf("tool configuration %s = %+v, want the configured %+v", tool.Name, *tool, configured[i])
			}
		}
	})
}

// TestDashboard_CheckUpdateRoute_InstallerFacts pins how the endpoint reads an
// installer result: a resolved upstream release is only an update when it is actually
// newer than what is installed, and a package manager that answered the question itself
// (brew's outdated flag, apt, dnf, pacman) overrides the version comparison.
func TestDashboard_CheckUpdateRoute_InstallerFacts(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})

	sqlDB, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	outdated := true
	installers := map[string]*mockCheckUpdateInstaller{
		// An installer that only resolves the newest release upstream, which happens to
		// be the one already installed.
		"upstream-only": {name: "mock-facts-upstream", localVersion: "1.2.3", latestVersion: "1.2.3"},
		// A package manager whose own verdict disagrees with the version strings, which
		// it can order and semver cannot.
		"package-manager": {name: "mock-facts-pkgmgr", localVersion: "1.2.3_1", latestVersion: "1.2.3_1", outdated: &outdated},
		// An installation newer than the latest release upstream, as #124 left cargo tools
		// the old max_version resolution had moved onto a prerelease (#130).
		"ahead": {name: "mock-facts-ahead", localVersion: "3.0.0-alpha.2", latestVersion: "2.11.6"},
		// A tool dotfiles never installed, whose installer still names the latest release (#151).
		"never-installed": {name: "mock-facts-never-installed", latestVersion: "1.6.0"},
	}
	instReg := installer.NewRegistry()
	toolConfigs := make([]*config.ToolConfig, 0, len(installers))
	for tool, inst := range installers {
		if err := instReg.Register(inst); err != nil {
			t.Fatalf("registering %s: %v", inst.name, err)
		}
		toolConfigs = append(toolConfigs, &config.ToolConfig{Name: tool, InstallationMethod: inst.name})
	}

	reg := registry.NewRegistry(sqlDB)
	for tool, inst := range installers {
		if inst.localVersion != "" {
			recordInstallation(t, reg, tool, inst.localVersion)
		}
	}
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{ToolConfigsDir: t.TempDir()}}
	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	for tool, want := range map[string]string{"upstream-only": "up-to-date", "package-manager": "update-available", "ahead": "ahead-of-latest", "never-installed": "not-installed"} {
		t.Run(tool, func(t *testing.T) {
			url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/%s/check-update", server.Port(), tool)
			resp, err := http.Post(url, "application/json", nil)
			if err != nil {
				t.Fatalf("POST check-update: %v", err)
			}
			defer resp.Body.Close()
			var body map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
				t.Fatalf("decoding response: %v", err)
			}
			data, ok := body["data"].(map[string]any)
			if !ok {
				t.Fatalf("no data object in %v", body)
			}
			if data["status"] != want {
				t.Errorf("status = %v, want %v (installed %v, latest %v)", data["status"], want, data["currentVersion"], data["latestVersion"])
			}
			if wantLatest := installers[tool].latestVersion; data["latestVersion"] != wantLatest {
				t.Errorf("latestVersion = %v, want %v", data["latestVersion"], wantLatest)
			}
		})
	}
}

func TestDashboard_CheckUpdateRoute(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	tempDir := t.TempDir()

	instReg := installer.NewRegistry()
	mockInst := &mockCheckUpdateInstaller{
		name:          "mock-checkupdate-inst",
		localVersion:  "1.0.0",
		latestVersion: "1.1.0",
	}
	if err := instReg.Register(mockInst); err != nil {
		t.Fatalf("registering mock installer: %v", err)
	}
	unsupportedInst := &mockCheckUpdateInstaller{name: "mock-unsupported-inst", err: installer.ErrUpdateCheckUnsupported}
	if err := instReg.Register(unsupportedInst); err != nil {
		t.Fatalf("registering mock unsupported installer: %v", err)
	}
	failingInst := &mockCheckUpdateInstaller{name: "mock-failing-check-inst", err: errors.New("API rate limit exceeded")}
	if err := instReg.Register(failingInst); err != nil {
		t.Fatalf("registering mock failing installer: %v", err)
	}

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    "/test/dotfiles",
			GeneratedDir:   "/test/generated",
			BinariesDir:    "/test/binaries",
			TargetDir:      "/test/target",
			ToolConfigsDir: tempDir,
		},
	}

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "updatable-tool",
			Version:            &ver,
			InstallationMethod: "mock-checkupdate-inst",
		},
		{
			Name:               "no-method-tool",
			InstallationMethod: "",
		},
		{
			Name:               "never-installed-no-method",
			InstallationMethod: "",
		},
		{
			Name:               "failing-tool",
			InstallationMethod: failingInst.name,
		},
		{
			Name:               "unsupported-tool",
			Version:            &ver,
			InstallationMethod: unsupportedInst.name,
		},
	}

	recordInstallation(t, reg, "updatable-tool", "1.0.0")
	recordInstallation(t, reg, "no-method-tool", "1.0.0")
	recordInstallation(t, reg, "failing-tool", "1.0.0")
	// Installed at a version other than the configured one, which is never the fallback.
	recordInstallation(t, reg, "unsupported-tool", "0.9.0")
	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	t.Run("POST /api/tools/updatable-tool/check-update success", func(t *testing.T) {
		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/updatable-tool/check-update", server.Port())
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("failed to POST check-update: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}

		if body["success"] != true {
			t.Fatalf("expected success: true, got: %v", body["success"])
		}

		data, ok := body["data"].(map[string]any)
		if !ok {
			t.Fatalf("expected data to be a map, got %T", body["data"])
		}

		if data["status"] != "update-available" {
			t.Errorf("expected status update-available, got %v", data["status"])
		}
		if data["currentVersion"] != "1.0.0" {
			t.Errorf("expected currentVersion '1.0.0', got %v", data["currentVersion"])
		}
		if data["latestVersion"] != "1.1.0" {
			t.Errorf("expected latestVersion '1.1.0', got %v", data["latestVersion"])
		}
	})

	t.Run("POST /api/tools/no-method-tool/check-update unsupported", func(t *testing.T) {
		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/no-method-tool/check-update", server.Port())
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("failed to POST check-update: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}

		if body["success"] != true {
			t.Fatalf("expected success: true, got: %v", body["success"])
		}

		data, ok := body["data"].(map[string]any)
		if !ok {
			t.Fatalf("expected data to be a map, got %T", body["data"])
		}

		if data["currentVersion"] != "1.0.0" || data["latestVersion"] != "unknown" {
			t.Errorf("expected the installed version and no latest version for a tool without an installation method, got %v", data)
		}
		if data["status"] != "unsupported" || data["error"] == nil {
			t.Errorf("expected an unsupported check with a reason for a tool without an installation method, got %v", data)
		}
	})

	// A registry that cannot be read says nothing about whether the tool is installed, so
	// it is a failed check, never "not installed" (#151).
	t.Run("POST /api/tools/updatable-tool/check-update with a registry that cannot be read", func(t *testing.T) {
		brokenDB, err := db.NewConnection(ctx, ":memory:")
		if err != nil {
			t.Fatalf("connecting to db: %v", err)
		}
		brokenReg := registry.NewRegistry(brokenDB)
		if err := brokenDB.Close(); err != nil {
			t.Fatalf("closing db: %v", err)
		}
		brokenServer := NewServer(log, "127.0.0.1", 0, brokenReg, testFS(), "", projCfg, toolConfigs, nil, instReg)
		if err := brokenServer.Start(); err != nil {
			t.Fatalf("starting server: %v", err)
		}
		defer brokenServer.Stop()

		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/updatable-tool/check-update", brokenServer.Port()), "application/json", nil)
		if err != nil {
			t.Fatalf("POST check-update: %v", err)
		}
		defer resp.Body.Close()
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		errMsg, _ := body["error"].(string)
		if body["success"] != false || !strings.HasPrefix(errMsg, "Failed to read the installation of updatable-tool: ") {
			t.Errorf("response = %v, want success false with the registry's failure", body)
		}
	})

	t.Run("POST /api/tools/failing-tool/check-update reports the failed check once", func(t *testing.T) {
		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/failing-tool/check-update", server.Port()), "application/json", nil)
		if err != nil {
			t.Fatalf("POST check-update: %v", err)
		}
		defer resp.Body.Close()
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		want := `checking update for "failing-tool": API rate limit exceeded`
		if body["success"] != false || body["error"] != want {
			t.Errorf("response = %v, want success false with error %q", body, want)
		}
	})

	// A tool dotfiles never installed is not installed, whatever it could check (#151).
	t.Run("POST /api/tools/never-installed-no-method/check-update not installed", func(t *testing.T) {
		data, ok := getJSONData(t, http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/api/tools/never-installed-no-method/check-update", server.Port())).(map[string]any)
		if !ok {
			t.Fatal("expected check-update object")
		}
		want := map[string]any{"status": "not-installed", "currentVersion": "unknown", "latestVersion": "unknown"}
		if !reflect.DeepEqual(data, want) {
			t.Errorf("data = %v, want %v", data, want)
		}
	})

	// An installer that cannot learn the latest version must not be reported as up to
	// date.
	t.Run("POST /api/tools/unsupported-tool/check-update reports the check as unsupported", func(t *testing.T) {
		url := fmt.Sprintf("http://127.0.0.1:%d/api/tools/unsupported-tool/check-update", server.Port())
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			t.Fatalf("failed to POST check-update: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}
		// The shape v1's tool-check-update route answered with.
		if body["success"] != true {
			t.Fatalf("expected success: true, got %v", body)
		}
		data, ok := body["data"].(map[string]any)
		if !ok {
			t.Fatalf("expected data to be a map, got %T", body["data"])
		}
		want := map[string]any{
			"status": "unsupported",
			// Only the registry says what is installed; the configured version is not a fallback.
			"currentVersion": "0.9.0",
			"latestVersion":  "unknown",
			"error":          `Update checking is not supported for installation method "mock-unsupported-inst"`,
		}
		for key, value := range want {
			if data[key] != value {
				t.Errorf("data[%q] = %v, want %v", key, data[key], value)
			}
		}
	})
}

func TestFormatRelativeTimeAndLogBroadcasterWrite(t *testing.T) {
	now := time.Now().UnixMilli()

	if got := formatRelativeTime(now); got != "just now" {
		t.Errorf("expected 'just now', got %q", got)
	}
	if got := formatRelativeTime(now - 65*1000); got != "1 minute ago" {
		t.Errorf("expected '1 minute ago', got %q", got)
	}
	if got := formatRelativeTime(now - 120*1000); got != "2 minutes ago" {
		t.Errorf("expected '2 minutes ago', got %q", got)
	}
	if got := formatRelativeTime(now - 3700*1000); got != "1 hour ago" {
		t.Errorf("expected '1 hour ago', got %q", got)
	}
	if got := formatRelativeTime(now - 7200*1000); got != "2 hours ago" {
		t.Errorf("expected '2 hours ago', got %q", got)
	}
	if got := formatRelativeTime(now - 86400*1000); got != "1 day ago" {
		t.Errorf("expected '1 day ago', got %q", got)
	}
	if got := formatRelativeTime(now - 2*86400*1000); got != "2 days ago" {
		t.Errorf("expected '2 days ago', got %q", got)
	}
	if got := formatRelativeTime(now - 35*86400*1000); got != "1 month ago" {
		t.Errorf("expected '1 month ago', got %q", got)
	}
	if got := formatRelativeTime(now - 400*86400*1000); got != "13 months ago" {
		t.Errorf("expected '13 months ago', got %q", got)
	}

	// LogBroadcaster.Write
	lb := NewLogBroadcaster()
	ch := make(chan string, 10)
	lb.Subscribe("test", ch)
	defer lb.Unsubscribe("test", ch)

	n, err := lb.Write([]byte("[test] log message"))
	if err != nil || n != 18 {
		t.Errorf("LogBroadcaster.Write failed: %v, n=%d", err, n)
	}

	select {
	case msg := <-ch:
		if msg != "[test] log message" {
			t.Errorf("expected '[test] log message', got %q", msg)
		}
	case <-time.After(time.Second):
		t.Error("expected message on subscriber channel")
	}
}

func TestDashboardAPIsWithOrchestratorAndDBData(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	tempDir := t.TempDir()

	// Populate DB data
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/home/test/.generated/shell-scripts/zsh/completions/_bat",
			FileType:      "completion",
			CreatedAt:     time.Now().UnixMilli() - 1000,
			OperationID:   "op-comp",
		})
		_ = reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/home/test/.generated/shell-scripts/main.zsh",
			FileType:      "init",
			CreatedAt:     time.Now().UnixMilli() - 500,
			OperationID:   "op-init",
		})
		_ = reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/home/test/.config/bat/config",
			FileType:      "file",
			CreatedAt:     time.Now().UnixMilli() - 1000,
			OperationID:   "op-1",
		})
		_ = reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "bat",
			Version:     "1.0.0",
			InstallPath: "/opt/bat",
			Timestamp:   "now",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: `["/opt/bat/bat"]`,
		})
		return reg.RecordToolUsage(ctx, tx, &registry.ToolUsageRecord{
			ToolName:   "bat",
			BinaryName: "bat",
			UsageCount: 5,
			LastUsedAt: time.Now().UnixMilli(),
		})
	})

	toolPath := filepath.Join(tempDir, "bat.tool.ts")
	_ = os.WriteFile(toolPath, []byte("// TS Tool"), 0644)

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "bat",
			Version:            &ver,
			InstallationMethod: "github-release",
			ConfigFilePath:     toolPath,
		},
	}

	memFS := newMemFS()
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()
	orch := orchestrator.NewOrchestrator(log, memFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	endpoints := []string{
		"/api/health",
		"/api/recent-tools",
		"/api/tool-configs-tree",
		"/api/tools/bat",
		"/api/tools/bat/history",
		"/api/tools/bat/source",
	}

	for _, ep := range endpoints {
		t.Run("FullData_"+ep, func(t *testing.T) {
			resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d%s", server.Port(), ep))
			if err != nil {
				t.Fatalf("GET %s failed: %v", ep, err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				t.Errorf("expected status 200 for %s, got %d", ep, resp.StatusCode)
			}
		})
	}
}

func TestDashboardEdgeCasesAndErrors(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	// 1. Server with nil registry, nil projectConfig, nil orchestrator
	serverNil := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil, nil)
	if err := serverNil.Start(); err != nil {
		t.Fatalf("failed to start nil server: %v", err)
	}
	defer serverNil.Stop()

	// Test endpoints with nil dependencies
	endpoints := []string{
		"/api/config",
		"/api/health",
		"/api/recent-tools",
		"/api/tool-configs-tree",
		"/api/tools",
		"/api/tools/nonexistent",
		"/api/tools/nonexistent/readme",
		"/api/tools/nonexistent/source",
		"/api/tools/nonexistent/history",
	}

	for _, ep := range endpoints {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d%s", serverNil.Port(), ep))
		if err == nil {
			resp.Body.Close()
		}
	}

	// Test mutation endpoints on nonexistent tool
	resp, _ := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/nonexistent/install", serverNil.Port()), "application/json", nil)
	if resp != nil {
		resp.Body.Close()
	}
	resp, _ = http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/nonexistent/check-update", serverNil.Port()), "application/json", nil)
	if resp != nil {
		resp.Body.Close()
	}
	resp, _ = http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/nonexistent/update", serverNil.Port()), "application/json", nil)
	if resp != nil {
		resp.Body.Close()
	}

	// Test unknown subroute
	resp, _ = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/unknown_subroute", serverNil.Port()))
	if resp != nil {
		resp.Body.Close()
	}

	// 2. Server with tool without ConfigFilePath and without README
	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	// Unpinned, so the update route reaches its missing orchestrator rather than refusing a pin.
	ver := "latest"
	toolNoFiles := []*config.ToolConfig{
		{
			Name:     "no-files",
			Version:  &ver,
			Disabled: true,
			Sudo:     true,
		},
	}

	tempDir := t.TempDir()
	serverNoFiles := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}, toolNoFiles, nil, nil)

	if err := serverNoFiles.Start(); err != nil {
		t.Fatalf("failed to start serverNoFiles: %v", err)
	}
	defer serverNoFiles.Stop()

	// GET /api/tools/no-files/readme (no readme)
	resp, _ = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/no-files/readme", serverNoFiles.Port()))
	if resp != nil {
		resp.Body.Close()
	}

	// GET /api/tools/fallback-md/readme (fallback to .md file)
	mdDir := filepath.Join(tempDir, "md_dir")
	_ = os.MkdirAll(mdDir, 0755)
	_ = os.WriteFile(filepath.Join(mdDir, "DOCS.md"), []byte("# Docs"), 0644)
	_ = os.WriteFile(filepath.Join(mdDir, "tool.ts"), []byte("// ts"), 0644)

	toolFallbackMd := []*config.ToolConfig{
		{
			Name:           "fallback-md",
			ConfigFilePath: filepath.Join(mdDir, "tool.ts"),
		},
	}
	serverFallback := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", nil, toolFallbackMd, nil, nil)
	_ = serverFallback.Start()
	respFallback, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/fallback-md/readme", serverFallback.Port()))
	if err == nil && respFallback != nil {
		respFallback.Body.Close()
	}
	serverFallback.Stop()

	// GET /api/tools/bad-source/source (file path doesn't exist)
	toolBadSource := []*config.ToolConfig{
		{
			Name:           "bad-source",
			ConfigFilePath: "/nonexistent/path/tool.ts",
		},
	}
	serverBadSource := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", nil, toolBadSource, nil, nil)
	_ = serverBadSource.Start()
	respBadSrc, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bad-source/source", serverBadSource.Port()))
	if err == nil && respBadSrc != nil {
		respBadSrc.Body.Close()
	}
	serverBadSource.Stop()

	// GET /api/tools/no-files/source (no config file path)
	resp, _ = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/no-files/source", serverNoFiles.Port()))
	if resp != nil {
		resp.Body.Close()
	}

	// POST /api/tools/no-files/install (nil orch)
	resp, _ = http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/no-files/install", serverNoFiles.Port()), "application/json", nil)
	if resp != nil {
		resp.Body.Close()
	}

	// POST /api/tools/no-files/update (nil orch)
	resp, _ = http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/no-files/update", serverNoFiles.Port()), "application/json", nil)
	if resp != nil {
		resp.Body.Close()
	}
}

func TestDashboardToolDetailAndConfigsTree(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	tempDir := t.TempDir()
	toolsDir := filepath.Join(tempDir, "tools")
	_ = os.MkdirAll(filepath.Join(toolsDir, "sub"), 0755)
	_ = os.WriteFile(filepath.Join(toolsDir, "tool1.tool.ts"), []byte("// tool1"), 0644)
	_ = os.WriteFile(filepath.Join(toolsDir, "sub", "tool2.tool.ts"), []byte("// tool2"), 0644)

	ver := "1.0.0"
	updEnabled := true
	updConstraint := "semver"
	richTool := &config.ToolConfig{
		Name:               "rich-tool",
		Version:            &ver,
		InstallationMethod: "github-release",
		ConfigFilePath:     filepath.Join(toolsDir, "tool1.tool.ts"),
		Sudo:               true,
		Hostname:           "myhost",
		UpdateCheck: &config.ToolConfigUpdateCheck{
			Enabled:    &updEnabled,
			Constraint: &updConstraint,
		},
		Copies: []config.CopyConfig{
			{Source: "/src/c1", Target: "/dst/c1"},
		},
		Symlinks: []config.SymlinkConfig{
			{Source: "/src/s1", Target: "/dst/s1"},
		},
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases:     map[string]string{"a": "b"},
				Env:         map[string]string{"E": "V"},
				Functions:   map[string]string{"f": "echo"},
				Completions: "/comp/zsh",
				Paths:       []interface{}{"/path/bin"},
			},
		},
	}

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: toolsDir,
		},
	}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, []*config.ToolConfig{richTool}, nil, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	// GET /api/tools/rich-tool
	resp1, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/rich-tool", server.Port()))
	if err != nil || resp1.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tools/rich-tool failed: %v", err)
	}
	resp1.Body.Close()

	// GET /api/tool-configs-tree
	resp2, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tool-configs-tree", server.Port()))
	if err != nil || resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tool-configs-tree failed: %v", err)
	}
	resp2.Body.Close()
}

type mockFailingInstaller struct{}

func (m *mockFailingInstaller) Name() string       { return "failing-installer" }
func (m *mockFailingInstaller) SupportsSudo() bool { return false }
func (m *mockFailingInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return nil, fmt.Errorf("mock download error")
}
func (m *mockFailingInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	return nil
}
func (m *mockFailingInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

func TestDashboard_InstallErrorResponse(t *testing.T) {
	serverLog := &lockedBuffer{}
	log := logger.New(logger.Config{Writer: serverLog})
	ctx := context.Background()

	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	tempDir := t.TempDir()
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "fail-tool",
			InstallationMethod: "failing-installer",
		},
	}

	memFS := newMemFS()
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()
	_ = instReg.Register(&mockFailingInstaller{})
	orch := orchestrator.NewOrchestrator(log, memFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/fail-tool/install", server.Port()), "application/json", strings.NewReader(`{"force": false}`))
	if err != nil {
		t.Fatalf("POST /api/tools/fail-tool/install failed: %v", err)
	}
	defer resp.Body.Close()

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body["success"] != false {
		t.Errorf("expected success: false on failed install, got %v", body["success"])
	}
	// The server log names the cause outside --trace, as the response does (#131).
	if want := "[fail-tool] Installation failed: "; !strings.Contains(serverLog.String(), want) || !strings.Contains(serverLog.String(), "mock download error") {
		t.Errorf("server log = %q, want %q with the installer's error", serverLog.String(), want)
	}
}

// lockedBuffer is a log writer a test can read while the server's handlers write to it.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestDashboardServer_CustomHost(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil, nil)
	if server.Host() != "127.0.0.1" {
		t.Errorf("expected host 127.0.0.1, got %s", server.Host())
	}

	serverDefault := NewServer(log, "", 0, nil, testFS(), "", nil, nil, nil, nil)
	if serverDefault.Host() != "127.0.0.1" {
		t.Errorf("expected default host 127.0.0.1 when empty, got %s", serverDefault.Host())
	}
}

func TestHandleToolReadme_RemoteAndLocal(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	// Setup a mock GitHub server for testing remote readme fetch
	githubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "remote-tool") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("# Remote Tool README\nContent from remote"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer githubServer.Close()

	tempDir := t.TempDir()
	toolsDir := filepath.Join(tempDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)

	// Local tool with tool-specific markdown
	batConfigPath := filepath.Join(toolsDir, "github-release--bat.tool.ts")
	_ = os.WriteFile(batConfigPath, []byte("// bat tool"), 0644)
	_ = os.WriteFile(filepath.Join(toolsDir, "bat.md"), []byte("# Bat Local Readme"), 0644)

	// Tool with remote repo
	remoteConfigPath := filepath.Join(toolsDir, "github-release--remote.tool.ts")
	_ = os.WriteFile(remoteConfigPath, []byte("// remote tool"), 0644)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: toolsDir,
		},
	}

	toolConfigs := []*config.ToolConfig{
		{
			Name:           "bat",
			ConfigFilePath: batConfigPath,
		},
		{
			Name:           "remote-tool",
			ConfigFilePath: remoteConfigPath,
			InstallParams: map[string]interface{}{
				"repo": "owner/remote-tool",
			},
		},
		{
			Name:           "no-readme-tool",
			ConfigFilePath: filepath.Join(toolsDir, "no-readme.tool.ts"),
		},
	}

	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", projCfg, toolConfigs, nil, nil)
	server.githubBaseURL = githubServer.URL
	server.githubRawBaseURL = githubServer.URL
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	t.Run("Local tool-specific README", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/readme", server.Port()))
		if err != nil {
			t.Fatalf("failed to request bat readme: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if body["success"] != true {
			t.Fatalf("expected success: true, got %v", body["success"])
		}
		data := body["data"].(map[string]any)
		if data["content"] != "# Bat Local Readme" {
			t.Errorf("expected '# Bat Local Readme', got %q", data["content"])
		}
	})

	t.Run("Remote README fetch and cache hit", func(t *testing.T) {
		// First call: cache miss, remote fetch
		resp1, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/remote-tool/readme", server.Port()))
		if err != nil {
			t.Fatalf("failed to request remote-tool readme: %v", err)
		}
		defer resp1.Body.Close()

		var body1 map[string]any
		if err := json.NewDecoder(resp1.Body).Decode(&body1); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if body1["success"] != true {
			t.Fatalf("expected success: true, got %v", body1["success"])
		}
		data1 := body1["data"].(map[string]any)
		if !strings.Contains(data1["content"].(string), "Remote Tool README") {
			t.Errorf("expected remote content, got %q", data1["content"])
		}

		// Second call: cache hit
		resp2, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/remote-tool/readme", server.Port()))
		if err != nil {
			t.Fatalf("failed to request remote-tool readme second time: %v", err)
		}
		defer resp2.Body.Close()

		var body2 map[string]any
		if err := json.NewDecoder(resp2.Body).Decode(&body2); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if body2["success"] != true {
			t.Fatalf("expected success: true on cache hit, got %v", body2["success"])
		}
	})

	t.Run("No README found", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/no-readme-tool/readme", server.Port()))
		if err != nil {
			t.Fatalf("failed to request no-readme-tool: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if body["success"] != false {
			t.Fatalf("expected success: false, got %v", body["success"])
		}
	})

	t.Run("Tool not found", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/nonexistent/readme", server.Port()))
		if err != nil {
			t.Fatalf("failed to request nonexistent: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body["success"] != false {
			t.Fatalf("expected success: false, got %v", body["success"])
		}
	})
}

func TestGetRepoFromToolConfig(t *testing.T) {
	if got := getRepoFromToolConfig(nil); got != "" {
		t.Errorf("expected empty string for nil config, got %q", got)
	}

	tc1 := &config.ToolConfig{
		Name: "test1",
		InstallParams: map[string]interface{}{
			"repo": "owner/repo1",
		},
	}
	if got := getRepoFromToolConfig(tc1); got != "owner/repo1" {
		t.Errorf("expected owner/repo1, got %q", got)
	}

	tc2 := &config.ToolConfig{
		Name: "test2",
		InstallParams: map[string]interface{}{
			"githubRepo": "owner/repo2",
		},
	}
	if got := getRepoFromToolConfig(tc2); got != "owner/repo2" {
		t.Errorf("expected owner/repo2, got %q", got)
	}

}

func TestFindLocalReadme(t *testing.T) {
	tempDir := t.TempDir()

	// 1. Dedicated dir matching tool name
	dedicatedDir := filepath.Join(tempDir, "mytool")
	_ = os.MkdirAll(dedicatedDir, 0755)
	_ = os.WriteFile(filepath.Join(dedicatedDir, "mytool.tool.ts"), []byte("// ts"), 0644)
	_ = os.WriteFile(filepath.Join(dedicatedDir, "README.md"), []byte("# Dedicated Readme"), 0644)

	tcDedicated := &config.ToolConfig{
		Name:           "mytool",
		ConfigFilePath: filepath.Join(dedicatedDir, "mytool.tool.ts"),
	}

	content, err := findLocalReadme(tcDedicated)
	if err != nil || content != "# Dedicated Readme" {
		t.Errorf("expected '# Dedicated Readme', got %q, err: %v", content, err)
	}

	// 2. Nil config or empty path
	if _, err := findLocalReadme(nil); err == nil {
		t.Errorf("expected error for nil config")
	}
	if _, err := findLocalReadme(&config.ToolConfig{Name: "foo"}); err == nil {
		t.Errorf("expected error for empty ConfigFilePath")
	}

	// 3. Nonexistent file directory
	if _, err := findLocalReadme(&config.ToolConfig{Name: "foo", ConfigFilePath: "/nonexistent/dir/foo.tool.ts"}); err == nil {
		t.Errorf("expected error for nonexistent directory")
	}
}

func TestFetchRemoteReadme(t *testing.T) {
	// 1. Successful fetch via GitHub API
	tsAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "success-repo") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("# API Success Readme"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer tsAPI.Close()

	sAPI := &Server{
		githubBaseURL:    tsAPI.URL,
		githubRawBaseURL: tsAPI.URL,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	content, err := sAPI.fetchRemoteReadme(ctx, "owner/success-repo")
	if err != nil || content != "# API Success Readme" {
		t.Errorf("expected '# API Success Readme', got %q, err: %v", content, err)
	}

	// 2. Fallback fetch via raw usercontent when API fails
	tsRaw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "raw-repo/HEAD/README.md") {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("# Raw Success Readme"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer tsRaw.Close()

	sRaw := &Server{
		githubBaseURL:    "http://127.0.0.1:1", // Invalid API URL to force raw fallback
		githubRawBaseURL: tsRaw.URL,
	}

	contentRaw, err := sRaw.fetchRemoteReadme(ctx, "owner/raw-repo")
	if err != nil || contentRaw != "# Raw Success Readme" {
		t.Errorf("expected '# Raw Success Readme', got %q, err: %v", contentRaw, err)
	}

	// 3. Failure when both API and raw fail
	sFail := &Server{
		githubBaseURL:    "http://127.0.0.1:1",
		githubRawBaseURL: "http://127.0.0.1:1",
	}

	if _, err := sFail.fetchRemoteReadme(ctx, "owner/fail-repo"); err == nil {
		t.Errorf("expected error when both endpoints fail")
	}
}

// TestRemovedEndpointsAreNotRegistered checks RegisterRoutes on a bare mux, because
// Start adds a catch-all that answers every unknown path with the SPA's index.html.
func TestRemovedEndpointsAreNotRegistered(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	for _, path := range []string{"/api/stats", "/api/activity", "/api/shell"} {
		t.Run(path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
			if rec.Code != http.StatusNotFound {
				t.Fatalf("%s: status = %d, want 404 because no client calls it", path, rec.Code)
			}
		})
	}
}

// assertExactKeys fails unless got has exactly the keys the TypeScript interface in
// packages/dashboard/src/shared/types.ts declares for this response.
func assertExactKeys(t *testing.T, label string, got map[string]any, want ...string) {
	t.Helper()
	keys := make([]string, 0, len(got))
	for k := range got {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	slices.Sort(want)
	if !slices.Equal(keys, want) {
		t.Fatalf("%s keys = %v, want %v", label, keys, want)
	}
}

func getJSONData(t *testing.T, method, url string) any {
	t.Helper()
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatalf("building %s %s: %v", method, url, err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer resp.Body.Close()
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding %s %s: %v", method, url, err)
	}
	if body["success"] != true {
		t.Fatalf("%s %s: success = %v, error = %v", method, url, body["success"], body["error"])
	}
	return body["data"]
}

func firstObject(t *testing.T, label string, list any) map[string]any {
	t.Helper()
	items, ok := list.([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("%s: expected a non-empty array, got %#v", label, list)
	}
	obj, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("%s: expected an object, got %T", label, items[0])
	}
	return obj
}

// TestResponsesDeclareOnlyWhatTheClientReads pins each response to the fields the
// dashboard client actually reads, so the Go server and the TypeScript interfaces
// describe the same shape and no dead payload travels over the wire.
func TestResponsesDeclareOnlyWhatTheClientReads(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	tempDir := t.TempDir()

	toolPath := filepath.Join(tempDir, "bat.tool.ts")
	if err := os.WriteFile(toolPath, []byte("// tool"), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}
	target := "/opt/bat/bin/bat"
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		if err := reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "symlink",
			FilePath:      filepath.Join(tempDir, "bin", "bat"),
			TargetPath:    &target,
			FileType:      "symlink",
			CreatedAt:     time.Now().UnixMilli() - 1000,
			OperationID:   "op-symlink",
		}); err != nil {
			return err
		}
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "bat",
			Version:     "1.0.0",
			InstallPath: "/opt/bat",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: `["/opt/bat/bin/bat"]`,
		})
	}); err != nil {
		t.Fatalf("seeding registry: %v", err)
	}
	recordInstallation(t, reg, "no-method-tool", "1.0.0")

	// Unpinned, so the update route installs it rather than refusing a pin.
	ver := "latest"
	toolConfigs := []*config.ToolConfig{
		{Name: "bat", Version: &ver, InstallationMethod: "github-release", InstallParams: map[string]interface{}{"repo": "acme/contract-bat"}, ConfigFilePath: toolPath},
		{Name: "no-method-tool"},
	}
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
		Github: config.HostConfig{Host: newGitHubReleaseAPI(t, "acme/contract-bat", "v1.1.0")},
	}
	instReg := installer.NewRegistry()
	_ = instReg.Register(&mockInstallerForTest{name: "github-release"})
	orch := orchestrator.NewOrchestrator(log, newMemFS(), exec.NewMockRunner(), reg, instReg)

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch, instReg)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()
	base := fmt.Sprintf("http://127.0.0.1:%d", server.Port())

	t.Run("tool detail files match IFileState", func(t *testing.T) {
		detail, ok := getJSONData(t, http.MethodGet, base+"/api/tools/bat").(map[string]any)
		if !ok {
			t.Fatal("expected tool detail object")
		}
		file := firstObject(t, "files", detail["files"])
		assertExactKeys(t, "files[0]", file, "filePath", "toolName", "fileType")
	})

	t.Run("tool detail runtime matches IToolRuntimeState", func(t *testing.T) {
		detail, ok := getJSONData(t, http.MethodGet, base+"/api/tools/bat").(map[string]any)
		if !ok {
			t.Fatal("expected tool detail object")
		}
		runtime, ok := detail["runtime"].(map[string]any)
		if !ok {
			t.Fatal("expected tool runtime object")
		}
		assertExactKeys(t, "runtime", runtime, "status", "installedVersion", "installedAt", "installPath", "binaryPaths")
	})

	t.Run("history entries match IToolHistoryEntry", func(t *testing.T) {
		history, ok := getJSONData(t, http.MethodGet, base+"/api/tools/bat/history").(map[string]any)
		if !ok {
			t.Fatal("expected history object")
		}
		entry := firstObject(t, "entries", history["entries"])
		assertExactKeys(t, "entries[0]", entry, "id", "operationType", "fileType", "filePath", "relativeTime")
	})

	t.Run("recent tools match IRecentToolFile", func(t *testing.T) {
		recent, ok := getJSONData(t, http.MethodGet, base+"/api/recent-tools").(map[string]any)
		if !ok {
			t.Fatal("expected recent tools object")
		}
		item := firstObject(t, "tools", recent["tools"])
		assertExactKeys(t, "tools[0]", item, "name", "configFilePath", "relativeTime", "timestampSource")
	})

	t.Run("check-update matches ICheckUpdateResponse", func(t *testing.T) {
		// A tool nothing upstream was asked about also says why, in the optional error.
		wantKeys := map[string][]string{
			"bat":            {"status", "currentVersion", "latestVersion"},
			"no-method-tool": {"status", "currentVersion", "latestVersion", "error"},
		}
		for tool, keys := range wantKeys {
			data, ok := getJSONData(t, http.MethodPost, base+"/api/tools/"+tool+"/check-update").(map[string]any)
			if !ok {
				t.Fatalf("%s: expected check-update object", tool)
			}
			assertExactKeys(t, tool+" check-update", data, keys...)
		}
	})

	t.Run("update matches IUpdateToolResponse", func(t *testing.T) {
		data, ok := getJSONData(t, http.MethodPost, base+"/api/tools/bat/update").(map[string]any)
		if !ok {
			t.Fatal("expected update object")
		}
		assertExactKeys(t, "update", data, "updated", "oldVersion", "newVersion", "status", "latestVersion", "reinstalled")
	})
}

// Legacy logs update recency before the first request without recounting history.
func TestServerStart_ImportsShimUsageLog(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolUsage(ctx, tx, &registry.ToolUsageRecord{
			ToolName: "bat", BinaryName: "bat", UsageCount: 7, LastUsedAt: 1700000000000,
		})
	}); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	generatedDir := filepath.Join(root, ".generated")
	usagePath := usagelog.Path(generatedDir)
	if err := os.MkdirAll(filepath.Dir(usagePath), 0755); err != nil {
		t.Fatalf("creating usage dir: %v", err)
	}
	const latestUse = 1700000600
	shimLog := fmt.Sprintf("v1\t1700000000\tbat\tbat\nv1\t%d\tbat\tbat\nv1\t1700000300\tbat\tbat\n", latestUse)
	if err := os.WriteFile(usagePath, []byte(shimLog), 0644); err != nil {
		t.Fatalf("writing usage log: %v", err)
	}

	toolPath := filepath.Join(root, "bat.tool.ts")
	if err := os.WriteFile(toolPath, []byte("// bat"), 0644); err != nil {
		t.Fatalf("writing tool config: %v", err)
	}
	toolConfigs := []*config.ToolConfig{{
		Name:               "bat",
		InstallationMethod: "manual",
		ConfigFilePath:     toolPath,
		Binaries:           testutil.DeclaredBinaries("bat"),
	}}
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
		DotfilesDir:    root,
		GeneratedDir:   generatedDir,
		BinariesDir:    filepath.Join(generatedDir, "binaries"),
		TargetDir:      filepath.Join(root, "bin"),
		ToolConfigsDir: root,
	}}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	usage := mustUsage(t, reg, "bat", "bat")
	if usage.UsageCount != 7 || usage.LastUsedAt != time.Unix(latestUse, 0).UnixMilli() {
		t.Fatalf("registry usage = %+v, want preserved count 7 with the latest observation", usage)
	}

	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat", server.Port()))
	if err != nil {
		t.Fatalf("GET /api/tools/bat: %v", err)
	}
	defer resp.Body.Close()
	var body struct {
		Success bool `json:"success"`
		Data    struct {
			Usage struct {
				TotalCount int `json:"totalCount"`
				Binaries   []struct {
					BinaryName string  `json:"binaryName"`
					Count      int     `json:"count"`
					LastUsedAt *string `json:"lastUsedAt"`
				} `json:"binaries"`
			} `json:"usage"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding tool detail: %v", err)
	}
	if !body.Success || body.Data.Usage.TotalCount != 7 {
		t.Fatalf("tool detail usage = %+v, want preserved totalCount 7", body.Data.Usage)
	}
	if len(body.Data.Usage.Binaries) != 1 || body.Data.Usage.Binaries[0].BinaryName != "bat" || body.Data.Usage.Binaries[0].Count != 7 {
		t.Fatalf("binaries = %+v, want bat with preserved count 7", body.Data.Usage.Binaries)
	}
	wantLastUsed := time.Unix(latestUse, 0).UTC().Format(time.RFC3339)
	if got := body.Data.Usage.Binaries[0].LastUsedAt; got == nil || *got != wantLastUsed {
		t.Fatalf("lastUsedAt = %v, want %s", got, wantLastUsed)
	}

	if _, err := os.Stat(usagePath); !os.IsNotExist(err) {
		t.Fatalf("active usage log still present after import (stat err = %v)", err)
	}
	entries, err := os.ReadDir(usagelog.Dir(generatedDir))
	if err != nil {
		t.Fatalf("listing usage dir: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("usage dir still holds %d entries after import, want none", len(entries))
	}
}

// TestServerStart_ReportsFailedUsageImport checks that a broken usage log does not
// keep the dashboard from starting: the failure is logged as a warning and the
// server still binds.
func TestServerStart_ReportsFailedUsageImport(t *testing.T) {
	var logs bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelDefault, Writer: &logs})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	root := t.TempDir()
	generatedDir := filepath.Join(root, ".generated")
	// A directory carrying a rotated log's name cannot be read as a log file.
	bogus := filepath.Join(usagelog.Dir(generatedDir), "shim-usage.log.1.7")
	if err := os.MkdirAll(bogus, 0755); err != nil {
		t.Fatalf("creating bogus rotated log: %v", err)
	}

	server := NewServer(log, "127.0.0.1", 0, registry.NewRegistry(sqlDB), testFS(), "", &config.ProjectConfig{Paths: config.PathsConfig{
		DotfilesDir:    root,
		GeneratedDir:   generatedDir,
		ToolConfigsDir: root,
	}}, nil, nil, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("Start must succeed despite the failed import: %v", err)
	}
	if err := server.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if !strings.Contains(logs.String(), "Failed to refresh tool usage") || !strings.Contains(logs.String(), bogus) {
		t.Fatalf("logs do not report the failed import naming %s:\n%s", bogus, logs.String())
	}
}

func TestUsageMarkersRefreshAtStartupAndOnToolReads(t *testing.T) {
	for _, trigger := range []string{"startup", "/api/tools", "/api/tools/bat"} {
		t.Run(trigger, func(t *testing.T) {
			server, generated := usageMarkerServer(t)
			marker := usagelog.MarkerPath(generated, "bat", "bat")
			if err := os.MkdirAll(filepath.Dir(marker), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(marker, nil, 0644); err != nil {
				t.Fatal(err)
			}
			observed := time.Unix(1700000600, 0)
			if err := os.Chtimes(marker, observed, observed); err != nil {
				t.Fatal(err)
			}
			if trigger == "startup" {
				if err := server.Start(); err != nil {
					t.Fatal(err)
				}
				defer server.Stop()
			} else {
				response := httptest.NewRecorder()
				server.handleToolsRouter(response, httptest.NewRequest(http.MethodGet, trigger, nil))
				var envelope struct {
					Success bool `json:"success"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil || !envelope.Success {
					t.Fatalf("usage refresh request failed: %s (%v)", response.Body.String(), err)
				}
				if !strings.Contains(response.Body.String(), observed.UTC().Format(time.RFC3339)) {
					t.Fatalf("tool response omitted observed use: %s", response.Body.String())
				}
			}
			usage := mustUsage(t, server.registry, "bat", "bat")
			if usage.UsageCount != 0 || usage.LastUsedAt != observed.UnixMilli() {
				t.Fatalf("usage = %+v, want marker timestamp without a counter", usage)
			}
			if _, err := os.Stat(marker); err != nil {
				t.Fatalf("refresh removed persistent marker: %v", err)
			}
			if trigger != "startup" {
				later := observed.Add(time.Hour)
				if err := os.Chtimes(marker, later, later); err != nil {
					t.Fatal(err)
				}
				response := httptest.NewRecorder()
				server.handleToolsRouter(response, httptest.NewRequest(http.MethodGet, trigger, nil))
				if !strings.Contains(response.Body.String(), later.UTC().Format(time.RFC3339)) {
					t.Fatalf("reloading tools did not observe newer use: %s", response.Body.String())
				}
			}
		})
	}
}

func TestToolReadsRemainAvailableAfterUsageMarkerFailure(t *testing.T) {
	for _, endpoint := range []string{"/api/tools", "/api/tools/bat"} {
		t.Run(endpoint, func(t *testing.T) {
			server, generated := usageMarkerServer(t)
			marker := usagelog.MarkerPath(generated, "bat", "bat")
			server.fsys = usageMarkerInspectionFailure{FS: server.fsys, path: marker}
			var diagnostics bytes.Buffer
			server.logger = logger.New(logger.Config{Writer: &diagnostics})
			stamp := time.Unix(1700000000, 0)
			if err := server.registry.WithTx(context.Background(), func(tx *sql.Tx) error {
				return server.registry.RecordToolUsage(context.Background(), tx, &registry.ToolUsageRecord{ToolName: "bat", BinaryName: "bat", LastUsedAt: stamp.UnixMilli()})
			}); err != nil {
				t.Fatal(err)
			}
			response := httptest.NewRecorder()
			server.handleToolsRouter(response, httptest.NewRequest(http.MethodGet, endpoint, nil))
			var envelope struct {
				Success bool   `json:"success"`
				Error   string `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
				t.Fatal(err)
			}
			if !envelope.Success || envelope.Error != "" || !strings.Contains(response.Body.String(), stamp.UTC().Format(time.RFC3339)) {
				t.Fatalf("optional activity failure hid tool history: %s", response.Body.String())
			}
			if !strings.Contains(diagnostics.String(), "permission denied") || !strings.Contains(diagnostics.String(), marker) {
				t.Fatalf("marker inspection failure was concealed: %s", diagnostics.String())
			}
		})
	}
}

type usageMarkerInspectionFailure struct {
	fs.FS
	path string
}

func (f usageMarkerInspectionFailure) Lstat(path string) (os.FileInfo, error) {
	if path == f.path {
		return nil, os.ErrPermission
	}
	return f.FS.Lstat(path)
}

func usageMarkerServer(t *testing.T) (*Server, string) {
	t.Helper()
	database, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	root := t.TempDir()
	generated := filepath.Join(root, ".generated")
	toolPath := filepath.Join(root, "bat.tool.ts")
	if err := os.WriteFile(toolPath, []byte("// bat"), 0644); err != nil {
		t.Fatal(err)
	}
	project := &config.ProjectConfig{Paths: config.PathsConfig{
		DotfilesDir: root, GeneratedDir: generated, BinariesDir: filepath.Join(generated, "binaries"),
		TargetDir: filepath.Join(root, "bin"), ToolConfigsDir: root,
	}}
	tools := []*config.ToolConfig{{Name: "bat", InstallationMethod: "manual", ConfigFilePath: toolPath, Binaries: testutil.DeclaredBinaries("bat")}}
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	return NewServer(log, "127.0.0.1", 0, registry.NewRegistry(database), testFS(), "", project, tools, nil, nil), generated
}

func mustUsage(t *testing.T, reg *registry.Registry, tool, binary string) *registry.ToolUsageRecord {
	t.Helper()
	rec, err := reg.GetToolUsage(context.Background(), tool, binary)
	if err != nil {
		t.Fatalf("reading usage of %s/%s: %v", tool, binary, err)
	}
	if rec == nil {
		t.Fatalf("no usage recorded for %s/%s", tool, binary)
	}
	return rec
}

func TestHealthUsesInstallationReceipts(t *testing.T) {
	for _, tc := range []struct {
		name        string
		method      string
		installPath string
		binaryPaths string
		directories []string
		files       []string
		wantOverall string
		wantDetails [][]string
	}{
		{name: "plugin has no implicit executable", method: "zsh-plugin", installPath: "/plugin", binaryPaths: "[]", directories: []string{"/plugin"}, wantOverall: "healthy", wantDetails: [][]string{{}, {}, {}}},
		{name: "configuration only needs no installation directory", binaryPaths: "[]", wantOverall: "healthy", wantDetails: [][]string{{}, {}, {}}},
		{name: "package manager binaries live outside generated directory", method: "brew", installPath: "/opt/pkg", binaryPaths: `["/usr/local/bin/example"]`, directories: []string{"/opt/pkg"}, files: []string{"/usr/local/bin/example"}, wantOverall: "healthy", wantDetails: [][]string{{}, {}, {}}},
		{name: "missing recorded binary", method: "github-release", installPath: "/opt/pkg", binaryPaths: `["/opt/pkg/example"]`, directories: []string{"/opt/pkg"}, wantOverall: "warning", wantDetails: [][]string{{"Tool example: missing installed binary /opt/pkg/example"}, {}, {}}},
		{name: "missing installation receipt path", method: "zsh-plugin", installPath: "/plugin", binaryPaths: "[]", wantOverall: "warning", wantDetails: [][]string{{}, {"Tool example: install path /plugin does not exist on disk"}, {}}},
		{name: "unused versions exclude installed version and files", method: "github-release", installPath: "/binaries/example/1.0", binaryPaths: "[]", directories: []string{"/binaries/example/1.0", "/binaries/example/0.9", "/binaries/example/current"}, files: []string{"/binaries/example/receipt.json"}, wantOverall: "warning", wantDetails: [][]string{{}, {}, {"/binaries/example/0.9"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			database, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { database.Close() })
			reg := registry.NewRegistry(database)
			mem := newMemFS()
			for _, path := range tc.directories {
				if err := mem.MkdirAll(path, 0755); err != nil {
					t.Fatal(err)
				}
			}
			for _, path := range tc.files {
				if err := mem.MkdirAll(filepath.Dir(path), 0755); err != nil {
					t.Fatal(err)
				}
				if err := mem.WriteFile(path, []byte("binary"), 0755); err != nil {
					t.Fatal(err)
				}
			}
			if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
				return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{ToolName: "example", Version: "1.0", InstallPath: tc.installPath, BinaryPaths: tc.binaryPaths})
			}); err != nil {
				t.Fatal(err)
			}
			server := NewServer(nil, "", 0, reg, mem, "", &config.ProjectConfig{Paths: config.PathsConfig{BinariesDir: "/binaries"}}, []*config.ToolConfig{{Name: "example", InstallationMethod: tc.method}}, nil, nil)
			recorder := httptest.NewRecorder()
			server.handleHealth(recorder, httptest.NewRequest(http.MethodGet, "/api/health", nil))
			var response struct {
				Success bool `json:"success"`
				Data    struct {
					Overall   string        `json:"overall"`
					Checks    []healthCheck `json:"checks"`
					LastCheck string        `json:"lastCheck"`
				} `json:"data"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if recorder.Code != http.StatusOK || !response.Success || response.Data.Overall != tc.wantOverall {
				t.Fatalf("unexpected health response: %s", recorder.Body.String())
			}
			if len(response.Data.Checks) != len(tc.wantDetails) {
				t.Fatalf("checks=%v", response.Data.Checks)
			}
			for i, check := range response.Data.Checks {
				if !reflect.DeepEqual(check.Details, tc.wantDetails[i]) {
					t.Errorf("%s details=%v want %v", check.Name, check.Details, tc.wantDetails[i])
				}
			}
			if _, err := time.Parse(time.RFC3339, response.Data.LastCheck); err != nil {
				t.Fatalf("invalid observation time: %v", err)
			}
		})
	}
}

type healthFaultFS struct {
	fs.FS
	statPath    string
	readDirPath string
	lstatPath   string
	err         error
}

func (f healthFaultFS) failure() error {
	if f.err != nil {
		return f.err
	}
	return os.ErrPermission
}

func (f healthFaultFS) Stat(path string) (os.FileInfo, error) {
	if path == f.statPath {
		return nil, &os.PathError{Op: "stat", Path: path, Err: f.failure()}
	}
	return f.FS.Stat(path)
}
func (f healthFaultFS) ReadDir(path string) ([]string, error) {
	if path == f.readDirPath {
		return nil, &os.PathError{Op: "readdir", Path: path, Err: f.failure()}
	}
	return f.FS.ReadDir(path)
}
func (f healthFaultFS) Lstat(path string) (os.FileInfo, error) {
	if path == f.lstatPath {
		return nil, &os.PathError{Op: "lstat", Path: path, Err: f.failure()}
	}
	return f.FS.Lstat(path)
}

func TestHealthRejectsIncompleteInspection(t *testing.T) {
	for _, tc := range []struct {
		name          string
		closeDatabase bool
		binaryPaths   string
		statPath      string
		readDirPath   string
		lstatPath     string
	}{
		{name: "registry failure", closeDatabase: true},
		{name: "malformed binary receipt", binaryPaths: "{"},
		{name: "installation permission failure", binaryPaths: "[]", statPath: "/installation"},
		{name: "binary permission failure", binaryPaths: `["/installation/example"]`, statPath: "/installation/example"},
		{name: "binaries directory permission failure", binaryPaths: "[]", readDirPath: "/binaries"},
		{name: "version directory permission failure", binaryPaths: "[]", readDirPath: "/binaries/example"},
		{name: "tool entry permission failure", binaryPaths: "[]", lstatPath: "/binaries/example"},
		{name: "version entry permission failure", binaryPaths: "[]", lstatPath: "/binaries/example/old"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			database, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { database.Close() })
			reg := registry.NewRegistry(database)
			mem := newMemFS()
			for _, path := range []string{"/installation", "/binaries/example/old"} {
				if err := mem.MkdirAll(path, 0755); err != nil {
					t.Fatal(err)
				}
			}
			if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
				return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{ToolName: "example", Version: "1.0", InstallPath: "/installation", BinaryPaths: tc.binaryPaths})
			}); err != nil {
				t.Fatal(err)
			}
			faultFS := healthFaultFS{FS: mem, statPath: tc.statPath, readDirPath: tc.readDirPath, lstatPath: tc.lstatPath}
			server := NewServer(nil, "", 0, reg, faultFS, "", &config.ProjectConfig{Paths: config.PathsConfig{BinariesDir: "/binaries"}}, []*config.ToolConfig{{Name: "example"}}, nil, nil)
			if tc.closeDatabase {
				if err := database.Close(); err != nil {
					t.Fatal(err)
				}
			}
			recorder := httptest.NewRecorder()
			server.handleHealth(recorder, httptest.NewRequest(http.MethodGet, "/api/health", nil))
			var response struct {
				Success bool            `json:"success"`
				Error   string          `json:"error"`
				Data    json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if recorder.Code != http.StatusInternalServerError || response.Success || response.Error == "" || len(response.Data) != 0 {
				t.Fatalf("inspection error must not become healthy: %d %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestToolConfigsTreeRejectsIncompleteInspection(t *testing.T) {
	for _, tc := range []struct {
		name        string
		readDirPath string
		lstatPath   string
		err         error
	}{
		{name: "root permission", readDirPath: "/tree-bad"},
		{name: "nested permission", readDirPath: "/tree-bad/nested"},
		{name: "entry permission", lstatPath: "/tree-bad/nested/example.tool.ts"},
		{name: "nested disappeared", readDirPath: "/tree-bad/nested", err: os.ErrNotExist},
		{name: "entry disappeared", lstatPath: "/tree-bad/nested/example.tool.ts", err: os.ErrNotExist},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mem := fs.NewMemFS()
			for _, path := range []string{"/tree-good/valid.tool.ts", "/tree-bad/nested/example.tool.ts"} {
				if err := mem.MkdirAll(filepath.Dir(path), 0755); err != nil {
					t.Fatal(err)
				}
				if err := mem.WriteFile(path, []byte("export default {}"), 0644); err != nil {
					t.Fatal(err)
				}
			}
			fault := healthFaultFS{FS: mem, readDirPath: tc.readDirPath, lstatPath: tc.lstatPath, err: tc.err}
			project := &config.ProjectConfig{Paths: config.PathsConfig{ToolConfigsDir: []string{"/tree-good", "/tree-bad"}}}
			server := NewServer(nil, "", 0, nil, fault, "", project, nil, nil, nil)
			recorder := httptest.NewRecorder()
			server.handleToolConfigsTree(recorder, httptest.NewRequest(http.MethodGet, "/api/tool-configs-tree", nil))
			var response struct {
				Success bool            `json:"success"`
				Error   string          `json:"error"`
				Data    json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			faultPath := tc.readDirPath
			if faultPath == "" {
				faultPath = tc.lstatPath
			}
			if response.Success || !strings.Contains(response.Error, faultPath) || len(response.Data) != 0 {
				t.Fatalf("inspection failure must not become an empty or partial tree: %s", recorder.Body.String())
			}
		})
	}
}

func TestToolConfigsTreeUsesInjectedFilesystem(t *testing.T) {
	mem := fs.NewMemFS()
	for _, path := range []string{"/tree/alpha/example.tool.ts", "/tree/zeta.tool.ts", "/elsewhere/hidden.tool.ts"} {
		if err := mem.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := mem.WriteFile(path, []byte("export default {}"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	for link, target := range map[string]string{
		"/tree/linked-directory": "/elsewhere",
		"/tree/linked.tool.ts":   "/elsewhere/hidden.tool.ts",
		"/tree/dangling.tool.ts": "/missing.tool.ts",
	} {
		if err := mem.Symlink(target, link); err != nil {
			t.Fatal(err)
		}
	}
	project := &config.ProjectConfig{Paths: config.PathsConfig{ToolConfigsDir: []string{"/missing-root", "/tree"}}}
	server := NewServer(nil, "", 0, nil, mem, "", project, nil, nil, nil)
	recorder := httptest.NewRecorder()
	server.handleToolConfigsTree(recorder, httptest.NewRequest(http.MethodGet, "/api/tool-configs-tree", nil))
	type treeNode struct {
		Name     string     `json:"name"`
		Type     string     `json:"type"`
		ToolName string     `json:"toolName"`
		Children []treeNode `json:"children"`
	}
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Roots []struct {
				Path    string     `json:"path"`
				Entries []treeNode `json:"entries"`
			} `json:"roots"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.Success || len(response.Data.Roots) != 1 || response.Data.Roots[0].Path != "/tree" {
		t.Fatalf("expected only the existing injected root: %s", recorder.Body.String())
	}
	want := []treeNode{
		{Name: "alpha", Type: "directory", Children: []treeNode{{Name: "example.tool.ts", Type: "file", ToolName: "example"}}},
		{Name: "dangling.tool.ts", Type: "file", ToolName: "dangling"},
		{Name: "linked.tool.ts", Type: "file", ToolName: "linked"},
		{Name: "zeta.tool.ts", Type: "file", ToolName: "zeta"},
	}
	if !reflect.DeepEqual(response.Data.Roots[0].Entries, want) {
		t.Fatalf("tree must sort directories first, preserve file links, and skip directory links: %+v", response.Data.Roots[0].Entries)
	}
}

func TestConfigReportsExactStartupIdentity(t *testing.T) {
	for _, path := range []string{"/work/project's config/custom.config.ts", ""} {
		t.Run(path, func(t *testing.T) {
			server := NewServer(nil, "", 0, nil, testFS(), path, &config.ProjectConfig{}, nil, nil, nil)
			recorder := httptest.NewRecorder()
			server.handleConfig(recorder, httptest.NewRequest(http.MethodGet, "/api/config", nil))
			var payload struct {
				Data map[string]any `json:"data"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			if got, ok := payload.Data["configFilePath"]; !ok || got != path {
				t.Fatalf("configFilePath = %v (present %v), want %q", got, ok, path)
			}
		})
	}
}

func TestToolMetadataCapabilities(t *testing.T) {
	version := "2.4.0"
	disabled := false
	for _, method := range config.InstallMethods() {
		t.Run(method, func(t *testing.T) {
			server := &Server{installers: installer.DefaultRegistry()}
			tool := &config.ToolConfig{Name: "example", InstallationMethod: method}
			if method == "dmg" || method == "pkg" {
				tool.InstallParams = map[string]any{"source": map[string]any{"type": "github-release", "repo": "owner/repo"}}
			}
			uninstalled := server.toolMetadata(tool, false)
			if !uninstalled.Actions.Install.Enabled || uninstalled.Actions.Check.Enabled || uninstalled.Actions.Update.Enabled || uninstalled.Actions.Reinstall.Enabled {
				t.Fatalf("uninstalled capabilities: %+v", uninstalled)
			}
			installed := server.toolMetadata(tool, true)
			if installed.Actions.Install.Enabled || !installed.Actions.Update.Enabled || !installed.Actions.Reinstall.Enabled || installed.RequestedVersion != "latest" {
				t.Fatalf("installed capabilities: %+v", installed)
			}
			unsupported := slices.Contains([]string{"manual", "curl-binary", "curl-tar", "curl-script", "zsh-plugin"}, method)
			if installed.Actions.Check.Enabled == unsupported {
				t.Fatalf("wrong check capability: %+v", installed)
			}
			if unsupported {
				inst, err := installer.DefaultRegistry().Get(method)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := inst.CheckUpdate(context.Background(), tool); !errors.Is(err, installer.ErrUpdateCheckUnsupported) {
					t.Fatalf("policy differs from installer: %v", err)
				}
				if installed.UpdateMode != "reinstall" || installed.Actions.Check.Reason == "" {
					t.Fatalf("missing unsupported explanation: %+v", installed)
				}
			}
			tool.Version = &version
			pinned := server.toolMetadata(tool, true)
			if pinned.Actions.Update.Enabled || pinned.Actions.Update.Reason == "" || pinned.RequestedVersion != version {
				t.Fatalf("pin ignored: %+v", pinned)
			}
			tool.UpdateCheck = &config.ToolConfigUpdateCheck{Enabled: &disabled}
			blocked := server.toolMetadata(tool, true)
			if blocked.Actions.Check.Enabled || blocked.Actions.Update.Enabled || !strings.Contains(blocked.Actions.Update.Reason, "updateCheck.enabled") {
				t.Fatalf("disabled checks ignored: %+v", blocked)
			}
		})
	}
}

func TestToolMetadataApplicability(t *testing.T) {
	for _, tc := range []struct {
		name                        string
		tool                        config.ToolConfig
		applicability, kind, reason string
	}{
		{"configuration only", config.ToolConfig{}, "active", "configuration-only", "Configuration only"},
		{"missing installer", config.ToolConfig{Binaries: []any{"example"}}, "active", "invalid", "without an installation method"},
		{"disabled", config.ToolConfig{InstallationMethod: "manual", Disabled: true}, "disabled", "installable", "Disabled"},
		{"another host", config.ToolConfig{InstallationMethod: "manual", Hostname: "never-a-real-host.invalid"}, "different-host", "installable", "Configured for host"},
		{"inactive branch", config.ToolConfig{InactivePlatformConfigs: []config.InactivePlatformConfig{{InstallationMethod: "brew"}}}, "inactive-platform", "configuration-only", "No declarations apply"},
		{"active common shell", config.ToolConfig{ShellConfigs: &config.ShellConfigs{Zsh: &config.ShellTypeConfig{}}, InactivePlatformConfigs: []config.InactivePlatformConfig{{InstallationMethod: "brew"}}}, "active", "configuration-only", "Configuration only"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := &Server{installers: installer.DefaultRegistry()}
			metadata := server.toolMetadata(&tc.tool, true)
			if metadata.Applicability != tc.applicability || metadata.Kind != tc.kind || !strings.Contains(metadata.Reason, tc.reason) {
				t.Fatalf("metadata=%+v", metadata)
			}
			for _, action := range []toolAction{metadata.Actions.Install, metadata.Actions.Check, metadata.Actions.Update, metadata.Actions.Reinstall} {
				if action.Enabled || action.Reason != metadata.Reason {
					t.Fatalf("inapplicable action=%+v", action)
				}
			}
		})
	}
	for _, installers := range []*installer.Registry{nil, installer.NewRegistry()} {
		metadata := (&Server{installers: installers}).toolMetadata(&config.ToolConfig{InstallationMethod: "manual"}, false)
		if metadata.Actions.Install.Enabled || metadata.Actions.Install.Reason == "" {
			t.Fatalf("unavailable registry: %+v", metadata)
		}
	}
}

func TestToolMetadataMacSourcesAndEffectiveVersion(t *testing.T) {
	server := &Server{installers: installer.DefaultRegistry()}
	for _, method := range []string{"dmg", "pkg"} {
		for _, params := range []map[string]any{
			{"source": map[string]any{"type": "url", "url": "https://example.com/app"}},
			{"url": "https://example.com/app"},
		} {
			tool := &config.ToolConfig{Name: "app", InstallationMethod: method, InstallParams: params}
			metadata := server.toolMetadata(tool, true)
			if metadata.Actions.Check.Enabled || metadata.UpdateMode != "reinstall" || !metadata.Actions.Update.Enabled {
				t.Fatalf("direct URL capability: %+v", metadata)
			}
			inst, err := installer.DefaultRegistry().Get(method)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := inst.CheckUpdate(context.Background(), tool); !errors.Is(err, installer.ErrUpdateCheckUnsupported) {
				t.Fatalf("URL policy differs from installer: %v", err)
			}
		}
	}
	version := "latest"
	tool := &config.ToolConfig{InstallationMethod: "npm", Version: &version, InstallParams: map[string]any{"version": "3.2.1"}}
	metadata := server.toolMetadata(tool, true)
	if metadata.RequestedVersion != "3.2.1" || metadata.Actions.Update.Enabled {
		t.Fatalf("parameter pin ignored: %+v", metadata)
	}
	mockInstaller := &mockCheckUpdateInstaller{name: "github-release"}
	reg := installer.NewRegistry()
	if err := reg.Register(mockInstaller); err != nil {
		t.Fatal(err)
	}
	server.installers = reg
	server.toolMetadata(&config.ToolConfig{InstallationMethod: "github-release"}, true)
	if mockInstaller.calls.Load() != 0 || mockInstaller.installs.Load() != 0 {
		t.Fatal("metadata queried upstream or mutated installation")
	}
}

func TestStructuredHealthFindingIdentity(t *testing.T) {
	mem := newMemFS()
	if err := mem.MkdirAll("/binaries/retired/0.1", 0755); err != nil {
		t.Fatal(err)
	}
	server := &Server{fsys: mem, projectConfig: &config.ProjectConfig{Paths: config.PathsConfig{BinariesDir: "/binaries"}}, toolConfigs: []*config.ToolConfig{{Name: "tool / 100%"}}}
	checks, err := server.checkInstallations([]*registry.ToolInstallationRecord{
		{ToolName: "tool / 100%", InstallPath: "/missing/plugin", BinaryPaths: `["/missing/bin"]`},
		{ToolName: "retired", InstallPath: "/missing/retired"},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []struct {
		id       string
		findings []healthFinding
	}{
		{"tool-installations", []healthFinding{{Kind: "missing-binary", ToolName: "tool / 100%", Path: "/missing/bin", Severity: "warning", Configured: true}}},
		{"registry-integrity", []healthFinding{{Kind: "missing-installation", ToolName: "tool / 100%", Path: "/missing/plugin", Severity: "warning", Configured: true}, {Kind: "missing-installation", ToolName: "retired", Path: "/missing/retired", Severity: "warning"}}},
		{"unused-binary-versions", []healthFinding{{Kind: "unused-version", ToolName: "retired", Path: "/binaries/retired/0.1", Severity: "warning"}}},
	}
	for i, expected := range want {
		if checks[i].ID != expected.id || !reflect.DeepEqual(checks[i].Findings, expected.findings) {
			t.Errorf("check=%+v want=%+v", checks[i], expected)
		}
	}
}

func TestToolMetadataUsesResolvedPlatformApplicability(t *testing.T) {
	dir := t.TempDir()
	toolPath := filepath.Join(dir, "tools", "platform.tool.ts")
	if err := os.MkdirAll(filepath.Dir(toolPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(toolPath, []byte(`import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
 export default defineTool(install => install().platform(Platform.MacOS, install => install("manual", { binaryPath: "/opt/bin/example" })));`), 0644); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(dir, "dotfiles.config.ts")
	if err := os.WriteFile(configPath, []byte(`export default { paths: { toolConfigsDir: "./tools" } };`), 0644); err != nil {
		t.Fatal(err)
	}
	_, configs, _, err := vm.LoadTypeScriptConfig(logger.New(logger.Config{Writer: io.Discard}), fs.NewOSFS(), configPath, vm.WithTarget(vm.Target{OS: "linux", Arch: "amd64"}))
	if err != nil {
		t.Fatal(err)
	}
	tool := configs["platform"]
	if tool == nil || !tool.Disabled || tool.ShellConfigs == nil {
		t.Fatalf("unexpected resolved tool: %+v", tool)
	}
	metadata := (&Server{installers: installer.DefaultRegistry()}).toolMetadata(tool, false)
	if metadata.Applicability != "inactive-platform" || metadata.Actions.Install.Enabled || !strings.Contains(metadata.Reason, "No declarations apply") {
		t.Fatalf("platform mismatch was presented as an explicit disable: %+v", metadata)
	}
}
