package dashboard

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
)

func TestDashboardServer(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil) // 0 lets system select an ephemeral port

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

func (m *mockInstallerForTest) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
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

	memFS := fs.NewMemFS()
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch)
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

func (m *mockInstallerWithCallback) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
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
	calls         atomic.Int32
}

func (m *mockCheckUpdateInstaller) Name() string       { return m.name }
func (m *mockCheckUpdateInstaller) SupportsSudo() bool { return false }
func (m *mockCheckUpdateInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{}, nil
}
func (m *mockCheckUpdateInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
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
	if err := installer.Register(mockInst); err != nil {
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

	server := NewServer(log, "127.0.0.1", 0, registry.NewRegistry(sqlDB), testFS(), "", projCfg, toolConfigs, nil)
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
		if data["hasUpdate"] != false {
			t.Errorf("hasUpdate = %v, want false for a tool with update checks disabled", data["hasUpdate"])
		}
		if got := mockInst.calls.Load(); got != before {
			t.Errorf("the installer was asked %d time(s); a disabled update check must not reach it", got-before)
		}
	})

	t.Run("a constraint excludes an out-of-range release", func(t *testing.T) {
		data := checkUpdate(t, "constrained-out")
		if data["hasUpdate"] != false {
			t.Errorf("hasUpdate = %v, want false: 2.0.0 is outside ^1.2.3", data["hasUpdate"])
		}
		if data["latestVersion"] != "2.0.0" {
			t.Errorf("latestVersion = %v, want the release to still be reported", data["latestVersion"])
		}
	})

	t.Run("a constraint that admits the release leaves the update alone", func(t *testing.T) {
		data := checkUpdate(t, "constrained-in")
		if data["hasUpdate"] != true {
			t.Errorf("hasUpdate = %v, want true: 2.0.0 satisfies >=1.0.0", data["hasUpdate"])
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
	}
	toolConfigs := make([]*config.ToolConfig, 0, len(installers))
	for tool, inst := range installers {
		if err := installer.Register(inst); err != nil {
			t.Fatalf("registering %s: %v", inst.name, err)
		}
		toolConfigs = append(toolConfigs, &config.ToolConfig{Name: tool, InstallationMethod: inst.name})
	}

	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{ToolConfigsDir: t.TempDir()}}
	server := NewServer(log, "127.0.0.1", 0, registry.NewRegistry(sqlDB), testFS(), "", projCfg, toolConfigs, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	for tool, want := range map[string]bool{"upstream-only": false, "package-manager": true} {
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
			if data["hasUpdate"] != want {
				t.Errorf("hasUpdate = %v, want %v (installed and latest are both %v)", data["hasUpdate"], want, data["currentVersion"])
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

	mockInst := &mockCheckUpdateInstaller{
		name:          "mock-checkupdate-inst",
		localVersion:  "1.0.0",
		latestVersion: "1.1.0",
	}
	_ = installer.Register(mockInst)

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
	}

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil)
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

		if data["hasUpdate"] != true {
			t.Errorf("expected hasUpdate to be true, got %v", data["hasUpdate"])
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

		if data["currentVersion"] != "unknown" || data["latestVersion"] != "unknown" {
			t.Errorf("expected unknown versions for a tool without an installation method, got %v", data)
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

	memFS := fs.NewMemFS()
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch)
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
	serverNil := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil)
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

	ver := "1.0.0"
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
	}, toolNoFiles, nil)

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
	serverFallback := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", nil, toolFallbackMd, nil)
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
	serverBadSource := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", nil, toolBadSource, nil)
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, []*config.ToolConfig{richTool}, nil)
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
func (m *mockFailingInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}
func (m *mockFailingInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

func TestDashboard_InstallErrorResponse(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
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

	memFS := fs.NewMemFS()
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch)
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
}

func TestDashboardServer_CustomHost(t *testing.T) {
	log := logger.New(logger.Config{
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil)
	if server.Host() != "127.0.0.1" {
		t.Errorf("expected host 127.0.0.1, got %s", server.Host())
	}

	serverDefault := NewServer(log, "", 0, nil, testFS(), "", nil, nil, nil)
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

	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", projCfg, toolConfigs, nil)
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
	server := NewServer(log, "127.0.0.1", 0, nil, testFS(), "", nil, nil, nil)
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

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{Name: "bat", Version: &ver, InstallationMethod: "github-release", ConfigFilePath: toolPath},
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
	}
	instReg := installer.NewRegistry()
	_ = instReg.Register(&mockInstallerForTest{name: "github-release"})
	orch := orchestrator.NewOrchestrator(log, fs.NewMemFS(), exec.NewMockRunner(), reg, instReg)

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, orch)
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
		for _, tool := range []string{"bat", "no-method-tool"} {
			data, ok := getJSONData(t, http.MethodPost, base+"/api/tools/"+tool+"/check-update").(map[string]any)
			if !ok {
				t.Fatalf("%s: expected check-update object", tool)
			}
			assertExactKeys(t, tool+" check-update", data, "hasUpdate", "currentVersion", "latestVersion")
		}
	})

	t.Run("update matches IUpdateToolResponse", func(t *testing.T) {
		data, ok := getJSONData(t, http.MethodPost, base+"/api/tools/bat/update").(map[string]any)
		if !ok {
			t.Fatal("expected update object")
		}
		assertExactKeys(t, "update", data, "updated")
	})
}

// TestServerStart_ImportsShimUsageLog covers the wiring in Start: the log that
// shims append to is folded into the registry before the first request is served,
// so the tool detail's usage reflects invocations made while no dashboard ran.
func TestServerStart_ImportsShimUsageLog(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	usage := mustUsage(t, reg, "bat", "bat")
	if usage.UsageCount != 3 || usage.LastUsedAt != time.Unix(latestUse, 0).UnixMilli() {
		t.Fatalf("registry usage = %+v, want 3 invocations with the latest one as lastUsedAt", usage)
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
	if !body.Success || body.Data.Usage.TotalCount != 3 {
		t.Fatalf("tool detail usage = %+v, want totalCount 3 from the imported log", body.Data.Usage)
	}
	if len(body.Data.Usage.Binaries) != 1 || body.Data.Usage.Binaries[0].BinaryName != "bat" || body.Data.Usage.Binaries[0].Count != 3 {
		t.Fatalf("binaries = %+v, want bat with count 3", body.Data.Usage.Binaries)
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
	}}, nil, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("Start must succeed despite the failed import: %v", err)
	}
	defer server.Stop()

	if !strings.Contains(logs.String(), "Failed to import shim usage log") || !strings.Contains(logs.String(), bogus) {
		t.Fatalf("logs do not report the failed import naming %s:\n%s", bogus, logs.String())
	}
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
