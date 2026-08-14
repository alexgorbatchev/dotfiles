package dashboard

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

func TestDashboardServer(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	server := NewServer(log, "127.0.0.1", 0, nil, nil, nil, nil) // 0 lets system select an ephemeral port

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

func TestDashboardAPIs(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	// Setup in-memory SQLite database
	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    "/test/dotfiles",
			GeneratedDir:   "/test/generated",
			BinariesDir:    "/test/binaries",
			TargetDir:      "/test/target",
			ToolConfigsDir: t.TempDir(),
		},
	}

	toolConfigs := []*config.ToolConfig{
		{
			Name:               "bat",
			Version:            new(string),
			InstallationMethod: "github-release",
		},
	}
	*toolConfigs[0].Version = "1.0.0"

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	endpoints := []string{
		"/api/stats",
		"/api/config",
		"/api/health",
		"/api/activity",
		"/api/recent-tools",
		"/api/tools",
		"/api/tool-configs-tree",
		"/api/shell",
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint, func(t *testing.T) {
			resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d%s", server.Port(), endpoint))
			if err != nil {
				t.Fatalf("failed to request %s: %v", endpoint, err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				t.Errorf("expected status 200, got %d", resp.StatusCode)
			}

			var body map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
				t.Fatalf("failed to decode JSON response: %v", err)
			}

			if body["success"] != true {
				t.Errorf("expected success: true, got: %v", body["success"])
			}
		})
	}
}

func TestDashboardMutationRoutes(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
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

	// Create temp dir for tool configs and readme
	tempDir := t.TempDir()
	toolDir := filepath.Join(tempDir, "bat")
	if err := os.MkdirAll(toolDir, 0755); err != nil {
		t.Fatalf("failed to create tool dir: %v", err)
	}

	readmePath := filepath.Join(toolDir, "README.md")
	readmeContent := "# Bat Tool\nMock readme content"
	if err := os.WriteFile(readmePath, []byte(readmeContent), 0644); err != nil {
		t.Fatalf("failed to write readme: %v", err)
	}

	configPath := filepath.Join(toolDir, "bat.tool.ts")
	if err := os.WriteFile(configPath, []byte("// TS Tool"), 0644); err != nil {
		t.Fatalf("failed to write tool TS: %v", err)
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

	toolConfigs := []*config.ToolConfig{
		{
			Name:               "bat",
			Version:            new(string),
			InstallationMethod: "github-release",
			ConfigFilePath:     configPath,
		},
	}
	*toolConfigs[0].Version = "1.0.0"

	// Create a real orchestrator with mock dependencies
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()
	_ = instReg.Register(&mockInstallerForTest{name: "github-release"})

	orch := orchestrator.NewOrchestrator(log, memFS, runner, reg, instReg)

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, orch)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	// 1. Test Readme Endpoint
	t.Run("GET /api/tools/bat/readme", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/readme", server.Port()))
		if err != nil {
			t.Fatalf("failed to fetch readme: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected status 200, got %d", resp.StatusCode)
		}

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if body["success"] != true {
			t.Errorf("expected success to be true, got %v", body["success"])
		}

		data := body["data"].(map[string]any)
		if data["content"] != readmeContent {
			t.Errorf("expected readme content %q, got %q", readmeContent, data["content"])
		}
	})

	// 2. Test Logs Stream Endpoint (SSE)
	// We connect to log stream in a background thread and record received messages
	streamURL := fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/logs", server.Port())
	client := &http.Client{}
	req, err := http.NewRequest("GET", streamURL, nil)
	if err != nil {
		t.Fatalf("failed to create SSE request: %v", err)
	}

	req.Header.Set("Accept", "text/event-stream")
	streamResp, err := client.Do(req)
	if err != nil {
		t.Fatalf("failed to connect to stream: %v", err)
	}
	defer streamResp.Body.Close()

	if streamResp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200 for SSE, got %d", streamResp.StatusCode)
	}

	// 3. Test Install Endpoint (Mutation)
	// Triggers installation background thread which will broadcast logs to SSE
	t.Run("POST /api/tools/bat/install", func(t *testing.T) {
		installURL := fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/install", server.Port())
		postResp, err := http.Post(installURL, "application/json", strings.NewReader(`{"force": true}`))
		if err != nil {
			t.Fatalf("failed to trigger install: %v", err)
		}
		defer postResp.Body.Close()

		if postResp.StatusCode != http.StatusOK {
			t.Errorf("expected status 200, got %d", postResp.StatusCode)
		}

		var body map[string]any
		if err := json.NewDecoder(postResp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode install response: %v", err)
		}

		if body["success"] != true {
			t.Errorf("expected success: true, got: %v", body["success"])
		}
	})

	// Read from SSE response to verify logs were received
	buf := make([]byte, 1024)
	n, err := streamResp.Body.Read(buf)
	if err != nil && err != io.EOF {
		t.Fatalf("failed to read from SSE: %v", err)
	}

	received := string(buf[:n])
	if !strings.Contains(received, "Starting installation") {
		t.Errorf("expected logs to contain 'Starting installation', got %q", received)
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
	return &installer.UpdateCheckResult{HasUpdate: false}, nil
}

func TestDashboard_ToolsSchemaAndConcurrency(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
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

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, orch)
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
	return &installer.UpdateCheckResult{HasUpdate: false}, nil
}

func TestDashboard_PlatformSerialization(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
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

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    "/test/dotfiles",
			GeneratedDir:   "/test/generated",
			BinariesDir:    "/test/binaries",
			TargetDir:      "/test/target",
			ToolConfigsDir: tempDir,
		},
	}

	archBoth := 3 // x86_64 | arm64
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "ripgrep",
			Version:            new(string),
			InstallationMethod: "github-release",
			PlatformConfigs: []config.PlatformConfigEntry{
				{
					Platforms:     3, // Linux (1) | macOS (2)
					Architectures: &archBoth,
					Config: map[string]any{
						"installationMethod": "brew",
						"installParams": map[string]any{
							"formula": "ripgrep",
						},
					},
				},
				{
					Platforms: 4, // Windows
					Config: map[string]any{
						"installationMethod": "manual",
					},
				},
			},
		},
	}
	*toolConfigs[0].Version = "13.0.0"

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	t.Run("GET /api/tools platform bitmask serialization", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools", server.Port()))
		if err != nil {
			t.Fatalf("failed to request GET /api/tools: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d", resp.StatusCode)
		}

		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}

		dataList, ok := body["data"].([]any)
		if !ok || len(dataList) != 1 {
			t.Fatalf("expected data array with 1 tool, got %v", body["data"])
		}

		toolMap := dataList[0].(map[string]any)
		configMap := toolMap["config"].(map[string]any)

		platformConfigs, ok := configMap["platformConfigs"].([]any)
		if !ok || len(platformConfigs) != 2 {
			t.Fatalf("expected platformConfigs array of length 2, got %v", configMap["platformConfigs"])
		}

		// Entry 1: Unix (Linux | macOS) -> ["Linux", "macOS"]
		entry1 := platformConfigs[0].(map[string]any)
		platforms1, ok := entry1["platforms"].([]any)
		if !ok {
			t.Fatalf("expected entry 1 platforms to be an array, got %T: %v", entry1["platforms"], entry1["platforms"])
		}

		expectedPlatforms1 := []string{"Linux", "macOS"}
		if len(platforms1) != len(expectedPlatforms1) {
			t.Fatalf("expected %d platforms in entry 1, got %d", len(expectedPlatforms1), len(platforms1))
		}
		for i, p := range platforms1 {
			if pStr, ok := p.(string); !ok || pStr != expectedPlatforms1[i] {
				t.Errorf("entry 1 platform[%d] = %v, want %s", i, p, expectedPlatforms1[i])
			}
		}

		architectures1, ok := entry1["architectures"].([]any)
		if !ok {
			t.Fatalf("expected entry 1 architectures to be an array, got %T: %v", entry1["architectures"], entry1["architectures"])
		}
		expectedArch1 := []string{"x86_64", "arm64"}
		for i, a := range architectures1 {
			if aStr, ok := a.(string); !ok || aStr != expectedArch1[i] {
				t.Errorf("entry 1 architecture[%d] = %v, want %s", i, a, expectedArch1[i])
			}
		}

		if entry1["installationMethod"] != "brew" {
			t.Errorf("expected entry 1 installationMethod 'brew', got %v", entry1["installationMethod"])
		}

		// Entry 2: Windows (4) -> ["Windows"]
		entry2 := platformConfigs[1].(map[string]any)
		platforms2, ok := entry2["platforms"].([]any)
		if !ok {
			t.Fatalf("expected entry 2 platforms to be an array, got %T: %v", entry2["platforms"], entry2["platforms"])
		}
		if len(platforms2) != 1 || platforms2[0] != "Windows" {
			t.Errorf("expected entry 2 platforms ['Windows'], got %v", platforms2)
		}
	})
}

type mockCheckUpdateInstaller struct {
	name          string
	hasUpdate     bool
	localVersion  string
	latestVersion string
	err           error
}

func (m *mockCheckUpdateInstaller) Name() string { return m.name }
func (m *mockCheckUpdateInstaller) SupportsSudo() bool { return false }
func (m *mockCheckUpdateInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{}, nil
}
func (m *mockCheckUpdateInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}
func (m *mockCheckUpdateInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	if m.err != nil {
		return nil, m.err
	}
	return &installer.UpdateCheckResult{
		HasUpdate:     m.hasUpdate,
		LocalVersion:  m.localVersion,
		LatestVersion: m.latestVersion,
	}, nil
}

func TestDashboard_CheckUpdateRoute(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
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
		hasUpdate:     true,
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

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, nil)
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
		if data["supported"] != true {
			t.Errorf("expected supported to be true, got %v", data["supported"])
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

		if data["supported"] != false {
			t.Errorf("expected supported to be false, got %v", data["supported"])
		}
	})
}

func TestDashboardMoreRoutes(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	tempDir := t.TempDir()
	toolDir := filepath.Join(tempDir, "bat")
	_ = os.MkdirAll(toolDir, 0755)

	toolPath := filepath.Join(toolDir, "bat.tool.ts")
	_ = os.WriteFile(toolPath, []byte("// TS Tool Content"), 0644)
	_ = os.WriteFile(filepath.Join(toolDir, "README.md"), []byte("# BAT Readme"), 0644)

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "bat",
			Version:            &ver,
			InstallationMethod: "github-release",
			ConfigFilePath:     toolPath,
			Binaries:           []interface{}{"bat"},
		},
	}

	// Record installation, file states with size, and tool usage in DB
	size := int64(1024)
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "bat",
			Version:     "1.0.0",
			InstallPath: "/opt/bat",
			Timestamp:   "now",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: `["/opt/bat/bat"]`,
		})
		_ = reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/opt/bat/bat",
			FileType:      "binary",
			CreatedAt:     time.Now().UnixMilli(),
			SizeBytes:     &size,
			OperationID:   "op-bin",
		})
		return reg.RecordToolUsage(ctx, tx, &registry.ToolUsageRecord{
			ToolName:   "bat",
			BinaryName: "bat",
			UsageCount: 10,
			LastUsedAt: time.Now().UnixMilli(),
		})
	})

	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()
	_ = instReg.Register(&mockInstallerForTest{name: "github-release"})
	orch := orchestrator.NewOrchestrator(log, memFS, runner, reg, instReg)

	server := NewServer(log, "127.0.0.1", 0, reg, &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}, toolConfigs, orch)

	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	// 1. GET /api/tools/bat (handleGetToolDetail)
	resp1, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat", server.Port()))
	if err != nil || resp1.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tools/bat failed: %v, status %v", err, resp1.StatusCode)
	}
	resp1.Body.Close()

	// 2. GET /api/tools/bat/history (handleToolHistory)
	resp2, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/history", server.Port()))
	if err != nil || resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tools/bat/history failed: %v, status %v", err, resp2.StatusCode)
	}
	resp2.Body.Close()

	// 3. GET /api/tools/bat/source (handleToolSource)
	resp3, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/source", server.Port()))
	if err != nil || resp3.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tools/bat/source failed: %v, status %v", err, resp3.StatusCode)
	}
	resp3.Body.Close()

	// 4. POST /api/tools/bat/update (handleToolUpdate)
	resp4, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/update", server.Port()), "application/json", nil)
	if err != nil || resp4.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/tools/bat/update failed: %v, status %v", err, resp4.StatusCode)
	}
	resp4.Body.Close()
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

	// Populate shell scripts for handleShellIntegration
	shellDir := filepath.Join(tempDir, ".generated", "shell-scripts")
	_ = os.MkdirAll(shellDir, 0755)
	_ = os.WriteFile(filepath.Join(shellDir, "main.zsh"), []byte("# zsh init"), 0644)
	_ = os.WriteFile(filepath.Join(shellDir, "main.bash"), []byte("# bash init"), 0644)
	_ = os.WriteFile(filepath.Join(shellDir, "main.ps1"), []byte("# ps1 init"), 0644)

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

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, orch)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	endpoints := []string{
		"/api/stats",
		"/api/health",
		"/api/activity",
		"/api/recent-tools",
		"/api/shell",
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
	serverNil := NewServer(log, "127.0.0.1", 0, nil, nil, nil, nil)
	if err := serverNil.Start(); err != nil {
		t.Fatalf("failed to start nil server: %v", err)
	}
	defer serverNil.Stop()

	// Test endpoints with nil dependencies
	endpoints := []string{
		"/api/stats",
		"/api/config",
		"/api/health",
		"/api/activity",
		"/api/recent-tools",
		"/api/shell",
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
	serverNoFiles := NewServer(log, "127.0.0.1", 0, reg, &config.ProjectConfig{
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
	serverFallback := NewServer(log, "127.0.0.1", 0, reg, nil, toolFallbackMd, nil)
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
	serverBadSource := NewServer(log, "127.0.0.1", 0, reg, nil, toolBadSource, nil)
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

func TestDashboardFullHealthAndTools(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	sqlDB, _ := db.NewConnection(ctx, ":memory:")
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	tempDir := t.TempDir()
	binariesDir := filepath.Join(tempDir, "binaries")
	_ = os.MkdirAll(filepath.Join(binariesDir, "healthy-tool", "current"), 0755)
	_ = os.WriteFile(filepath.Join(binariesDir, "healthy-tool", "current", "healthy-tool"), []byte("bin"), 0755)
	_ = os.MkdirAll(filepath.Join(binariesDir, "healthy-tool", "v1.0.0"), 0755)
	_ = os.MkdirAll(filepath.Join(binariesDir, "healthy-tool", "v0.9.0"), 0755)

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "healthy-tool",
			Version:     "1.0.0",
			InstallPath: filepath.Join(binariesDir, "healthy-tool", "current", "healthy-tool"),
			Timestamp:   "now",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: `["healthy-tool"]`,
		})
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "orphaned-tool",
			Version:     "1.0.0",
			InstallPath: "/nonexistent/path/bin",
			Timestamp:   "now",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: `["orphaned-tool"]`,
		})
	})

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "healthy-tool",
			Version:            &ver,
			InstallationMethod: "github-release",
			Binaries:           []interface{}{map[string]any{"name": "healthy-tool"}},
		},
		{
			Name:               "unhealthy-tool",
			InstallationMethod: "github-release",
		},
	}

	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	instReg := installer.NewRegistry()
	_ = instReg.Register(&mockInstallerForTest{name: "github-release"})
	orch := orchestrator.NewOrchestrator(log, memFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    binariesDir,
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, orch)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	// GET /api/health
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health", server.Port()))
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/health failed: %v, status %v", err, resp.StatusCode)
	}
	resp.Body.Close()

	// POST /api/tools/healthy-tool/install with force: false
	respInst, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/healthy-tool/install", server.Port()), "application/json", strings.NewReader(`{"force": false}`))
	if err == nil && respInst != nil {
		respInst.Body.Close()
	}

	// POST /api/tools/healthy-tool/check-update with orch present
	respCheck, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/healthy-tool/check-update", server.Port()), "application/json", nil)
	if err != nil || respCheck.StatusCode != http.StatusOK {
		t.Fatalf("POST check-update failed: %v, status %v", err, respCheck.StatusCode)
	}
	respCheck.Body.Close()
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

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, []*config.ToolConfig{richTool}, nil)
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

func (m *mockFailingInstaller) Name() string { return "failing-installer" }
func (m *mockFailingInstaller) SupportsSudo() bool { return false }
func (m *mockFailingInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return nil, fmt.Errorf("mock download error")
}
func (m *mockFailingInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error { return nil }
func (m *mockFailingInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{HasUpdate: false}, nil
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

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, orch)
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
		Name:   "test",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	server := NewServer(log, "127.0.0.1", 0, nil, nil, nil, nil)
	if server.Host() != "127.0.0.1" {
		t.Errorf("expected host 127.0.0.1, got %s", server.Host())
	}

	serverDefault := NewServer(log, "", 0, nil, nil, nil, nil)
	if serverDefault.Host() != "127.0.0.1" {
		t.Errorf("expected default host 127.0.0.1 when empty, got %s", serverDefault.Host())
	}
}
