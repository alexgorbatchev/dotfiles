package installer

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
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

		// Pre-populate mock .app bundle in MemFS
		appSourceDir := "/test/dmg/slack-mount/Slack.app/Contents/MacOS"
		_ = fsys.MkdirAll(appSourceDir, 0755)
		_ = fsys.WriteFile(filepath.Join(appSourceDir, "slack"), []byte("mock-slack-bin"), 0755)

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "/Applications/Slack.app/Contents/MacOS/slack" {
			t.Errorf("unexpected binary: %v", res.Binaries)
		}

		// Verify file copy updated MemFS correctly
		copiedData, err := fsys.ReadFile("/Applications/Slack.app/Contents/MacOS/slack")
		if err != nil {
			t.Fatalf("expected copied file to exist in MemFS: %v", err)
		}
		if string(copiedData) != "mock-slack-bin" {
			t.Errorf("expected copied content to be 'mock-slack-bin', got %q", string(copiedData))
		}

		// Verify hdiutil commands were executed
		hasAttach := false
		hasDetach := false
		for _, cmd := range runner.History {
			if cmd.Name == "hdiutil" && cmd.Args[0] == "attach" {
				hasAttach = true
			}
			if cmd.Name == "hdiutil" && cmd.Args[0] == "detach" {
				hasDetach = true
			}
		}

		if !hasAttach {
			t.Error("expected hdiutil attach to run")
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

	t.Run("Install success with GitHub Release", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/dmg-gh"

		githubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.Path, "/releases/") {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"id": 12345,
					"tag_name": "v1.2.3",
					"name": "v1.2.3 Release",
					"assets": [
						{
							"id": 101,
							"name": "slack-darwin-arm64.dmg",
							"browser_download_url": "http://` + r.Host + `/download/slack.dmg"
						}
					]
				}`))
			} else if strings.Contains(r.URL.Path, "/download/") {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("mock-dmg-content"))
			}
		}))
		defer githubServer.Close()

		inst.BaseURL = githubServer.URL
		inst.BinDir = "/test/dmg-github"

		tool := &config.ToolConfig{
			Name: "slack",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{
					"type": "github-release",
					"repo": "slack/slack",
				},
				"appName": "Slack.app",
			},
		}

		// Pre-populate mock .app bundle in MemFS
		appSourceDir := "/test/dmg-github/slack-mount/Slack.app/Contents/MacOS"
		_ = fsys.MkdirAll(appSourceDir, 0755)
		_ = fsys.WriteFile(filepath.Join(appSourceDir, "slack"), []byte("mock-slack-bin-github"), 0755)

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "/Applications/Slack.app/Contents/MacOS/slack" {
			t.Errorf("unexpected binary: %v", res.Binaries)
		}
	})

	t.Run("Install success from zipped DMG", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/dmg-zip"

		// Create a mock zip containing slack.dmg
		var zipBuf bytes.Buffer
		zw := zip.NewWriter(&zipBuf)
		f, err := zw.Create("slack.dmg")
		if err != nil {
			t.Fatalf("failed to create zip file entry: %v", err)
		}
		_, _ = f.Write([]byte("mock-dmg-inside-zip"))
		_ = zw.Close()

		zipServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(zipBuf.Bytes())
		}))
		defer zipServer.Close()

		tool := &config.ToolConfig{
			Name: "slack",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{
					"type": "url",
					"url":  zipServer.URL + "/slack-arm64.zip",
				},
				"appName": "Slack.app",
			},
		}

		// Pre-populate mock .app bundle in MemFS
		appSourceDir := "/test/dmg-zip/slack-mount/Slack.app/Contents/MacOS"
		_ = fsys.MkdirAll(appSourceDir, 0755)
		_ = fsys.WriteFile(filepath.Join(appSourceDir, "slack"), []byte("mock-slack-bin-zip"), 0755)

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "/Applications/Slack.app/Contents/MacOS/slack" {
			t.Errorf("unexpected binary: %v", res.Binaries)
		}
	})

	t.Run("Install failures ensure cleanup and unmounting on copy error", func(t *testing.T) {
		runner.Clear()

		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/dmg-fail-copy"

		tool := &config.ToolConfig{
			Name: "failcopy",
			InstallParams: map[string]interface{}{
				"url":     server.URL,
				"appName": "FailCopy.app",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Fatal("expected error on copy failure, got nil")
		}
		if !strings.Contains(err.Error(), "copying App bundle") {
			t.Errorf("expected error to contain copy failure message, got: %v", err)
		}

		// Verify hdiutil detach was executed even on copy failure
		hasDetach := false
		for _, cmd := range runner.History {
			if cmd.Name == "hdiutil" && cmd.Args[0] == "detach" {
				hasDetach = true
			}
		}
		if !hasDetach {
			t.Error("expected hdiutil detach to run even on copy error")
		}

		// Verify temporary directories were pruned
		mountPoint := "/test/dmg-fail-copy/failcopy-mount"
		exists, _ := fsys.Exists(mountPoint)
		if exists {
			t.Errorf("expected mount point %s to be cleaned up, but it exists", mountPoint)
		}

		downloadPath := "/test/dmg-fail-copy/failcopy.dmg"
		exists, _ = fsys.Exists(downloadPath)
		if exists {
			t.Errorf("expected download path %s to be cleaned up, but it exists", downloadPath)
		}
	})
}
