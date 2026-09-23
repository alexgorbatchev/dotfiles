package installer

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
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

		// The volume the mocked hdiutil attaches.
		archivetest.Hdiutil{FS: fsys, Volume: archivetest.VolumeFile(fsys, "Slack.app/Contents/MacOS/slack", "mock-slack-bin")}.Register(runner)

		// A previous install left a file the new version no longer ships.
		const staleFile = "/Applications/Slack.app/Contents/Resources/removed-in-this-version"
		_ = fsys.MkdirAll(filepath.Dir(staleFile), 0755)
		_ = fsys.WriteFile(staleFile, []byte("old"), 0644)

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

		if exists, _ := fsys.Exists(staleFile); exists {
			t.Errorf("reinstall kept %s; the previous bundle must be replaced, not merged into", staleFile)
		}

		assertMountedAndDetached(t, runner, "/test/dmg/slack-mount")
	})

	t.Run("Install mount failure on macOS", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/dmg-fail"

		archivetest.Hdiutil{FS: fsys, Volume: func(string) error { return errors.New("attach failed") }}.Register(runner)

		tool := &config.ToolConfig{
			Name: "slack",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil || !strings.Contains(err.Error(), "attach failed") {
			t.Errorf("Install = %v, want the attach failure", err)
		}
		if exists, _ := fsys.Exists("/test/dmg-fail/slack-mount"); exists {
			t.Error("mount point left behind after a failed attach")
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
		// What an interrupted or partly failed install left beside the bundle goes too.
		cmd := runner.History[0]
		wantArgs := []string{"-rf", "/Applications/Slack.app", "/Applications/.dotfiles-new-Slack.app", "/Applications/.dotfiles-old-Slack.app"}
		if cmd.Name != "rm" || !slices.Equal(cmd.Args, wantArgs) {
			t.Errorf("unexpected command: %s %v, want rm %v", cmd.Name, cmd.Args, wantArgs)
		}
	})

	t.Run("basic details", func(t *testing.T) {
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		if inst.SupportsSudo() {
			t.Error("expected SupportsSudo() to be false")
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

		// The volume the mocked hdiutil attaches.
		archivetest.Hdiutil{FS: fsys, Volume: archivetest.VolumeFile(fsys, "Slack.app/Contents/MacOS/slack", "mock-slack-bin-github")}.Register(runner)

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

		// The volume the mocked hdiutil attaches.
		archivetest.Hdiutil{FS: fsys, Volume: archivetest.VolumeFile(fsys, "Slack.app/Contents/MacOS/slack", "mock-slack-bin-zip")}.Register(runner)

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
		// An empty volume: the bundle the tool names is not on it.
		archivetest.Hdiutil{FS: fsys}.Register(runner)

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

		// The image is detached even though the copy failed.
		assertMountedAndDetached(t, runner, "/test/dmg-fail-copy/failcopy-mount")

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

	t.Run("Install auto-detect appName and custom binaryPath", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewDmgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/dmg-autodetect"

		tool := &config.ToolConfig{
			Name: "autotool",
			InstallParams: map[string]interface{}{
				"url":        server.URL,
				"binaryPath": "Contents/MacOS/autobinary",
			},
		}

		// The volume the mocked hdiutil attaches.
		archivetest.Hdiutil{FS: fsys, Volume: archivetest.VolumeFile(fsys, "AutoDetect.app/Contents/MacOS/autobinary", "bin")}.Register(runner)

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "/Applications/AutoDetect.app/Contents/MacOS/autobinary" {
			t.Errorf("expected /Applications/AutoDetect.app/Contents/MacOS/autobinary, got %v", res.Binaries)
		}
	})
}

// assertMountedAndDetached checks that runner ran exactly one hdiutil attach, read-only
// at mountPoint, followed by one detach of it.
func assertMountedAndDetached(t *testing.T, runner *exec.MockRunner, mountPoint string) {
	t.Helper()
	calls := archivetest.Calls(runner)
	wantAttach := []string{"attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint}
	if len(calls) != 2 || len(calls[0]) != len(wantAttach)+1 || !slices.Equal(calls[0][:len(wantAttach)], wantAttach) ||
		!slices.Equal(calls[1], []string{"detach", mountPoint}) {
		t.Errorf("hdiutil calls = %q, want %q <image> then a detach of %s", calls, wantAttach, mountPoint)
	}
}

// TestDmgInstallerDetach is the regression test for issue #173: the image is attached
// read-only, a failed detach is retried with -force and otherwise fails the install,
// and the mount point is removed only once it is empty, never recursively.
func TestDmgInstallerDetach(t *testing.T) {
	const (
		staging    = "/stage"
		mountPoint = staging + "/app-mount"
		volumeBin  = "App.app/Contents/MacOS/app"
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("dmg-content"))
	}))
	defer server.Close()

	attach := []string{"attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint, staging + "/App.dmg"}
	detach := []string{"detach", mountPoint}
	forceDetach := []string{"detach", mountPoint, "-force"}
	tests := []struct {
		name  string
		fake  archivetest.Hdiutil
		calls [][]string
		// wantErr reports whether Install must fail, with an error naming the mount point.
		wantErr bool
	}{
		{name: "a detach that succeeds", calls: [][]string{attach, detach}},
		{
			name:  "a failed detach is retried with -force",
			fake:  archivetest.Hdiutil{Detach: archivetest.RefuseUnlessForced},
			calls: [][]string{attach, detach, forceDetach},
		},
		{
			name:    "a detach that fails even with -force fails the install and leaves the volume",
			fake:    archivetest.Hdiutil{Detach: func(bool) error { return archivetest.ErrResourceBusy }},
			calls:   [][]string{attach, detach, forceDetach},
			wantErr: true,
		},
		{
			name:    "a mount point that still holds files after a detach is not removed recursively",
			fake:    archivetest.Hdiutil{StayMounted: true},
			calls:   [][]string{attach, detach},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := fs.NewMemFS()
			runner := exec.NewMockRunner()
			fake := tt.fake
			fake.FS = fsys
			fake.Volume = archivetest.VolumeFile(fsys, volumeBin, "app-bin")
			fake.Register(runner)
			inst := NewDmgInstaller(runner, fsys, downloader.NewDownloader(fsys, server.Client()), &SystemContext{OS: "darwin", Arch: "arm64"})
			inst.BinDir = staging

			res, err := inst.Install(context.Background(), &config.ToolConfig{
				Name:          "app",
				InstallParams: map[string]interface{}{"url": server.URL + "/App.dmg", "appName": "App.app"},
			})
			if !tt.wantErr && err != nil {
				t.Fatalf("Install = %v, want nil", err)
			}
			if tt.wantErr {
				if err == nil || !strings.Contains(err.Error(), mountPoint) {
					t.Fatalf("Install = %v, want an error naming %s", err, mountPoint)
				}
				if res != nil {
					t.Errorf("Install returned %+v along with its error", res)
				}
			}
			if got := archivetest.Calls(runner); !slices.EqualFunc(got, tt.calls, slices.Equal) {
				t.Errorf("hdiutil calls = %q, want %q", got, tt.calls)
			}
			volumeExists, _ := fsys.Exists(filepath.Join(mountPoint, volumeBin))
			if volumeExists != tt.wantErr {
				t.Errorf("volume file present after Install = %v, want %v", volumeExists, tt.wantErr)
			}
			mountPointExists, _ := fsys.Exists(mountPoint)
			if mountPointExists != tt.wantErr {
				t.Errorf("mount point present after Install = %v, want %v", mountPointExists, tt.wantErr)
			}
		})
	}
}
