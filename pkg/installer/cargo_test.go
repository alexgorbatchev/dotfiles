package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestCargoInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewCargoInstaller(runner, fsys, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "cargo" {
		t.Errorf("expected name to be 'cargo', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success with version and root bin directory", func(t *testing.T) {
		runner.Clear()
		ver := "0.10.1"
		tool := &config.ToolConfig{
			Name:    "exa",
			Version: &ver,
			InstallParams: map[string]interface{}{
				"crateName": "exa",
			},
		}

		_ = fsys.MkdirAll("/test/bin/bin", 0755)
		_ = fsys.WriteFile("/test/bin/bin/exa", []byte("mock binary"), 0755)

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) == 0 || res.Binaries[0] != "exa" {
			t.Errorf("expected exa binary returned, got %v", res.Binaries)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected cargo command to run")
		}

		cmd := runner.History[0]
		expectedArgs := []string{"install", "--root", "/test/bin", "--version", "0.10.1", "exa"}
		if cmd.Name != "cargo" {
			t.Errorf("expected cargo command, got %s", cmd.Name)
		}
		for i, arg := range expectedArgs {
			if cmd.Args[i] != arg {
				t.Errorf("arg %d: expected %s, got %s", i, arg, cmd.Args[i])
			}
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "exa",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "cargo" || cmd.Args[0] != "uninstall" || cmd.Args[1] != "--root" || cmd.Args[3] != "exa" {
			t.Errorf("unexpected uninstall command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "exa",
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.LatestVersion != "latest" {
			t.Errorf("expected version 'latest', got %s", res.LatestVersion)
		}
	})

	t.Run("Install failure", func(t *testing.T) {
		runner.Clear()
		runner.Register("cargo", nil, errors.New("cargo error"))

		tool := &config.ToolConfig{
			Name: "broken",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing but got nil")
		}
	})
}
