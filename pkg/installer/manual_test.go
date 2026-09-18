package installer

import (
	"context"
	"path/filepath"
	"strings"
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

	t.Run("Install success with binaryPath and symlink true", func(t *testing.T) {
		runner.Clear()
		srcPath := "/src/symlinked-binary"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("symlink-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "symtool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"symlink":    true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "symtool" {
			t.Errorf("expected symtool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "symtool")
		target, err := fsys.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected destPath to be a symlink: %v", err)
		}
		if target != srcPath {
			t.Errorf("expected symlink target %s, got %s", srcPath, target)
		}
	})

	t.Run("Install success with binaryPath containing tilde home path and symlink true", func(t *testing.T) {
		runner.Clear()
		homeFS := fs.NewResolvedFS(fs.NewMemFS(), "/home/user")
		instHome := NewManualInstaller(runner, homeFS, nil)
		instHome.BinDir = "/home/user/.generated/binaries/claude/current"

		_ = homeFS.MkdirAll("/home/user/.local/bin", 0755)
		_ = homeFS.WriteFile("/home/user/.local/bin/claude", []byte("claude-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "claude",
			InstallParams: map[string]interface{}{
				"binaryPath": "~/.local/bin/claude",
				"symlink":    true,
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.HomeDir = "/home/user"
		projCfg.Paths.BinariesDir = "/home/user/.generated/binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := instHome.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "claude" {
			t.Errorf("expected claude, got %v", res.Binaries)
		}

		destPath := filepath.Join(instHome.BinDir, "claude")
		target, err := homeFS.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected destPath to be a symlink: %v", err)
		}
		if target != "/home/user/.local/bin/claude" {
			t.Errorf("expected symlink target /home/user/.local/bin/claude, got %s", target)
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

	// {configFileDir} names a setting of the paths block that binaryPath cannot use,
	// which is how a placeholder nothing can fill reaches the installer. Left in place
	// it makes binaryPath relative, and the installer would look for the binary under
	// the directory the command was run from.
	t.Run("Install fails on a binaryPath placeholder nothing can fill", func(t *testing.T) {
		runner.Clear()

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{configFileDir}/mybinary",
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		_, err := inst.Install(ctx, tool)
		if err == nil {
			t.Fatal("Install() = nil, want it to fail on the unresolvable placeholder")
		}
		for _, want := range []string{"mytool", "binaryPath", "{configFileDir}"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("Install() = %v, want it to name %q", err, want)
			}
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
		if err != nil || res.Outdated != nil || res.LatestVersion != "" {
			t.Errorf("unexpected: %v, %v", res, err)
		}
	})
}
