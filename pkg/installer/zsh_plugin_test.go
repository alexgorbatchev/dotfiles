package installer

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestZshPluginInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewZshPluginInstaller(runner, fsys, nil)
	inst.BinDir = "/test/plugins"

	if inst.Name() != "zsh-plugin" {
		t.Errorf("expected name to be 'zsh-plugin', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install clone success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "zsh-autosuggestions",
			InstallParams: map[string]interface{}{
				"repo": "zsh-users/zsh-autosuggestions",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected 0 binaries for zsh plugin, got %v", res.Binaries)
		}

		// Verify git clone was run
		if len(runner.History) == 0 {
			t.Fatal("expected git clone command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "git" || cmd.Args[0] != "clone" || cmd.Args[3] != "https://github.com/zsh-users/zsh-autosuggestions.git" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install pull/update success", func(t *testing.T) {
		runner.Clear()
		pluginPath := filepath.Join(inst.BinDir, "zsh-syntax-highlighting")
		_ = fsys.MkdirAll(pluginPath, 0755)

		tool := &config.ToolConfig{
			Name: "zsh-syntax-highlighting",
			InstallParams: map[string]interface{}{
				"repo": "zsh-users/zsh-syntax-highlighting",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify git pull was run
		if len(runner.History) == 0 {
			t.Fatal("expected git pull command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "git" || cmd.Args[2] != "pull" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		pluginPath := filepath.Join(inst.BinDir, "zsh-autosuggestions")
		_ = fsys.MkdirAll(pluginPath, 0755)

		tool := &config.ToolConfig{
			Name: "zsh-autosuggestions",
			InstallParams: map[string]interface{}{
				"pluginName": "zsh-autosuggestions",
			},
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(pluginPath)
		if exists {
			t.Error("expected plugin folder to be removed")
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "zsh-autosuggestions"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected: %v, %v", res, err)
		}
	})

	t.Run("Install fails missing repo and url", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "broken",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error for missing parameters, got nil")
		}
	})
}
