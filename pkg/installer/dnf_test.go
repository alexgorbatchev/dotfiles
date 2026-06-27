package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestDnfInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewDnfInstaller(runner, fsys, nil)

	if inst.Name() != "dnf" {
		t.Errorf("expected name to be 'dnf', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with sudo and refresh", func(t *testing.T) {
		runner.Clear()
		runner.Register("rpm", []byte("1.7.0-1.fc38"), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"package": "jq",
				"refresh": true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected empty binaries list, got %v", res.Binaries)
		}

		// Verify dnf / sudo commands
		hasRefresh := false
		hasInstall := false
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "dnf" && cmd.Args[1] == "makecache" {
				hasRefresh = true
			}
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "dnf" && cmd.Args[1] == "install" {
				hasInstall = true
			}
		}

		if !hasRefresh {
			t.Error("expected sudo dnf makecache to run")
		}
		if !hasInstall {
			t.Error("expected sudo dnf install to run")
		}
		if res.ShellEnv["DNF_INSTALLED_VERSION"] != "1.7.0-1.fc38" {
			t.Errorf("unexpected version in env: %s", res.ShellEnv["DNF_INSTALLED_VERSION"])
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
		if cmd.Name != "sudo" || cmd.Args[0] != "dnf" || cmd.Args[1] != "remove" || cmd.Args[3] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install fails on command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("dnf", nil, errors.New("dnf error"))

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing, got nil")
		}
	})

	t.Run("CheckUpdate success with update available", func(t *testing.T) {
		runner.Clear()
		output := []byte("Last metadata expiration check: 0:12:34 ago.\nUpgradable Packages\nripgrep.x86_64                     14.1.0-1.fc39                     updates\n")
		runner.Register("dnf", output, nil)

		tool := &config.ToolConfig{Name: "ripgrep"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !res.HasUpdate {
			t.Error("expected HasUpdate to be true")
		}
		if res.LatestVersion != "14.1.0-1.fc39" {
			t.Errorf("expected LatestVersion '14.1.0-1.fc39', got %q", res.LatestVersion)
		}
	})

	t.Run("CheckUpdate success with no update", func(t *testing.T) {
		runner.Clear()
		runner.Register("dnf", []byte("Last metadata expiration check: 0:12:34 ago.\n"), nil)

		tool := &config.ToolConfig{Name: "ripgrep"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.HasUpdate {
			t.Error("expected HasUpdate to be false")
		}
	})
}
