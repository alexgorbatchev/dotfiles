package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestBrewInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewBrewInstaller(runner, fsys, nil)

	if inst.Name() != "brew" {
		t.Errorf("expected name to be 'brew', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success with taps and force", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"jq","versions":{"stable":"1.7"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			InstallParams: map[string]interface{}{
				"formula": "jq",
				"tap":     "homebrew/core",
				"force":   true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		// Verify tap and install commands were executed
		hasTap := false
		hasInstall := false
		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "tap" && cmd.Args[1] == "homebrew/core" {
				hasTap = true
			}
			if len(cmd.Args) > 1 && cmd.Args[0] == "install" && cmd.Args[1] == "--force" {
				hasInstall = true
			}
		}

		if !hasTap {
			t.Error("expected brew tap to be called")
		}
		if !hasInstall {
			t.Error("expected brew install with --force to be called")
		}
	})

	t.Run("Install cask success", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"iterm2","versions":{"stable":"3.4"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "iterm2",
			InstallParams: map[string]interface{}{
				"cask": true,
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		hasCask := false
		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "install" && cmd.Args[1] == "--cask" {
				hasCask = true
			}
		}
		if !hasCask {
			t.Error("expected brew install with --cask to be called")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "jq",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to be executed")
		}
		cmd := runner.History[0]
		if cmd.Name != "brew" || cmd.Args[0] != "uninstall" || cmd.Args[1] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"jq","versions":{"stable":"1.7"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "jq",
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.LatestVersion != "1.7" {
			t.Errorf("expected version 1.7, got %s", res.LatestVersion)
		}
	})

	t.Run("Install error tap fails", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "tap" {
				return errors.New("tap failed")
			}
			return nil
		})

		tool := &config.ToolConfig{
			Name: "jq",
			InstallParams: map[string]interface{}{
				"tap": "broken/tap",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})

	t.Run("Install error install fails", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "install" {
				return errors.New("install failed")
			}
			return nil
		})

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})
}
