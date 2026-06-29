package installer

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestManualInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewManualInstaller(runner, fsys, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "manual" {
		t.Errorf("expected name to be 'manual', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with binaryPath", func(t *testing.T) {
		runner.Clear()
		srcPath := "/src/mybinary"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("manual-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected file to be copied to %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil || string(data) != "manual-payload" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Install placeholder without binaryPath", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected 0 binaries returned, got %v", res.Binaries)
		}
	})

	t.Run("Install success with binaryPath containing placeholder", func(t *testing.T) {
		runner.Clear()
		_ = fsys.MkdirAll("/home/user/.binaries/mytool/current", 0755)
		_ = fsys.WriteFile("/home/user/.binaries/mytool/current/mybinary", []byte("manual-payload-placeholder"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{stagingDir}/mybinary",
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := inst.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected file to be copied to %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil || string(data) != "manual-payload-placeholder" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Install fails missing source binary", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "/nonexistent/path",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error for missing binary, got nil")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.MkdirAll(inst.BinDir, 0755)
		_ = fsys.WriteFile(destPath, []byte("content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be removed")
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "mytool"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected: %v, %v", res, err)
		}
	})
}
