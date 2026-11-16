package devtools

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestLocationResolvesSymlinkAncestors(t *testing.T) {
	for _, test := range []struct {
		name string
		fsys fs.FS
	}{
		{"isolated memory", fs.NewMemFS()},
		{"native filesystem", fs.NewOSFS()},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := filepath.Join(t.TempDir(), "folder-į")
			at := func(parts ...string) string { return filepath.Join(append([]string{root}, parts...)...) }
			for _, path := range []string{at("real", "generated", "binaries"), at("aliases")} {
				if err := test.fsys.MkdirAll(path, 0700); err != nil {
					t.Fatal(err)
				}
			}
			for link, target := range map[string]string{
				at("home"):               at("real"),
				at("aliases", "release"): "." + string(filepath.Separator) + filepath.Join("..", "real", "generated", "binaries"),
				at("aliases", "tree"):    at("real", "generated"),
			} {
				if err := test.fsys.Symlink(target, link); err != nil {
					if errors.Is(err, os.ErrPermission) {
						t.Skipf("filesystem does not permit test symlinks: %v", err)
					}
					t.Fatal(err)
				}
			}
			for _, check := range []struct {
				name, dev, managed string
				overlap            bool
			}{
				{"default under aliased home", at("home", "generated", "dev-tools"), at("real", "generated", "binaries"), false},
				{"shared home alias", at("home", "generated", "dev-tools"), at("home", "generated", "binaries"), false},
				{"similar directory prefix", at("real", "generated", "binaries-dev"), at("real", "generated", "binaries"), false},
				{"relative alias with missing descendants", at("aliases", "release", "new", "dev"), at("real", "generated", "binaries"), true},
				{"managed path aliases development ancestor", at("real", "generated"), at("aliases", "release"), true},
				{"development path aliases managed ancestor", at("aliases", "tree"), at("real", "generated", "binaries"), true},
				{"identical resolved directory", at("aliases", "release"), at("home", "generated", "binaries"), true},
			} {
				t.Run(check.name, func(t *testing.T) {
					err := ValidateLocation(test.fsys, check.dev, []string{"", check.managed})
					if check.overlap && (err == nil || !strings.Contains(err.Error(), "overlaps managed directory")) {
						t.Fatalf("alias overlap accepted: %v", err)
					}
					if !check.overlap && err != nil {
						t.Fatalf("independent directories rejected: %v", err)
					}
				})
			}
		})
	}
}

type linkFaultFS struct {
	fs.FS
	readErr error
	target  string
}

func (f linkFaultFS) Readlink(string) (string, error) { return f.target, f.readErr }

func TestLocationResolutionErrorsFailClosed(t *testing.T) {
	mem := fs.NewMemFS()
	root := filepath.Join(t.TempDir(), "virtual")
	if err := mem.MkdirAll(root, 0700); err != nil {
		t.Fatal(err)
	}
	file, loop := filepath.Join(root, "file"), filepath.Join(root, "loop")
	if err := mem.WriteFile(file, []byte("file"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := mem.Symlink("loop", loop); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name    string
		fsys    fs.FS
		dev     string
		managed []string
		want    string
	}{
		{"empty root", mem, "", nil, "empty"},
		{"non-directory", mem, file, nil, "not a directory"},
		{"managed non-directory", mem, filepath.Join(root, "dev"), []string{file}, "managed directory"},
		{"link cycle", mem, loop, nil, "too many symbolic links"},
		{"absolute path failure", faultFS{FS: mem, op: "abs", part: "virtual"}, root, nil, "injected"},
		{"stat failure", faultFS{FS: mem, op: "lstat", part: "virtual"}, root, nil, "injected"},
		{"readlink failure", linkFaultFS{FS: mem, readErr: errInjected}, loop, nil, "injected"},
		{"empty link", linkFaultFS{FS: mem}, loop, nil, "empty target"},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateLocation(test.fsys, test.dev, test.managed)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("unsafe location accepted: %v; want %s", err, test.want)
			}
		})
	}
}

func TestLocationAllowsIndependentSubtreeUnderShimContainer(t *testing.T) {
	mem := fs.NewMemFS()
	root := t.TempDir()
	for _, test := range []struct {
		dev, container string
		allow          bool
	}{
		{filepath.Join(root, "generated", "dev-tools"), root, true},
		{root, root, false},
		{root, filepath.Join(root, "bin"), false},
		{filepath.Join(root, "dev"), "", true},
	} {
		err := ValidateLocation(mem, test.dev, nil, test.container)
		if (err == nil) != test.allow {
			t.Fatalf("dev %s container %s allow=%v: %v", test.dev, test.container, test.allow, err)
		}
	}
}
