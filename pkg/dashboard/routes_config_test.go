package dashboard

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil)
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", &config.ProjectConfig{
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

	server := NewServer(log, "127.0.0.1", 0, reg, testFS(), "", projCfg, toolConfigs, nil)
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

func TestHandleToolConfigsTree_MultipleRoots(t *testing.T) {
	log := logger.New(logger.Config{
		Name:   "test",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	type treeEntry struct {
		Name     string      `json:"name"`
		Type     string      `json:"type"`
		Children []treeEntry `json:"children"`
	}

	writeTool := func(t *testing.T, dir, name string) {
		t.Helper()
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte("export default {}"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	type treeRoot struct {
		Label   string      `json:"label"`
		Path    string      `json:"path"`
		Entries []treeEntry `json:"entries"`
	}

	fetchRootsFrom := func(t *testing.T, configPath string, toolConfigsDir interface{}) []treeRoot {
		t.Helper()
		server := NewServer(log, "127.0.0.1", 0, nil, testFS(), configPath, &config.ProjectConfig{
			Paths: config.PathsConfig{ToolConfigsDir: toolConfigsDir},
		}, nil, nil)

		recorder := httptest.NewRecorder()
		server.handleToolConfigsTree(recorder, httptest.NewRequest("GET", "/api/tool-configs-tree", nil))

		var payload struct {
			Success bool `json:"success"`
			Data    struct {
				Roots []treeRoot `json:"roots"`
			} `json:"data"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if !payload.Success {
			t.Fatalf("expected success, got body %s", recorder.Body.String())
		}
		return payload.Data.Roots
	}

	fetchRoots := func(t *testing.T, toolConfigsDir interface{}) []treeRoot {
		t.Helper()
		return fetchRootsFrom(t, "", toolConfigsDir)
	}

	t.Run("single root reports its own path and flat entries", func(t *testing.T) {
		dir := t.TempDir()
		writeTool(t, dir, "bat.tool.ts")

		roots := fetchRoots(t, dir)
		if len(roots) != 1 {
			t.Fatalf("expected one root, got %+v", roots)
		}
		if roots[0].Path != dir || roots[0].Label != dir {
			t.Fatalf("root path/label = %q/%q, want %q", roots[0].Path, roots[0].Label, dir)
		}
		entries := roots[0].Entries
		if len(entries) != 1 || entries[0].Name != "bat.tool.ts" || entries[0].Type != "file" {
			t.Fatalf("expected a single un-nested file entry, got %+v", entries)
		}
	})

	t.Run("each root is reported separately", func(t *testing.T) {
		parent := t.TempDir()
		first := filepath.Join(parent, "tools")
		second := filepath.Join(parent, "extra-tools")
		writeTool(t, first, "bat.tool.ts")
		writeTool(t, second, "jq.tool.ts")
		// Same-named subfolders in both roots must not collide.
		writeTool(t, filepath.Join(first, "shared"), "fd.tool.ts")
		writeTool(t, filepath.Join(second, "shared"), "rg.tool.ts")

		roots := fetchRoots(t, []string{first, second})
		if len(roots) != 2 {
			t.Fatalf("expected one root per configured directory, got %+v", roots)
		}

		byPath := map[string]treeRoot{}
		for _, root := range roots {
			byPath[root.Path] = root
		}

		for rootPath, wantTool := range map[string]string{first: "bat.tool.ts", second: "jq.tool.ts"} {
			root, ok := byPath[rootPath]
			if !ok {
				t.Fatalf("missing root %q in %+v", rootPath, roots)
			}
			var names []string
			for _, entry := range root.Entries {
				names = append(names, entry.Name)
			}
			if len(names) != 2 || names[0] != "shared" || names[1] != wantTool {
				t.Fatalf("root %q entries = %v, want [shared %s]", rootPath, names, wantTool)
			}
		}
	})

	// Resolution goes through vm.ResolveToolConfigsDirs, the same helper the config loader uses,
	// so these placeholder and tilde forms have to behave here exactly as they do in the CLI.
	t.Run("resolves the configFileDir placeholder against the config file", func(t *testing.T) {
		projectDir := t.TempDir()
		writeTool(t, filepath.Join(projectDir, "tools"), "bat.tool.ts")
		configPath := filepath.Join(projectDir, "dotfiles.config.ts")

		roots := fetchRootsFrom(t, configPath, "{configFileDir}/tools")
		if len(roots) != 1 {
			t.Fatalf("expected one root, got %+v", roots)
		}
		if want := filepath.Join(projectDir, "tools"); roots[0].Path != want {
			t.Fatalf("path = %q, want %q", roots[0].Path, want)
		}
	})

	t.Run("resolves a directory given relative to the config file", func(t *testing.T) {
		projectDir := t.TempDir()
		writeTool(t, filepath.Join(projectDir, "tools"), "bat.tool.ts")
		configPath := filepath.Join(projectDir, "dotfiles.config.ts")

		roots := fetchRootsFrom(t, configPath, "tools")
		if len(roots) != 1 {
			t.Fatalf("expected one root, got %+v", roots)
		}
		if want := filepath.Join(projectDir, "tools"); roots[0].Path != want {
			t.Fatalf("path = %q, want %q", roots[0].Path, want)
		}
	})

	t.Run("expands a tilde directory against the home directory", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)
		writeTool(t, filepath.Join(home, ".dotfiles-tilde-tools"), "bat.tool.ts")

		roots := fetchRootsFrom(t, filepath.Join(home, "dotfiles.config.ts"), "~/.dotfiles-tilde-tools")
		if len(roots) != 1 {
			t.Fatalf("expected one root, got %+v", roots)
		}
		if want := filepath.Join(home, ".dotfiles-tilde-tools"); roots[0].Path != want {
			t.Fatalf("path = %q, want %q", roots[0].Path, want)
		}
	})

	t.Run("label contracts the home directory to a tilde", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("HOME", home)

		dir := filepath.Join(home, ".dotfiles-dashboard-test-tools")
		writeTool(t, dir, "bat.tool.ts")

		roots := fetchRoots(t, dir)
		if len(roots) != 1 {
			t.Fatalf("expected one root, got %+v", roots)
		}
		if want := "~/.dotfiles-dashboard-test-tools"; roots[0].Label != want {
			t.Fatalf("label = %q, want %q", roots[0].Label, want)
		}
		if roots[0].Path != dir {
			t.Fatalf("path = %q, want absolute %q", roots[0].Path, dir)
		}
	})
}
