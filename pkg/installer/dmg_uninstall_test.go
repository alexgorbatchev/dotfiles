package installer

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// newDarwinDmgInstaller returns a DmgInstaller for macOS, staging in /stage of a
// MemFS, whose download is served locally and whose hdiutil attaches the volume that
// volume lays out on that MemFS. It returns the tool configured with that download.
func newDarwinDmgInstaller(t *testing.T, volume func(fsys fs.FS) func(mountPoint string) error) (*DmgInstaller, *exec.MockRunner, fs.FS, *config.ToolConfig) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("dmg-content"))
	}))
	t.Cleanup(server.Close)

	runner := exec.NewMockRunner()
	registerBundlePlutil(runner)
	fsys := fs.NewMemFS()
	inst := NewDmgInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "darwin", Arch: "arm64"})
	inst.BinDir = "/stage"
	archivetest.Hdiutil{FS: fsys, Volume: volume(fsys)}.Register(runner)
	tool := &config.ToolConfig{Name: "vscode", InstallParams: map[string]interface{}{"url": server.URL}}
	return inst, runner, fsys, tool
}

// TestDmgUninstallRemovesTheInstalledBundle is the regression test for issue #174:
// the bundle whose name Install took from the volume is the one Uninstall removes,
// not one named after the tool.
func TestDmgUninstallRemovesTheInstalledBundle(t *testing.T) {
	inst, runner, fsys, tool := newDarwinDmgInstaller(t, func(fsys fs.FS) func(string) error {
		return dmgVolumeFile(fsys, "Visual Studio Code.app/Contents/MacOS/code", "code-bin")
	})
	tool.InstallParams["binaryName"] = "code"

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	const bundle = "/Applications/Visual Studio Code.app"
	if res.AppBundlePath != bundle {
		t.Fatalf("InstallResult.AppBundlePath = %q, want %q", res.AppBundlePath, bundle)
	}

	runner.Clear()
	registerBundlePlutil(runner)
	if err := inst.Uninstall(context.Background(), tool, Installation{AppBundlePath: res.AppBundlePath, AppBundleIdentifier: res.AppBundleIdentifier, AppBundleInfoPlistHash: res.AppBundleInfoPlistHash}); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}
	if _, err := fsys.Lstat(bundle); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("bundle survived: %v", err)
	}
	for _, cmd := range runner.History {
		if cmd.Name == "rm" {
			t.Fatal("uninstall shelled out to rm")
		}
	}
}

// TestDmgInstallReportsTheNamedBundle checks that a bundle named by appName is
// reported as installed too, so the record never depends on where the name came from.
func TestDmgInstallReportsTheNamedBundle(t *testing.T) {
	inst, _, _, tool := newDarwinDmgInstaller(t, func(fsys fs.FS) func(string) error {
		return dmgVolumeFile(fsys, "Code.app/Contents/MacOS/vscode", "code-bin")
	})
	tool.InstallParams["appName"] = "Code.app"

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if res.AppBundlePath != "/Applications/Code.app" {
		t.Errorf("InstallResult.AppBundlePath = %q, want /Applications/Code.app", res.AppBundlePath)
	}
}

func TestDmgUninstallRequiresRecordedIdentity(t *testing.T) {
	for _, installed := range []Installation{{}, {AppBundlePath: "/Applications/Other.app"}, {AppBundlePath: "/Users/Other.app", AppBundleIdentifier: "test.app", AppBundleInfoPlistHash: "hash"}} {
		runner := exec.NewMockRunner()
		mem := fs.NewMemFS()
		if err := dmgVolumeFile(mem, "Other.app/Contents/MacOS/app", "binary")("/Applications"); err != nil {
			t.Fatal(err)
		}
		inst := NewDmgInstaller(runner, mem, nil, &SystemContext{OS: "darwin"})
		if err := inst.Uninstall(context.Background(), &config.ToolConfig{Name: "tool", InstallParams: map[string]any{"appName": "Other.app"}}, installed); err != nil {
			t.Fatal(err)
		}
		if _, err := mem.Lstat("/Applications/Other.app"); err != nil {
			t.Fatalf("unverified bundle removed: %v", err)
		}
		if len(runner.History) != 0 {
			t.Fatal("unverified uninstall ran command")
		}
	}
}

func TestDmgUninstallOffMacOSIsANoOp(t *testing.T) {
	runner := exec.NewMockRunner()
	registerBundlePlutil(runner)
	inst := NewDmgInstaller(runner, fs.NewMemFS(), nil, &SystemContext{OS: "linux", Arch: "amd64"})
	if err := inst.Uninstall(context.Background(), &config.ToolConfig{Name: "vscode"}, Installation{}); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}
	if len(runner.History) != 0 {
		t.Errorf("Uninstall off macOS ran %d commands", len(runner.History))
	}
}

// TestDmgInstallFailsWithoutABundle covers a volume with no .app at its root. v1
// failed the install; guessing a bundle named after the tool would instead copy a
// path that is not there, or record a bundle that was never installed.
func TestDmgInstallFailsWithoutABundle(t *testing.T) {
	inst, runner, fsys, tool := newDarwinDmgInstaller(t, func(fsys fs.FS) func(string) error {
		return dmgVolumeFile(fsys, "README.txt", "read me")
	})

	_, err := inst.Install(context.Background(), tool)
	if err == nil || !strings.Contains(err.Error(), "no .app bundle found in /stage/vscode-mount") {
		t.Fatalf("Install = %v, want a no .app bundle found error", err)
	}
	if exists, _ := fsys.Exists("/Applications"); exists {
		t.Error("Install wrote to /Applications although the volume held no bundle")
	}
	assertMountedAndDetached(t, runner, "/stage/vscode-mount")
}

// TestDmgInstallReportsAnUnreadableVolume makes a volume that cannot be listed fail the
// install rather than fall back to a guessed bundle name.
func TestDmgInstallReportsAnUnreadableVolume(t *testing.T) {
	inst, _, _, tool := newDarwinDmgInstaller(t, func(fsys fs.FS) func(string) error {
		// What is attached at the mount point is a file, so it cannot be listed.
		return func(mountPoint string) error {
			if err := fsys.Remove(mountPoint); err != nil {
				return err
			}
			return fsys.WriteFile(mountPoint, []byte("not a directory"), 0o644)
		}
	})

	_, err := inst.Install(context.Background(), tool)
	if err == nil || !strings.Contains(err.Error(), "listing the mounted volume /stage/vscode-mount") {
		t.Fatalf("Install = %v, want the volume listing failure", err)
	}
}

// TestDmgInstallRefusesABundleItCouldNotUninstall fails an install whose appName
// would place the bundle anywhere but directly inside /Applications: Uninstall
// refuses to remove such a path, so the tool could never be uninstalled again.
func TestDmgInstallRefusesABundleItCouldNotUninstall(t *testing.T) {
	for _, appName := range []string{"../Users.app", "MyApp", "Sub/MyApp.app"} {
		t.Run(appName, func(t *testing.T) {
			inst, runner, fsys, tool := newDarwinDmgInstaller(t, func(fsys fs.FS) func(string) error {
				return dmgVolumeFile(fsys, appName+"/Contents/MacOS/vscode", "code-bin")
			})
			tool.InstallParams["appName"] = appName

			_, err := inst.Install(context.Background(), tool)
			want := `appName "` + appName + `" does not name a .app directly inside /Applications`
			if err == nil || !strings.Contains(err.Error(), want) {
				t.Fatalf("Install = %v, want an error containing %q", err, want)
			}
			// The name is refused before the image is downloaded or mounted.
			if calls := archivetest.Calls(runner); len(calls) != 0 {
				t.Errorf("Install ran hdiutil %q for a refused appName", calls)
			}
			for _, path := range []string{"/stage", "/Users.app", "/Applications"} {
				if exists, _ := fsys.Exists(path); exists {
					t.Errorf("Install wrote %s for a refused appName", path)
				}
			}
		})
	}
}
