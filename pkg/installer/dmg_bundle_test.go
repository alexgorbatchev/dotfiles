package installer

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// bundleLinks are the links of a versioned macOS framework inside an app bundle:
// Versions/Current names a directory, the framework binary names a file through it,
// and Dangling names nothing.
var bundleLinks = map[string]string{
	"Contents/Frameworks/Sparkle.framework/Versions/Current": "A",
	"Contents/Frameworks/Sparkle.framework/Sparkle":          "Versions/Current/Sparkle",
	"Contents/Frameworks/Sparkle.framework/Dangling":         "Versions/B/Missing",
}

const (
	bundleBinary   = "Contents/MacOS/app"
	bundleSparkle  = "Contents/Frameworks/Sparkle.framework/Versions/A/Sparkle"
	bundleStale    = "Contents/Resources/removed-in-this-version"
	bundleBinaryV2 = "app-binary-v2"
)

// writeBundle builds an app bundle at root whose binary holds binary, with the
// framework links in bundleLinks and, when stale is set, a file only an older
// version shipped.
func writeBundle(t *testing.T, fsys fs.FS, root, binary string, stale bool) {
	t.Helper()
	files := map[string]string{bundleBinary: binary, bundleSparkle: "sparkle"}
	if stale {
		files[bundleStale] = "old"
	}
	for rel, content := range files {
		path := filepath.Join(root, rel)
		if err := fsys.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		if err := fsys.WriteFile(path, []byte(content), 0o755); err != nil {
			t.Fatalf("WriteFile(%s): %v", path, err)
		}
	}
	for rel, target := range bundleLinks {
		if err := fsys.Symlink(target, filepath.Join(root, rel)); err != nil {
			t.Fatalf("Symlink(%s): %v", rel, err)
		}
	}
}

func assertBundle(t *testing.T, fsys fs.FS, root, binary string) {
	t.Helper()
	data, err := fsys.ReadFile(filepath.Join(root, bundleBinary))
	if err != nil || string(data) != binary {
		t.Errorf("%s holds %q (err %v), want %q", bundleBinary, data, err, binary)
	}
	for rel, want := range bundleLinks {
		path := filepath.Join(root, rel)
		info, err := fsys.Lstat(path)
		if err != nil {
			t.Errorf("Lstat(%s): %v", path, err)
			continue
		}
		if info.Mode()&os.ModeSymlink == 0 {
			t.Errorf("%s mode = %v, want a symlink", rel, info.Mode())
			continue
		}
		if got, err := fsys.Readlink(path); err != nil || got != want {
			t.Errorf("%s links to %q (err %v), want %q", rel, got, err, want)
		}
	}
}

func assertOnlyEntry(t *testing.T, fsys fs.FS, dir, name string) {
	t.Helper()
	assertEntries(t, fsys, dir, []string{name})
}

// assertEntries checks that dir holds exactly want, in any order.
func assertEntries(t *testing.T, fsys fs.FS, dir string, want []string) {
	t.Helper()
	entries, err := fsys.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir(%s): %v", dir, err)
	}
	slices.Sort(entries)
	slices.Sort(want)
	if !slices.Equal(entries, want) {
		t.Errorf("%s holds %v, want %v", dir, entries, want)
	}
}

var errBundleFault = errors.New("injected fault")

// bundleFaultFS fails the operations its fail function picks, by name ("copy",
// "rename", "removeall", "lstat") and the path acted on (the source of a copy, the new
// name of a rename).
type bundleFaultFS struct {
	fs.FS
	fail func(op, path string) bool
}

func (b bundleFaultFS) CopyFile(src, dest string) error {
	if b.fail("copy", src) {
		return errBundleFault
	}
	return b.FS.CopyFile(src, dest)
}

func (b bundleFaultFS) Rename(oldname, newname string) error {
	if b.fail("rename", newname) {
		return errBundleFault
	}
	return b.FS.Rename(oldname, newname)
}

func (b bundleFaultFS) RemoveAll(path string) error {
	if b.fail("removeall", path) {
		return errBundleFault
	}
	return b.FS.RemoveAll(path)
}

func (b bundleFaultFS) Lstat(path string) (os.FileInfo, error) {
	if b.fail("lstat", path) {
		return nil, errBundleFault
	}
	return b.FS.Lstat(path)
}

// failNth fails the nth operation op on path, counting from 1.
func failNth(op, path string, n int) func(string, string) bool {
	seen := 0
	return func(gotOp, gotPath string) bool {
		if gotOp != op || gotPath != path {
			return false
		}
		seen++
		return seen == n
	}
}

// TestInstallAppBundle runs the copy against the host filesystem, so OSFS's CopyFile,
// Symlink and Rename semantics apply, as they do for a real /Applications.
func TestInstallAppBundle(t *testing.T) {
	const installedBinary = "app-binary-v1"
	setup := func(t *testing.T, existing bool) (fs.FS, string, string) {
		t.Helper()
		osFS := fs.NewOSFS()
		dir := t.TempDir()
		src := filepath.Join(dir, "vol", "App.app")
		dest := filepath.Join(dir, "Applications", "App.app")
		writeBundle(t, osFS, src, bundleBinaryV2, false)
		if existing {
			writeBundle(t, osFS, dest, installedBinary, true)
		} else if err := osFS.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		return osFS, src, dest
	}

	t.Run("reproduces every symlink of a new bundle", func(t *testing.T) {
		osFS, src, dest := setup(t, false)
		if err := installAppBundle(osFS, nil, src, dest); err != nil {
			t.Fatalf("installAppBundle = %v, want nil", err)
		}
		assertBundle(t, osFS, dest, bundleBinaryV2)
		assertOnlyEntry(t, osFS, filepath.Dir(dest), "App.app")
	})

	t.Run("replaces an existing bundle instead of merging into it", func(t *testing.T) {
		osFS, src, dest := setup(t, true)
		if err := installAppBundle(osFS, nil, src, dest); err != nil {
			t.Fatalf("installAppBundle = %v, want nil", err)
		}
		assertBundle(t, osFS, dest, bundleBinaryV2)
		if exists, _ := osFS.Exists(filepath.Join(dest, bundleStale)); exists {
			t.Errorf("%s survived the reinstall", bundleStale)
		}
		assertOnlyEntry(t, osFS, filepath.Dir(dest), "App.app")
	})

	t.Run("discards what an interrupted install left beside the bundle", func(t *testing.T) {
		osFS, src, dest := setup(t, true)
		writeBundle(t, osFS, bundleSibling(dest, stagingBundlePrefix), "partial", true)
		writeBundle(t, osFS, bundleSibling(dest, previousBundlePrefix), "older", true)
		if err := installAppBundle(osFS, nil, src, dest); err != nil {
			t.Fatalf("installAppBundle = %v, want nil", err)
		}
		assertBundle(t, osFS, dest, bundleBinaryV2)
		if exists, _ := osFS.Exists(filepath.Join(dest, bundleStale)); exists {
			t.Errorf("a leftover copy's %s reached the installed bundle", bundleStale)
		}
		assertOnlyEntry(t, osFS, filepath.Dir(dest), "App.app")
	})

	t.Run("a failure removing the replaced bundle is a warning", func(t *testing.T) {
		osFS, src, dest := setup(t, true)
		previous := bundleSibling(dest, previousBundlePrefix)
		faulty := bundleFaultFS{FS: osFS, fail: failNth("removeall", previous, 2)}
		var out bytes.Buffer
		log := logger.New(logger.Config{Writer: &out})

		if err := installAppBundle(faulty, log, src, dest); err != nil {
			t.Fatalf("installAppBundle = %v, want nil once the new bundle is in place", err)
		}
		assertBundle(t, osFS, dest, bundleBinaryV2)
		assertBundle(t, osFS, previous, installedBinary)
		if !strings.Contains(out.String(), previous) || !strings.Contains(out.String(), errBundleFault.Error()) {
			t.Errorf("log = %q, want a warning naming %s and the cause", out.String(), previous)
		}
	})

	// Every step can fail. Until the new bundle has been moved into place, a failure
	// must leave the installed bundle as it was and nothing beside it.
	tests := []struct {
		name     string
		existing bool
		fail     func(src, dest string) func(string, string) bool
		// want is the binary dest holds afterwards and wantAside the one the
		// previous-bundle sibling holds, "" for none. No other entry may remain.
		want, wantAside string
	}{
		{
			name:     "copying the new bundle",
			existing: true,
			fail: func(src, _ string) func(string, string) bool {
				return failNth("copy", filepath.Join(src, bundleSparkle), 1)
			},
			want: installedBinary,
		},
		{
			name:     "removing an incomplete staging copy",
			existing: true,
			fail: func(_, dest string) func(string, string) bool {
				return failNth("removeall", bundleSibling(dest, stagingBundlePrefix), 1)
			},
			want: installedBinary,
		},
		{
			name:     "checking for an installed bundle",
			existing: true,
			fail: func(_, dest string) func(string, string) bool {
				return failNth("lstat", dest, 1)
			},
			want: installedBinary,
		},
		{
			name:     "removing a previous bundle left by an earlier install",
			existing: true,
			fail: func(_, dest string) func(string, string) bool {
				return failNth("removeall", bundleSibling(dest, previousBundlePrefix), 1)
			},
			want: installedBinary,
		},
		{
			name:     "moving the installed bundle aside",
			existing: true,
			fail: func(_, dest string) func(string, string) bool {
				return failNth("rename", bundleSibling(dest, previousBundlePrefix), 1)
			},
			want: installedBinary,
		},
		{
			name:     "moving the new bundle into place",
			existing: true,
			fail: func(_, dest string) func(string, string) bool {
				return failNth("rename", dest, 1)
			},
			want: installedBinary,
		},
		{
			name:     "moving the new bundle into place with nothing installed",
			existing: false,
			fail: func(_, dest string) func(string, string) bool {
				return failNth("rename", dest, 1)
			},
			want: "",
		},
		{
			name:     "moving the new bundle into place and restoring the installed one",
			existing: true,
			fail: func(_, dest string) func(string, string) bool {
				return func(op, path string) bool { return op == "rename" && path == dest }
			},
			// The installed bundle is still whole, under the previous-bundle name.
			want: "", wantAside: installedBinary,
		},
	}
	for _, tt := range tests {
		t.Run("a failure "+tt.name+" is reported", func(t *testing.T) {
			osFS, src, dest := setup(t, tt.existing)
			faulty := bundleFaultFS{FS: osFS, fail: tt.fail(src, dest)}

			if err := installAppBundle(faulty, nil, src, dest); !errors.Is(err, errBundleFault) {
				t.Fatalf("installAppBundle = %v, want %v", err, errBundleFault)
			}

			assertBundleAt(t, osFS, dest, tt.want)
			previous := bundleSibling(dest, previousBundlePrefix)
			assertBundleAt(t, osFS, previous, tt.wantAside)

			var wantEntries []string
			if tt.want != "" {
				wantEntries = append(wantEntries, filepath.Base(dest))
			}
			if tt.wantAside != "" {
				wantEntries = append(wantEntries, filepath.Base(previous))
			}
			assertEntries(t, osFS, filepath.Dir(dest), wantEntries)
		})
	}
}

// assertBundleAt checks that root holds a bundle whose binary is binary, or, for an
// empty binary, that nothing is at root.
func assertBundleAt(t *testing.T, fsys fs.FS, root, binary string) {
	t.Helper()
	if binary != "" {
		assertBundle(t, fsys, root, binary)
		return
	}
	if _, err := fsys.Lstat(root); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("Lstat(%s) = %v, want nothing there", root, err)
	}
}

// TestFindFileWithExtensionDoesNotFollowSymlinks covers an extracted .dmg volume, which
// keeps its links: the drag-to-install link to /Applications (here, to a directory
// holding a decoy package) must not be searched, and a link to its own directory must
// not loop.
func TestFindFileWithExtensionDoesNotFollowSymlinks(t *testing.T) {
	osFS := fs.NewOSFS()
	dir := t.TempDir()
	outside := filepath.Join(dir, "host-applications")
	extracted := filepath.Join(dir, "extracted")
	decoy := filepath.Join(outside, "Other.app", "Contents", "Resources", "decoy.pkg")
	want := filepath.Join(extracted, "Nested", "Real.pkg")
	for _, path := range []string{decoy, want} {
		if err := osFS.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		if err := osFS.WriteFile(path, []byte("pkg"), 0o644); err != nil {
			t.Fatalf("WriteFile(%s): %v", path, err)
		}
	}
	for name, target := range map[string]string{"Applications": outside, "loop": "."} {
		if err := osFS.Symlink(target, filepath.Join(extracted, name)); err != nil {
			t.Fatalf("Symlink(%s): %v", name, err)
		}
	}

	got, err := findFileWithExtension(osFS, extracted, ".pkg")
	if err != nil || got != want {
		t.Errorf("findFileWithExtension = %q, %v, want %q", got, err, want)
	}
}
