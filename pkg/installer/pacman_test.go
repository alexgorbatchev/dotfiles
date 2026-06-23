package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestPacmanInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewPacmanInstaller(runner, fsys, nil)

	if inst.Name() != "pacman" {
		t.Errorf("expected name to be 'pacman', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with sudo and sysupgrade", func(t *testing.T) {
		runner.Clear()
		runner.Register("pacman", []byte("jq 1.7.0-1"), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"package":    "jq",
				"sysupgrade": true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected empty binaries list, got %v", res.Binaries)
		}

		// Verify pacman / sudo commands
		hasSysupgrade := false
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "pacman" && cmd.Args[1] == "-Syu" {
				hasSysupgrade = true
			}
		}

		if !hasSysupgrade {
			t.Error("expected sudo pacman -Syu to run")
		}
		if res.ShellEnv["PACMAN_INSTALLED_VERSION"] != "1.7.0-1" {
			t.Errorf("unexpected version in env: %s", res.ShellEnv["PACMAN_INSTALLED_VERSION"])
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "sudo" || cmd.Args[0] != "pacman" || cmd.Args[1] != "-R" || cmd.Args[3] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install fails on command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("pacman", nil, errors.New("pacman error"))

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing, got nil")
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "jq"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected checkUpdate result: %v, %v", res, err)
		}
	})
}
