package installer

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestDmgInstaller(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("dmg-content"))
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)

	if testing.Short() {
		t.Skip("skipping test in short mode.")
	}

	t.Run("Silently skip on non-macOS (Linux)", func(t *testing.T) {
		sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)

		if inst.Name() != "dmg" {
			t.Errorf("expected name to be 'dmg', got %s", inst.Name())
		}

		tool := &config.ToolConfig{
			Name: "slack",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error on non-macOS: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected 0 binaries returned on non-macOS, got %d", len(res.Binaries))
		}
	})

	t.Run("Install success on macOS", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/dmg"

		tool := &config.ToolConfig{
			Name: "slack",
			InstallParams: map[string]interface{}{
				"url":     server.URL,
				"appName": "Slack.app",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "/Applications/Slack.app/Contents/MacOS/slack" {
			t.Errorf("unexpected binary: %v", res.Binaries)
		}

		// Verify hdiutil commands were executed
		hasAttach := false
		hasDetach := false
		hasCopy := false
		for _, cmd := range runner.History {
			if cmd.Name == "hdiutil" && cmd.Args[0] == "attach" {
				hasAttach = true
			}
			if cmd.Name == "hdiutil" && cmd.Args[0] == "detach" {
				hasDetach = true
			}
			if cmd.Name == "cp" {
				hasCopy = true
			}
		}

		if !hasAttach {
			t.Error("expected hdiutil attach to run")
		}
		if !hasCopy {
			t.Error("expected cp command to run")
		}
		if !hasDetach {
			t.Error("expected hdiutil detach to run")
		}
	})

	t.Run("Uninstall on macOS", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)

		tool := &config.ToolConfig{
			Name: "slack",
			InstallParams: map[string]interface{}{
				"appName": "Slack.app",
			},
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected uninstall command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "rm" || cmd.Args[0] != "-rf" || cmd.Args[1] != "/Applications/Slack.app" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("CheckUpdate and basic details", func(t *testing.T) {
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		if inst.SupportsSudo() {
			t.Error("expected SupportsSudo() to be false")
		}

		tool := &config.ToolConfig{Name: "slack"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected result: %v, %v", res, err)
		}
	})
}
