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

func TestDashboardAPIs(t *testing.T) {
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
			BinariesDir:    filepath.Join(tempDir, ".generated", "binaries"),
			TargetDir:      filepath.Join(tempDir, "bin"),
			ToolConfigsDir: tempDir,
		},
	}, toolConfigs, orch)

	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	resp1, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat", server.Port()))
	if err != nil || resp1.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tools/bat failed: %v, status %v", err, resp1.StatusCode)
	}
	resp1.Body.Close()

	resp2, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/tools/bat/history", server.Port()))
	if err != nil || resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/tools/bat/history failed: %v, status %v", err, resp2.StatusCode)
	}
	resp2.Body.Close()
}

func TestDashboardFullHealthAndTools(t *testing.T) {
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
			GeneratedDir:   tempDir,
			BinariesDir:    tempDir,
			TargetDir:      tempDir,
			ToolConfigsDir: tempDir,
		},
	}

	toolConfigs := []*config.ToolConfig{
		{Name: "bat", InstallationMethod: "github-release"},
	}

	server := NewServer(log, "127.0.0.1", 0, reg, projCfg, toolConfigs, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop()

	t.Run("GET /api/health", func(t *testing.T) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health", server.Port()))
		if err != nil {
			t.Fatalf("failed to fetch health: %v", err)
		}
		defer resp.Body.Close()

		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body["success"] != true {
			t.Errorf("expected health success: true, got %v", body["success"])
		}
	})
}
