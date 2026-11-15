package installer

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const testBundlePlist = `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>test.app</string></dict></plist>`

func dmgVolumeFile(fsys fs.FS, relative, content string) func(string) error {
	return func(mount string) error {
		if err := archivetest.VolumeFile(fsys, relative, content)(mount); err != nil {
			return err
		}
		app, _, ok := strings.Cut(relative, ".app/")
		if !ok {
			return nil
		}
		plist := filepath.Join(mount, app+".app", "Contents", "Info.plist")
		if err := fsys.MkdirAll(filepath.Dir(plist), 0755); err != nil {
			return err
		}
		return fsys.WriteFile(plist, []byte(testBundlePlist), 0644)
	}
}

func registerBundlePlutil(runner *exec.MockRunner) {
	runner.Register("plutil", []byte("test.app\n"), nil)
}

func TestReadAppBundleIdentity(t *testing.T) {
	mem := fs.NewMemFS()
	runner := exec.NewMockRunner()
	if err := dmgVolumeFile(mem, "App.app/Contents/MacOS/app", "binary")("/Applications"); err != nil {
		t.Fatal(err)
	}
	runner.RegisterFunc("plutil", func(cmd *exec.MockCmd) error {
		data, err := io.ReadAll(cmd.Stdin())
		if err != nil {
			return err
		}
		if string(data) != testBundlePlist {
			t.Errorf("parser received %q", data)
		}
		cmd.SetOutput([]byte("test.app\n"))
		return nil
	})
	identity, err := readAppBundleIdentity(context.Background(), mem, runner, "/Applications/App.app")
	if err != nil || identity.identifier != "test.app" || identity.hash != fs.HashContent([]byte(testBundlePlist)) {
		t.Fatalf("identity %+v, %v", identity, err)
	}
	for _, test := range []struct {
		name   string
		modify func()
		want   string
	}{
		{"command error", func() { runner.Register("plutil", nil, os.ErrPermission) }, "permission denied"},
		{"empty identifier", func() { runner.Register("plutil", nil, nil) }, "no CFBundleIdentifier"},
		{"symlink plist", func() {
			_ = mem.Remove("/Applications/App.app/Contents/Info.plist")
			_ = mem.Symlink("/outside", "/Applications/App.app/Contents/Info.plist")
		}, "not a regular file"},
		{"missing plist", func() { _ = mem.Remove("/Applications/App.app/Contents/Info.plist") }, "Info.plist"},
		{"symlink Contents", func() {
			_ = mem.RemoveAll("/Applications/App.app/Contents")
			_ = mem.Symlink("/outside", "/Applications/App.app/Contents")
		}, "not a real directory"},
		{"missing Contents", func() { _ = mem.Remove("/Applications/App.app/Contents") }, "Contents"},
	} {
		t.Run(test.name, func(t *testing.T) {
			test.modify()
			if _, err := readAppBundleIdentity(context.Background(), mem, runner, "/Applications/App.app"); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error %v", err)
			}
		})
	}
}

func TestReadAppBundleIdentityReadFailure(t *testing.T) {
	mem := fs.NewMemFS()
	runner := exec.NewMockRunner()
	if err := dmgVolumeFile(mem, "App.app/Contents/MacOS/app", "binary")("/Applications"); err != nil {
		t.Fatal(err)
	}
	_, err := readAppBundleIdentity(context.Background(), bundleReadFaultFS{mem}, runner, "/Applications/App.app")
	if !errors.Is(err, os.ErrPermission) {
		t.Fatalf("lost read error: %v", err)
	}
}

type bundleReadFaultFS struct{ fs.FS }

func (f bundleReadFaultFS) ReadFile(string) ([]byte, error) { return nil, os.ErrPermission }

func TestDmgIdentityFailurePreservesInstalledApp(t *testing.T) {
	inst, runner, fsys, tool := newDarwinDmgInstaller(t, func(fsys fs.FS) func(string) error {
		return dmgVolumeFile(fsys, "Code.app/Contents/MacOS/code", "new")
	})
	if err := dmgVolumeFile(fsys, "Code.app/Contents/MacOS/code", "installed")("/Applications"); err != nil {
		t.Fatal(err)
	}
	runner.Register("plutil", nil, errors.New("malformed plist"))
	if _, err := inst.Install(context.Background(), tool); err == nil || !strings.Contains(err.Error(), "identifying source bundle") {
		t.Fatalf("bad identity accepted: %v", err)
	}
	got, err := fsys.ReadFile("/Applications/Code.app/Contents/MacOS/code")
	if err != nil || string(got) != "installed" {
		t.Fatalf("replaced existing app with unreadable identity: %q, %v", got, err)
	}
}
