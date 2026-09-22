package main

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

func TestMockInstaller(t *testing.T) {
	mInst := &mockInstaller{name: "manual"}

	if !mInst.SupportsSudo() {
		t.Error("expected SupportsSudo = true for manual")
	}

	ctx := context.Background()
	tool := &config.ToolConfig{Name: "btool"}

	if err := mInst.Uninstall(ctx, tool); err != nil {
		t.Errorf("expected nil error on Uninstall, got %v", err)
	}

	res, err := mInst.CheckUpdate(ctx, tool)
	if err != nil || res == nil {
		t.Errorf("CheckUpdate failed: %v, %v", err, res)
	}

}

func TestBootstrapServicesValid(t *testing.T) {
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(cfgPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

	ctx := context.Background()
	services, err := BootstrapServices(ctx, cfgPath)
	if err != nil {
		t.Fatalf("BootstrapServices failed: %v", err)
	}
	if services == nil || services.FS == nil || services.Registry == nil {
		t.Errorf("expected non-nil services")
	}
	if services.DB != nil {
		services.DB.Close()
	}

	// Non-existent config
	_, err = BootstrapServices(ctx, filepath.Join(tmpDir, "nonexistent.ts"))
	if err == nil {
		t.Error("expected error Bootstrapping with non-existent config path")
	}
}

func TestBootstrapServices_ExpandHomePath(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	cfgDir := filepath.Join(tmpHome, ".dotfiles")
	if err := os.MkdirAll(cfgDir, 0755); err != nil {
		t.Fatalf("failed to create cfgDir: %v", err)
	}
	cfgPath := filepath.Join(cfgDir, "dotfiles.config.ts")
	_ = os.WriteFile(cfgPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

	ctx := context.Background()
	services, err := BootstrapServices(ctx, "~/.dotfiles/dotfiles.config.ts")
	if err != nil {
		t.Fatalf("expected BootstrapServices to expand tilde and succeed, got error: %v", err)
	}
	defer services.Close()

	if services.ConfigPath != cfgPath {
		t.Errorf("expected services.ConfigPath %q, got %q", cfgPath, services.ConfigPath)
	}
}

func TestBootstrapHelpersMore(t *testing.T) {
	// fileExists
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "exists.txt")
	_ = os.WriteFile(filePath, []byte("data"), 0644)

	exists, _ := fileExists(filePath)
	if !exists {
		t.Error("expected fileExists true for created file")
	}
	exists, _ = fileExists(filepath.Join(tmpDir, "nonexistent"))
	if exists {
		t.Error("expected fileExists false for nonexistent file")
	}

	// GetLogger with verbose flag set
	verbose = true
	_ = GetLogger("test", io.Discard)
	verbose = false
	quiet = true
	_ = GetLogger("test", io.Discard)
	quiet = false
}

// Platform and architecture matching itself is covered by pkg/config's tables; this
// only exercises the logger fallback that used to share the test.
func TestGetLoggerFallsBackOnInvalidLevel(t *testing.T) {
	// GetLogger with invalid logLevel string -> falls back to default
	logLevel = "invalid-log-level"
	_ = GetLogger("test", io.Discard)
	logLevel = ""
}
