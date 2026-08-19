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

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "bat",
			Version:            &ver,
			InstallationMethod: "github-release",
		},
	}

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

	t.Run("GET /api/tools/bat/logs", func(t *testing.T) {
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

		go func() {
			time.Sleep(50 * time.Millisecond)
			server.broadcaster.Broadcast("bat", "Starting installation of bat...\n")
		}()

		buf := make([]byte, 512)
		n, err := streamResp.Body.Read(buf)
		if err != nil && err != io.EOF {
			t.Fatalf("failed to read from SSE: %v", err)
		}

		received := string(buf[:n])
		if !strings.Contains(received, "Starting installation") {
			t.Errorf("expected logs to contain 'Starting installation', got %q", received)
		}
	})

	t.Run("POST /api/tools/bat/install", func(t *testing.T) {
		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/install", server.Port()), "application/json", strings.NewReader(`{}`))
		if err != nil {
			t.Fatalf("failed to post install: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body["success"] != true {
			t.Errorf("expected success: true, got %v (error: %v)", body["success"], body["error"])
		}
	})

	t.Run("POST /api/tools/bat/check-update", func(t *testing.T) {
		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/check-update", server.Port()), "application/json", strings.NewReader(`{}`))
		if err != nil {
			t.Fatalf("failed to post check-update: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body["success"] != true {
			t.Errorf("expected success: true, got %v (error: %v)", body["success"], body["error"])
		}
	})

	t.Run("POST /api/tools/bat/update", func(t *testing.T) {
		resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/update", server.Port()), "application/json", strings.NewReader(`{}`))
		if err != nil {
			t.Fatalf("failed to post update: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body["success"] != true {
			t.Errorf("expected success: true, got %v (error: %v)", body["success"], body["error"])
		}
	})
}

func TestDashboardNotFoundAndEdgeRoutes(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	ctx := context.Background()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to connect to db: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	tempDir := t.TempDir()

	toolPath := filepath.Join(tempDir, "bat.tool.ts")
	_ = os.WriteFile(toolPath, []byte("// TS Tool Content"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "README.md"), []byte("# BAT Readme"), 0644)

	ver := "1.0.0"
	toolConfigs := []*config.ToolConfig{
		{
			Name:               "bat",
			Version:            &ver,
			InstallationMethod: "github-release",
			ConfigFilePath:     toolPath,
			InstallParams: map[string]interface{}{
				"repo": "owner/bat",
			},
		},
	}

	server := NewServer(log, "127.0.0.1", 0, reg, &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    tempDir,
			GeneratedDir:   filepath.Join(tempDir, ".generated"),
			BinariesDir:    filepath.Join(tempDir, "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}, toolConfigs, nil)

	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	// GET health
	binDir := filepath.Join(tempDir, "binaries")
	_ = os.MkdirAll(filepath.Join(binDir, "bat", "0.9.0"), 0755)
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health", server.Port()))
	if err == nil {
		resp.Body.Close()
	}

	// GET non-existent tool
	resp, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/nonexistent", server.Port()))
	if err == nil {
		resp.Body.Close()
	}

	// GET readme
	resp, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/readme", server.Port()))
	if err == nil {
		resp.Body.Close()
	}

	// GET source
	resp, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/source", server.Port()))
	if err == nil {
		resp.Body.Close()
	}

	// GET activity with limit
	resp, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/activity?limit=5", server.Port()))
	if err == nil {
		resp.Body.Close()
	}

	// GET recent-tools with limit
	resp, err = http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/recent-tools?limit=5", server.Port()))
	if err == nil {
		resp.Body.Close()
	}

	// formatRelativeTime
	_ = formatRelativeTime(time.Now().UnixMilli() - 5000)
	_ = formatRelativeTime(time.Now().UnixMilli() - 300000)
	_ = formatRelativeTime(time.Now().UnixMilli() - 7200000)
	_ = formatRelativeTime(time.Now().UnixMilli() - 172800000)

	// formatToolConfigForDashboard
	archVal := 3
	tcPlatform := &config.ToolConfig{
		Name: "plat-tool",
		PlatformConfigs: []config.PlatformConfigEntry{
			{
				Platforms:     7, // Linux | macOS | Windows
				Architectures: &archVal,
				Config:        map[string]interface{}{"installParams": map[string]interface{}{"repo": "owner/repo"}},
			},
		},
	}
	m := formatToolConfigForDashboard(tcPlatform)
	if m == nil {
		t.Errorf("formatToolConfigForDashboard returned nil")
	}

	repo := getRepoFromToolConfig(tcPlatform)
	if repo != "owner/repo" {
		t.Errorf("getRepoFromToolConfig returned %q, want 'owner/repo'", repo)
	}
}
