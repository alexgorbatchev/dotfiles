package installer

import (
	"context"
	"errors"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestNpmInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewNpmInstaller(runner, fsys, nil)

	if inst.Name() != "npm" {
		t.Errorf("expected name to be 'npm', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success with npm", func(t *testing.T) {
		runner.Clear()
		ver := "2.1.0"
		tool := &config.ToolConfig{
			Name:    "prettier",
			Version: &ver,
			InstallParams: map[string]interface{}{
				"packageManager": "npm",
				"package":        "prettier",
				"force":          true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "/usr/local/bin/prettier" {
			t.Errorf("expected [/usr/local/bin/prettier] binaries for npm, got %v", res.Binaries)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "npm" || cmd.Args[0] != "install" || cmd.Args[1] != "-g" || cmd.Args[2] != "--force" || cmd.Args[3] != "prettier@2.1.0" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install success with bun", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "prettier",
			InstallParams: map[string]interface{}{
				"packageManager": "bun",
				"package":        "prettier",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "bun" || cmd.Args[0] != "install" || cmd.Args[1] != "-g" || cmd.Args[2] != "prettier" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Uninstall success with bun", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "prettier",
			InstallParams: map[string]interface{}{
				"packageManager": "bun",
			},
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "bun" || cmd.Args[0] != "remove" || cmd.Args[1] != "-g" || cmd.Args[2] != "prettier" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install failure", func(t *testing.T) {
		runner.Clear()
		runner.Register("npm", nil, errors.New("npm error"))

		tool := &config.ToolConfig{
			Name: "prettier",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "prettier"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected checkUpdate result: %v, %v", res, err)
		}
	})
}
