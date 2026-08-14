package main

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
)

func TestMockInstallerAndPlatformMatching(t *testing.T) {
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

	// matchesArch
	if !matchesArch(3, "amd64") {
		t.Error("expected matchesArch(3, amd64) = true")
	}
	if !matchesArch(2, "arm64") {
		t.Error("expected matchesArch(2, arm64) = true")
	}
	if matchesArch(2, "amd64") {
		t.Error("expected matchesArch(2, amd64) = false")
	}

	// ResolvePlatformConfigs
	archArm64 := 2
	tools := []*config.ToolConfig{
		{
			Name: "plat-tool",
			PlatformConfigs: []config.PlatformConfigEntry{
				{
					Platforms:     2, // darwin
					Architectures: &archArm64,
					Config: map[string]interface{}{
						"version": "2.0.0",
					},
				},
			},
		},
	}

	sysCtx := &installer.SystemContext{OS: "darwin", Arch: "arm64"}
	ResolvePlatformConfigs(tools, sysCtx)
	if tools[0].Version == nil || *tools[0].Version != "2.0.0" {
		t.Errorf("expected version 2.0.0 after ResolvePlatformConfigs, got %v", tools[0].Version)
	}

	// Nil sysCtx fallback
	tools2 := []*config.ToolConfig{
		{
			Name: "plat-tool-2",
			PlatformConfigs: []config.PlatformConfigEntry{
				{
					Platforms: 7,
					Config: map[string]interface{}{
						"version": "3.0.0",
					},
				},
			},
		},
	}
	ResolvePlatformConfigs(tools2, nil)
	if tools2[0].Version == nil || *tools2[0].Version != "3.0.0" {
		t.Errorf("expected version 3.0.0 after ResolvePlatformConfigs(nil), got %v", tools2[0].Version)
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

func TestMatchesPlatformAndArchEdgeCases(t *testing.T) {
	// matchesPlatform with unknown OS -> false
	if matchesPlatform(1, "unknown_os") {
		t.Error("expected matchesPlatform to return false for unknown OS")
	}

	// matchesArch
	if !matchesArch(3, "arm64") {
		t.Error("expected matchesArch(3, arm64) = true")
	}
	if !matchesArch(1, "x86_64") {
		t.Error("expected matchesArch(1, x86_64) = true")
	}
	if matchesArch(1, "arm64") {
		t.Error("expected matchesArch(1, arm64) = false")
	}

	// GetLogger with invalid logLevel string -> falls back to default
	logLevel = "invalid-log-level"
	_ = GetLogger("test", io.Discard)
	logLevel = ""
}
