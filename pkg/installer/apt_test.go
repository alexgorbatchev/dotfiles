package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestAptInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewAptInstaller(runner, fsys, nil)

	if inst.Name() != "apt" {
		t.Errorf("expected name to be 'apt', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with sudo and update", func(t *testing.T) {
		runner.Clear()
		runner.Register("dpkg-query", []byte("1.2.3-1"), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"package": "jq",
				"update":  true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "/usr/bin/jq" {
			t.Errorf("expected [/usr/bin/jq] binaries list, got %v", res.Binaries)
		}

		// Verify hdiutil / apt / sudo commands
		hasUpdate := false
		hasInstall := false
		for _, cmd := range runner.History {
			if cmd.Name == "sudo" {
				// We call sudo directly, or we execute command directly
				// Wait! In apt.go, we did CommandContext(ctx, "sudo", "apt-get", "update")
				// So cmd.Name is indeed "sudo" and cmd.Args has "apt-get", "update"
			}
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "apt-get" && cmd.Args[1] == "update" {
				hasUpdate = true
			}
			if cmd.Name == "sudo" && len(cmd.Args) > 1 && cmd.Args[0] == "apt-get" && cmd.Args[1] == "install" {
				hasInstall = true
			}
		}

		if !hasUpdate {
			t.Error("expected sudo apt-get update to run")
		}
		if !hasInstall {
			t.Error("expected sudo apt-get install to run")
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
		if cmd.Name != "sudo" || cmd.Args[0] != "apt-get" || cmd.Args[1] != "remove" || cmd.Args[3] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install fails on command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("apt-get", nil, errors.New("apt error"))

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
		output := []byte("ripgrep:\n  Installed: 13.0.0-1\n  Candidate: 14.1.0-1\n")
		runner.Register("apt-cache", output, nil)

		tool := &config.ToolConfig{Name: "ripgrep"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !res.HasUpdate {
			t.Error("expected HasUpdate to be true")
		}
		if res.LocalVersion != "13.0.0-1" {
			t.Errorf("expected LocalVersion '13.0.0-1', got %q", res.LocalVersion)
		}
		if res.LatestVersion != "14.1.0-1" {
			t.Errorf("expected LatestVersion '14.1.0-1', got %q", res.LatestVersion)
		}
	})

	t.Run("CheckUpdate success with no update", func(t *testing.T) {
		runner.Clear()
		output := []byte("ripgrep:\n  Installed: 14.1.0-1\n  Candidate: 14.1.0-1\n")
		runner.Register("apt-cache", output, nil)

		tool := &config.ToolConfig{Name: "ripgrep"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.HasUpdate {
			t.Error("expected HasUpdate to be false")
		}
		if res.LocalVersion != "14.1.0-1" {
			t.Errorf("expected LocalVersion '14.1.0-1', got %q", res.LocalVersion)
		}
	})
}
