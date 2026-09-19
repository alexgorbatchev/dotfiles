package dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestDashboardFullHealthAndTools(t *testing.T) {
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
