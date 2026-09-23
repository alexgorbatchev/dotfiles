package installer

import (
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// TestPkgInstallerReleaseParameters covers the pkg parameters issue #31 found
// ignored: source.prerelease, source.ghCli, versionArgs, versionRegex and
// binaryPath.
func TestPkgInstallerReleaseParameters(t *testing.T) {
	const installedBinary = "/opt/app/bin/app"

	newInstaller := func(t *testing.T, server *recordingServer) (*PkgInstaller, *exec.MockRunner, fs.FS) {
		t.Helper()
		runner := exec.NewMockRunner()
		fsys := fs.NewMemFS()
		inst := NewPkgInstaller(runner, fsys, downloader.NewDownloader(fsys, server.Client()), &SystemContext{OS: "darwin", Arch: "arm64"})
		inst.SetHTTPClient(server.Client())
		inst.BaseURL = server.URL
		inst.BinDir = "/test/pkg-params"
		// What the (mocked) installer command leaves behind.
		_ = fsys.MkdirAll("/opt/app/bin", 0755)
		_ = fsys.WriteFile(installedBinary, []byte("app-bin"), 0755)
		return inst, runner, fsys
	}

	urlSource := func(server *recordingServer) map[string]interface{} {
		return map[string]interface{}{"type": "url", "url": server.URL + "/download/app-darwin-arm64.pkg"}
	}

	t.Run("prerelease consults the releases listing", func(t *testing.T) {
		server := newMacReleaseServer(t, ".pkg")
		inst, _, _ := newInstaller(t, server)

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{"type": "github-release", "repo": "owner/app", "prerelease": true},
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

	// source.version is the pin config.ToolConfig.RequestedVersion names for pkg, and
	// the one update refuses to move, so it must be what the installation fetches.
	t.Run("source.version selects the release by tag over .version()", func(t *testing.T) {
		server := newMacReleaseServer(t, ".pkg")
		inst, _, _ := newInstaller(t, server)
		dotVersion := "v9.9.9"

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name:               "app",
			InstallationMethod: "pkg",
			Version:            &dotVersion,
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{"type": "github-release", "repo": "owner/app", "version": "v1.1.0"},
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
		server := newMacReleaseServer(t, ".pkg")
		inst, runner, fsys := newInstaller(t, server)
		registerGhMock(runner, fsys, `{"tag_name":"v3.0.0","assets":[{"name":"app-darwin-arm64.pkg","browser_download_url":"http://unreachable.invalid/app.pkg"}]}`)

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{"type": "github-release", "repo": "owner/app", "ghCli": true},
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

	t.Run("binaryPath is the first binary and versionArgs run against it", func(t *testing.T) {
		server := newMacReleaseServer(t, ".pkg")
		inst, runner, _ := newInstaller(t, server)
		registerVersionMock(runner, installedBinary, "app 1.4.2\n")

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name:     "app",
			Binaries: testutil.DeclaredBinaries("app", "helper"),
			InstallParams: map[string]interface{}{
				"source":       urlSource(server),
				"binaryPath":   installedBinary,
				"versionArgs":  []interface{}{"--version"},
				"versionRegex": `(\d+\.\d+\.\d+)`,
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{installedBinary, "/usr/local/bin/helper"}
		if strings.Join(res.Binaries, " ") != strings.Join(want, " ") {
			t.Fatalf("binaries = %v, want %v", res.Binaries, want)
		}
		if res.Version != "1.4.2" {
			t.Fatalf("expected detected version 1.4.2, got %q", res.Version)
		}
	})

	t.Run("missing binaryPath after installation is an error", func(t *testing.T) {
		server := newMacReleaseServer(t, ".pkg")
		inst, _, _ := newInstaller(t, server)

		_, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source":     urlSource(server),
				"binaryPath": "/opt/app/bin/missing",
			},
		})
		if err == nil || !strings.Contains(err.Error(), "binaryPath") {
			t.Fatalf("expected a binaryPath error, got %v", err)
		}
	})

	t.Run("release tag is the version when versionArgs is absent", func(t *testing.T) {
		server := newMacReleaseServer(t, ".pkg")
		inst, runner, _ := newInstaller(t, server)

		res, err := inst.Install(context.Background(), &config.ToolConfig{
			Name: "app",
			InstallParams: map[string]interface{}{
				"source":     map[string]interface{}{"type": "github-release", "repo": "owner/stable"},
				"binaryPath": installedBinary,
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Version != "v1.2.3" {
			t.Fatalf("expected release tag v1.2.3 as version, got %q", res.Version)
		}
		if commandRan(runner, installedBinary, "") {
			t.Fatalf("the binary must not be executed without versionArgs, got %v", runner.History)
		}
	})
}
