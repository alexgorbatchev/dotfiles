package installer

import (
	"context"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// newMacReleaseServer serves owner/app releases: the listing carries a
// prerelease as its newest entry, releases/latest answers 404 the way GitHub does
// for a repository whose only release is a prerelease, and the tagged release
// v1.2.3 is served for the non-prerelease cases, and v1.1.0 by its tag. ext is ".dmg"
// or ".pkg".
func newMacReleaseServer(t *testing.T, ext string) *recordingServer {
	t.Helper()
	var server *recordingServer
	server = newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
		download := "http://" + r.Host + "/download/app-darwin-arm64" + ext
		switch r.URL.Path {
		case "/repos/owner/app/releases":
			_, _ = w.Write([]byte(`[{"tag_name":"v2.0.0-beta.1","prerelease":true,"assets":[{"name":"app-darwin-arm64` + ext + `","browser_download_url":"` + download + `"}]}]`))
		case "/repos/owner/app/releases/latest":
			w.WriteHeader(http.StatusNotFound)
		case "/repos/owner/app/releases/tags/v1.1.0":
			_, _ = w.Write([]byte(`{"tag_name":"v1.1.0","assets":[{"name":"app-darwin-arm64` + ext + `","browser_download_url":"` + download + `"}]}`))
		case "/repos/owner/stable/releases/latest":
			_, _ = w.Write([]byte(`{"tag_name":"v1.2.3","assets":[{"name":"app-darwin-arm64` + ext + `","browser_download_url":"` + download + `"}]}`))
		case "/download/app-darwin-arm64" + ext:
			_, _ = w.Write([]byte("payload"))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	return server
}

// registerGhMock makes the mock `gh` answer `gh api` with release JSON and make
// `gh release download` place the asset into the requested directory.
func registerGhMock(runner *exec.MockRunner, fsys fs.FS, releaseJSON string) {
	runner.RegisterFunc("gh", func(c *exec.MockCmd) error {
		if len(c.Args) > 0 && c.Args[0] == "api" {
			c.SetOutput([]byte(releaseJSON))
			return nil
		}
		dir, pattern := "", ""
		for i, arg := range c.Args {
			if arg == "--dir" && i+1 < len(c.Args) {
				dir = c.Args[i+1]
			}
			if arg == "--pattern" && i+1 < len(c.Args) {
				pattern = c.Args[i+1]
			}
		}
		_ = fsys.MkdirAll(dir, 0755)
		return fsys.WriteFile(filepath.Join(dir, pattern), []byte("gh-payload"), 0644)
	})
}

// registerVersionMock makes the mock runner answer the given binary with output.
func registerVersionMock(runner *exec.MockRunner, binaryPath, output string) {
	runner.Register(binaryPath, []byte(output), nil)
}

func commandRan(runner *exec.MockRunner, name string, firstArg string) bool {
	for _, cmd := range runner.History {
		if cmd.Name == name && (firstArg == "" || (len(cmd.Args) > 0 && cmd.Args[0] == firstArg)) {
			return true
		}
	}
	return false
}

// TestDmgInstallerReleaseParameters covers the dmg parameters issue #31 found
// ignored: source.prerelease, source.ghCli, versionArgs and versionRegex.
func TestDmgInstallerReleaseParameters(t *testing.T) {
	const appBinary = "/Applications/App.app/Contents/MacOS/app"

	newInstaller := func(t *testing.T, server *recordingServer) (*DmgInstaller, *exec.MockRunner, fs.FS) {
		t.Helper()
		runner := exec.NewMockRunner()
		fsys := fs.NewMemFS()
		inst := NewDmgInstaller(runner, fsys, downloader.NewDownloader(fsys, server.Client()), &SystemContext{OS: "darwin", Arch: "arm64"})
		inst.SetHTTPClient(server.Client())
		inst.BaseURL = server.URL
		inst.BinDir = "/test/dmg-params"
		// The mounted image the mock hdiutil "attaches".
		archivetest.Hdiutil{FS: fsys, Volume: archivetest.VolumeFile(fsys, "App.app/Contents/MacOS/app", "app-bin")}.Register(runner)
		return inst, runner, fsys
	}

	t.Run("prerelease consults the releases listing", func(t *testing.T) {
		server := newMacReleaseServer(t, ".dmg")
		inst, _, _ := newInstaller(t, server)

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source":  map[string]interface{}{"type": "github-release", "repo": "owner/app", "prerelease": true},
				"appName": "App.app",
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !server.requested("/repos/owner/app/releases") {
			t.Fatalf("expected the releases listing to be consulted, got %v", server.paths)
		}
		if res.Version != "v2.0.0-beta.1" {
			t.Fatalf("expected the prerelease tag as version, got %q", res.Version)
		}
	})

	// source.version is the pin config.ToolConfig.RequestedVersion names for dmg, and
	// the one update refuses to move, so it must be what the installation fetches.
	t.Run("source.version selects the release by tag over .version()", func(t *testing.T) {
		server := newMacReleaseServer(t, ".dmg")
		inst, _, _ := newInstaller(t, server)
		dotVersion := "v9.9.9"

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name:               "app",
			InstallationMethod: "dmg",
			Version:            &dotVersion,
			InstallParams: map[string]interface{}{
				"source":  map[string]interface{}{"type": "github-release", "repo": "owner/app", "version": "v1.1.0"},
				"appName": "App.app",
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !server.requested("/repos/owner/app/releases/tags/v1.1.0") {
			t.Fatalf("expected the v1.1.0 release to be fetched by tag, got %v", server.paths)
		}
		if res.Version != "v1.1.0" {
			t.Fatalf("expected version v1.1.0, got %q", res.Version)
		}
	})

	t.Run("ghCli resolves and downloads through gh", func(t *testing.T) {
		server := newMacReleaseServer(t, ".dmg")
		inst, runner, fsys := newInstaller(t, server)
		registerGhMock(runner, fsys, `{"tag_name":"v3.0.0","assets":[{"name":"app-darwin-arm64.dmg","browser_download_url":"http://unreachable.invalid/app.dmg"}]}`)

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source":  map[string]interface{}{"type": "github-release", "repo": "owner/app", "ghCli": true},
				"appName": "App.app",
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(server.paths) != 0 {
			t.Fatalf("ghCli must not touch the REST API or HTTP download, got %v", server.paths)
		}
		if !commandRan(runner, "gh", "api") || !commandRan(runner, "gh", "release") {
			t.Fatalf("expected gh api and gh release download to run, got %v", runner.History)
		}
		if res.Version != "v3.0.0" {
			t.Fatalf("expected version v3.0.0, got %q", res.Version)
		}
	})

	t.Run("versionArgs and versionRegex detect the installed version", func(t *testing.T) {
		server := newMacReleaseServer(t, ".dmg")
		inst, runner, _ := newInstaller(t, server)
		registerVersionMock(runner, appBinary, "App version v5.1.0 (stable)\n")

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source":       map[string]interface{}{"type": "url", "url": server.URL + "/download/app-darwin-arm64.dmg"},
				"appName":      "App.app",
				"versionArgs":  []interface{}{"--version"},
				"versionRegex": `v(\d+\.\d+\.\d+)`,
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Version != "5.1.0" {
			t.Fatalf("expected detected version 5.1.0, got %q", res.Version)
		}
		ran := false
		for _, cmd := range runner.History {
			if cmd.Name == appBinary && strings.Join(cmd.Args, " ") == "--version" {
				ran = true
			}
		}
		if !ran {
			t.Fatalf("expected %s --version to run, got %v", appBinary, runner.History)
		}
	})

	t.Run("release tag is the version when versionArgs is absent", func(t *testing.T) {
		server := newMacReleaseServer(t, ".dmg")
		inst, runner, _ := newInstaller(t, server)

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source":  map[string]interface{}{"type": "github-release", "repo": "owner/stable"},
				"appName": "App.app",
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Version != "v1.2.3" {
			t.Fatalf("expected release tag v1.2.3 as version, got %q", res.Version)
		}
		if commandRan(runner, appBinary, "") {
			t.Fatalf("the app binary must not be executed without versionArgs, got %v", runner.History)
		}
	})
}
