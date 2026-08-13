package dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

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

	server := NewServer(log, 0, nil, nil, nil, nil) // 0 lets system select an ephemeral port

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

	server := NewServer(log, 0, reg, projCfg, toolConfigs, nil)
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

	server := NewServer(log, 0, reg, projCfg, toolConfigs, orch)
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

	server := NewServer(log, 0, reg, projCfg, toolConfigs, orch)
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

	server := NewServer(log, 0, reg, projCfg, toolConfigs, nil)
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

	server := NewServer(log, 0, reg, projCfg, toolConfigs, nil)
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
