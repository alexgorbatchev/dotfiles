package installer

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// linkLayout is a home directory under a temporary root holding a private key that a
// tool's staging directory, at the depth the binaries directory really has, must never
// reach through a link.
type linkLayout struct {
	secret  string
	staging string
}

const secretMode os.FileMode = 0o600

func newLinkLayout(t *testing.T, osFS fs.FS) linkLayout {
	t.Helper()
	home := filepath.Join(t.TempDir(), "home")
	layout := linkLayout{
		secret:  filepath.Join(home, ".ssh", "id_ed25519"),
		staging: filepath.Join(home, ".dotfiles", ".generated", "binaries", "mytool", "staging"),
	}
	writeModeFile(t, osFS, layout.secret, secretMode)
	if err := osFS.MkdirAll(layout.staging, 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", layout.staging, err)
	}
	return layout
}

// writeModeFile writes a file with exactly perm, which WriteFile alone leaves to the umask.
func writeModeFile(t *testing.T, osFS fs.FS, path string, perm os.FileMode) {
	t.Helper()
	if err := osFS.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", filepath.Dir(path), err)
	}
	if err := osFS.WriteFile(path, []byte("content"), perm); err != nil {
		t.Fatalf("WriteFile(%s): %v", path, err)
	}
	if err := osFS.Chmod(path, perm); err != nil {
		t.Fatalf("Chmod(%s): %v", path, err)
	}
}

func assertMode(t *testing.T, osFS fs.FS, path string, want os.FileMode) {
	t.Helper()
	info, err := osFS.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%s): %v", path, err)
	}
	if got := info.Mode().Perm(); got != want {
		t.Errorf("mode of %s = %v, want %v", path, got, want)
	}
}

// underRoot returns a function that places an absolute test path below a temporary
// root, so that tests run on the host file system, whose Chmod follows links as the
// real one does, without touching anything outside t.TempDir().
func underRoot(t *testing.T) func(string) string {
	t.Helper()
	root := t.TempDir()
	return func(path string) string { return filepath.Join(root, path) }
}

func symlinkOrFatal(t *testing.T, osFS fs.FS, target, link string) {
	t.Helper()
	if err := osFS.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", filepath.Dir(link), err)
	}
	if err := osFS.Symlink(target, link); err != nil {
		t.Fatalf("Symlink(%s -> %s): %v", link, target, err)
	}
}

// installDmgVolume installs mytool.dmg the way a github-release or gitea-release tool
// with a .dmg asset does. The mocked hdiutil attach lays the volume out at the mount
// point with volume, which receives the mount point.
func installDmgVolume(t *testing.T, osFS fs.FS, staging string, volume func(mountPoint string)) ([]string, error) {
	t.Helper()
	// extractDmg creates its mount point in the system temporary directory.
	t.Setenv("TMPDIR", t.TempDir())
	runner := exec.NewMockRunner()
	runner.RegisterFunc("hdiutil", func(c *exec.MockCmd) error {
		if len(c.Args) > 4 && c.Args[0] == "attach" {
			volume(c.Args[4])
		}
		return nil
	})
	assetPath := filepath.Join(staging, "mytool.dmg")
	writeModeFile(t, osFS, assetPath, 0o644)
	placer := releaseAssetInstaller{fsys: osFS, extractor: archive.NewExtractor(osFS, runner)}
	return placer.install(context.Background(), assetPath, staging, &config.ToolConfig{Name: "mytool"})
}

// TestDmgBinaryLinkOutsideExtraction is the regression test for issue #172: a .dmg
// volume keeps its links, and one named after the binary must not get whatever it
// names outside the extraction made executable.
func TestDmgBinaryLinkOutsideExtraction(t *testing.T) {
	tests := []struct {
		name string
		// link returns the binary link's target and lays out anything else it needs
		// on the volume.
		link func(t *testing.T, osFS fs.FS, layout linkLayout, mountPoint string) string
	}{
		{
			name: "an absolute link",
			link: func(_ *testing.T, _ fs.FS, layout linkLayout, _ string) string { return layout.secret },
		},
		{
			// The binaries directory sits at a fixed depth below the home directory, so
			// this needs no knowledge of the user's name.
			name: "a relative link climbing out of the extraction",
			link: func(_ *testing.T, _ fs.FS, _ linkLayout, _ string) string {
				return filepath.Join("..", "..", "..", "..", "..", ".ssh", "id_ed25519")
			},
		},
		{
			// Read lexically, keys/id_ed25519 stays inside the extraction; keys itself
			// is a link out of it.
			name: "a relative link through a directory link",
			link: func(t *testing.T, osFS fs.FS, layout linkLayout, mountPoint string) string {
				symlinkOrFatal(t, osFS, filepath.Dir(layout.secret), filepath.Join(mountPoint, "keys"))
				return filepath.Join("keys", "id_ed25519")
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			osFS := fs.NewOSFS()
			layout := newLinkLayout(t, osFS)
			var target string
			bins, err := installDmgVolume(t, osFS, layout.staging, func(mountPoint string) {
				symlinkOrFatal(t, osFS, "/Applications", filepath.Join(mountPoint, "Applications"))
				target = tt.link(t, osFS, layout, mountPoint)
				symlinkOrFatal(t, osFS, target, filepath.Join(mountPoint, "mytool"))
			})
			if err == nil {
				t.Fatalf("install = %v, nil; want an error refusing the link", bins)
			}
			link := filepath.Join(layout.staging, "mytool")
			for _, want := range []string{link, target} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("install error %q does not name %q", err, want)
				}
			}
			assertMode(t, osFS, layout.secret, secretMode)
		})
	}
}

// TestDmgBinaryLinkInsideExtraction pins that a binary link that stays inside the
// extraction is still promoted and the file it names made executable.
func TestDmgBinaryLinkInsideExtraction(t *testing.T) {
	osFS := fs.NewOSFS()
	layout := newLinkLayout(t, osFS)
	bins, err := installDmgVolume(t, osFS, layout.staging, func(mountPoint string) {
		writeModeFile(t, osFS, filepath.Join(mountPoint, "libexec", "mytool-real"), 0o644)
		symlinkOrFatal(t, osFS, filepath.Join("libexec", "mytool-real"), filepath.Join(mountPoint, "mytool"))
	})
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if !slices.Equal(bins, []string{"mytool"}) {
		t.Errorf("install = %v, want [mytool]", bins)
	}
	assertMode(t, osFS, filepath.Join(layout.staging, "libexec", "mytool-real"), 0o755)
	assertMode(t, osFS, layout.secret, secretMode)
}

// TestCurlScriptBinaryLinkOutsideStaging pins that a curl-script install that leaves its
// binary as a link into the tool's own store keeps the link without changing the mode
// of the file it names, and fails rather than make that file executable.
func TestCurlScriptBinaryLinkOutsideStaging(t *testing.T) {
	tests := []struct {
		name    string
		mode    os.FileMode
		wantErr bool
	}{
		{name: "an executable target is accepted as it is", mode: 0o750},
		{name: "a target that is not executable fails the install", mode: secretMode, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			osFS := fs.NewOSFS()
			layout := newLinkLayout(t, osFS)
			store := filepath.Join(filepath.Dir(layout.staging), "store", "mytool")
			writeModeFile(t, osFS, store, tt.mode)
			link := filepath.Join(layout.staging, "mytool")
			symlinkOrFatal(t, osFS, store, link)

			inst := &CurlScriptInstaller{fsys: osFS}
			bins, err := inst.stageBinaries(&config.ToolConfig{Name: "mytool"}, layout.staging, "")
			if tt.wantErr {
				if err == nil {
					t.Fatalf("stageBinaries = %v, nil; want an error", bins)
				}
				for _, want := range []string{link, store} {
					if !strings.Contains(err.Error(), want) {
						t.Errorf("stageBinaries error %q does not name %q", err, want)
					}
				}
			} else {
				if err != nil {
					t.Fatalf("stageBinaries: %v", err)
				}
				if !slices.Equal(bins, []string{"mytool"}) {
					t.Errorf("stageBinaries = %v, want [mytool]", bins)
				}
				if got, err := osFS.Readlink(link); err != nil || got != store {
					t.Errorf("Readlink(%s) = %q, %v; want the link kept, naming %q", link, got, err, store)
				}
			}
			assertMode(t, osFS, store, tt.mode)
		})
	}
}

// TestPromoteBinariesOutsideLinkPolicy pins what each policy does with a binary link
// out of the directory being promoted, and that it is decided before anything in that
// directory is changed: the stale root entry a promotion would remove is still there.
func TestPromoteBinariesOutsideLinkPolicy(t *testing.T) {
	tests := []struct {
		name       string
		policy     OutsideLinkPolicy
		targetMode os.FileMode
		targetDir  bool
		wantErr    string
	}{
		{name: "reject refuses an executable target", policy: RejectOutsideLinks, targetMode: 0o755, wantErr: "outside the extracted archive"},
		{name: "keep accepts an executable target", policy: KeepOutsideLinks, targetMode: 0o755},
		{name: "keep refuses a target that is not executable", policy: KeepOutsideLinks, targetMode: 0o644, wantErr: "not an executable file"},
		{name: "keep refuses a directory", policy: KeepOutsideLinks, targetMode: 0o755, targetDir: true, wantErr: "not a regular file"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := fs.NewOSFS()
			at := underRoot(t)
			dest, target := at("/dest"), at("/store/mytool")
			if tt.targetDir {
				if err := fsys.MkdirAll(target, tt.targetMode); err != nil {
					t.Fatalf("MkdirAll: %v", err)
				}
			} else {
				writeModeFile(t, fsys, target, tt.targetMode)
			}
			symlinkOrFatal(t, fsys, target, at("/dest/bin/mytool"))
			writeModeFile(t, fsys, at("/dest/mytool.stale"), 0o644)
			symlinkOrFatal(t, fsys, "mytool.stale", at("/dest/mytool"))

			binaries := []interface{}{config.BinaryConfig{Name: "mytool", Pattern: "bin/mytool"}}
			got, err := PromoteBinaries(fsys, dest, "mytool", binaries, tt.policy)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) || !strings.Contains(err.Error(), at("/dest/bin/mytool")+" -> "+target) {
					t.Fatalf("PromoteBinaries = %v, %v; want an error naming the link and containing %q", got, err, tt.wantErr)
				}
				if link, err := fsys.Readlink(at("/dest/mytool")); err != nil || link != "mytool.stale" {
					t.Errorf("Readlink(/dest/mytool) = %q, %v; want the stale link left alone", link, err)
				}
			} else {
				if err != nil {
					t.Fatalf("PromoteBinaries: %v", err)
				}
				if link, err := fsys.Readlink(at("/dest/mytool")); err != nil || link != filepath.Join("bin", "mytool") {
					t.Errorf("Readlink(/dest/mytool) = %q, %v; want bin/mytool", link, err)
				}
			}
			assertMode(t, fsys, target, tt.targetMode)
		})
	}
}

// TestPromoteBinariesLinkEdgeCases covers the promotion paths a binary link can take
// besides a link straight out of destDir.
func TestPromoteBinariesLinkEdgeCases(t *testing.T) {
	tests := []struct {
		name    string
		links   map[string]string
		files   map[string]os.FileMode
		pattern string
		policy  OutsideLinkPolicy
		// symlinkFails makes the promotion fall back to renaming the match to the root.
		symlinkFails bool
		wantErr      string
		// unchanged are files whose mode the promotion must leave alone.
		unchanged map[string]os.FileMode
		// changed are files the promotion must make executable.
		changed map[string]os.FileMode
	}{
		{
			name:      "a link to a directory inside is not a binary",
			links:     map[string]string{"/dest/bin/mytool": "../lib"},
			files:     map[string]os.FileMode{"/dest/lib/real": 0o644},
			pattern:   "bin/mytool",
			wantErr:   "not a regular file",
			unchanged: map[string]os.FileMode{"/dest/lib/real": 0o644},
		},
		{
			name:      "a file followed by .. does not resolve",
			links:     map[string]string{"/dest/bin/mytool": "../lib/real/.."},
			files:     map[string]os.FileMode{"/dest/lib/real": 0o644},
			pattern:   "bin/mytool",
			wantErr:   "not a directory",
			unchanged: map[string]os.FileMode{"/dest/lib/real": 0o644},
		},
		{
			// bin/mytool -> ../lib/real names dest/lib/real; renamed to the root, the same
			// link text would name /lib/real.
			name:         "a relative link is not renamed out of its directory",
			links:        map[string]string{"/dest/bin/mytool": "../lib/real"},
			files:        map[string]os.FileMode{"/dest/lib/real": 0o644, "/lib/real": 0o755},
			pattern:      "bin/mytool",
			symlinkFails: true,
			wantErr:      "names another file once moved",
			unchanged:    map[string]os.FileMode{"/dest/lib/real": 0o644, "/lib/real": 0o755},
		},
		{
			name:         "a kept relative link is not renamed out of its directory",
			links:        map[string]string{"/dest/bin/mytool": "../lib/real"},
			files:        map[string]os.FileMode{"/dest/lib/real": 0o644, "/lib/real": 0o755},
			pattern:      "bin/mytool",
			policy:       KeepOutsideLinks,
			symlinkFails: true,
			wantErr:      "names another file once moved",
			unchanged:    map[string]os.FileMode{"/lib/real": 0o755},
		},
		{
			// Moved to the root, ../dest/lib/real would name another file inside.
			name:         "a relative link is not renamed onto another file inside",
			links:        map[string]string{"/dest/bin/mytool": "../dest/lib/real"},
			files:        map[string]os.FileMode{"/dest/dest/lib/real": 0o755, "/dest/lib/real": 0o644},
			pattern:      "bin/mytool",
			symlinkFails: true,
			wantErr:      "names another file once moved",
			unchanged:    map[string]os.FileMode{"/dest/lib/real": 0o644},
		},
		{
			name:         "an absolute link inside is renamed when symlinks are unavailable",
			links:        map[string]string{"/dest/bin/mytool": "/dest/lib/real"},
			files:        map[string]os.FileMode{"/dest/lib/real": 0o644},
			pattern:      "bin/mytool",
			symlinkFails: true,
			changed:      map[string]os.FileMode{"/dest/lib/real": 0o755},
		},
		{
			name:      "a link inside a directory that is moved aside is still refused",
			links:     map[string]string{"/dest/mytool/bin/mytool": "/store/mytool"},
			files:     map[string]os.FileMode{"/store/mytool": 0o755},
			pattern:   "mytool/bin/mytool",
			wantErr:   "outside the extracted archive",
			unchanged: map[string]os.FileMode{"/store/mytool": 0o755},
		},
		{
			name:      "a kept link inside a directory that is moved aside keeps its target's mode",
			links:     map[string]string{"/dest/mytool/bin/mytool": "/store/mytool"},
			files:     map[string]os.FileMode{"/store/mytool": 0o750},
			pattern:   "mytool/bin/mytool",
			policy:    KeepOutsideLinks,
			unchanged: map[string]os.FileMode{"/store/mytool": 0o750},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			osFS := fs.NewOSFS()
			at := underRoot(t)
			for path, mode := range tt.files {
				writeModeFile(t, osFS, at(path), mode)
			}
			for link, target := range tt.links {
				if filepath.IsAbs(target) {
					target = at(target)
				}
				symlinkOrFatal(t, osFS, target, at(link))
			}
			var fsys fs.FS = osFS
			if tt.symlinkFails {
				fsys = &faultyFS{FS: osFS, failOp: "symlink"}
			}

			binaries := []interface{}{config.BinaryConfig{Name: "mytool", Pattern: tt.pattern}}
			got, err := PromoteBinaries(fsys, at("/dest"), "mytool", binaries, tt.policy)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("PromoteBinaries = %v, %v; want an error containing %q", got, err, tt.wantErr)
				}
			} else if err != nil {
				t.Fatalf("PromoteBinaries: %v", err)
			}
			for path, mode := range tt.unchanged {
				assertMode(t, osFS, at(path), mode)
			}
			for path, mode := range tt.changed {
				assertMode(t, osFS, at(path), mode)
			}
		})
	}
}

// chmodRecorder records the paths Chmod is called with.
type chmodRecorder struct {
	fs.FS
	paths []string
}

func (c *chmodRecorder) Chmod(path string, perm os.FileMode) error {
	c.paths = append(c.paths, path)
	return c.FS.Chmod(path, perm)
}

// TestPromoteBinariesChmodsUnderDestDir pins that a destDir reached through a link (a
// dotfiles directory that is itself a symlink) is chmodded under the path the caller
// gave, so that the change is logged and tracked where the user configured it.
func TestPromoteBinariesChmodsUnderDestDir(t *testing.T) {
	osFS := fs.NewOSFS()
	at := underRoot(t)
	writeModeFile(t, osFS, at("/real-dotfiles/staging/lib/mytool"), 0o644)
	symlinkOrFatal(t, osFS, at("/real-dotfiles"), at("/dotfiles"))
	symlinkOrFatal(t, osFS, filepath.Join("lib", "mytool"), at("/real-dotfiles/staging/mytool"))
	fsys := &chmodRecorder{FS: osFS}

	dest := at("/dotfiles/staging")
	if _, err := PromoteBinaries(fsys, dest, "mytool", nil, RejectOutsideLinks); err != nil {
		t.Fatalf("PromoteBinaries: %v", err)
	}
	want := []string{filepath.Join(dest, "lib", "mytool")}
	if !slices.Equal(fsys.paths, want) {
		t.Errorf("chmodded %v, want %v", fsys.paths, want)
	}
	assertMode(t, osFS, at("/real-dotfiles/staging/lib/mytool"), 0o755)
}

// TestDisplayDestDir pins that an error names the path destDir resolves to only when it
// differs from the one the caller gave.
func TestDisplayDestDir(t *testing.T) {
	tests := []struct {
		destDir, realDestDir, want string
	}{
		{destDir: "/dest/", realDestDir: "/dest", want: "/dest/"},
		{destDir: "/var/dest", realDestDir: "/private/var/dest", want: "/var/dest (/private/var/dest)"},
	}
	for _, tt := range tests {
		p := binaryPromoter{destDir: tt.destDir, realDestDir: tt.realDestDir}
		if got := p.displayDestDir(); got != tt.want {
			t.Errorf("displayDestDir(%q, %q) = %q, want %q", tt.destDir, tt.realDestDir, got, tt.want)
		}
	}
}

// TestExtractionInstallersRejectOutsideLinks pins that curl-tar and cargo's prebuilt
// archives promote with RejectOutsideLinks: a binary link out of the directory the
// archive was extracted into fails the install and leaves the file it names alone.
func TestExtractionInstallersRejectOutsideLinks(t *testing.T) {
	tarData, err := createTarGzBytes(map[string]string{"README": "readme"})
	if err != nil {
		t.Fatalf("createTarGzBytes: %v", err)
	}
	tests := []struct {
		name    string
		install func(fsys fs.FS, binDir, url string) error
	}{
		{
			name: "curl-tar",
			install: func(fsys fs.FS, binDir, url string) error {
				inst := NewCurlTarInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), nil)
				inst.BinDir = binDir
				_, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mytool", InstallParams: map[string]interface{}{"url": url}})
				return err
			},
		},
		{
			name: "cargo prebuilt archive",
			install: func(fsys fs.FS, binDir, url string) error {
				inst := NewCargoInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, nil), &SystemContext{OS: "linux", Arch: "amd64"})
				inst.BinDir = binDir
				_, err := inst.installArchive(context.Background(), &config.ToolConfig{Name: "mytool"}, url, "mytool-quickinstall.tar.gz", "")
				return err
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write(tarData)
			}))
			t.Cleanup(server.Close)
			fsys := fs.NewOSFS()
			at := underRoot(t)
			store, binDir := at("/store/mytool"), at("/bin")
			writeModeFile(t, fsys, store, 0o644)
			// A link the archive did not ship, left beside what it extracts.
			symlinkOrFatal(t, fsys, store, filepath.Join(binDir, "mytool"))

			err := tt.install(fsys, binDir, server.URL+"/mytool.tar.gz")
			if err == nil || !strings.Contains(err.Error(), "outside the extracted archive") {
				t.Fatalf("install error = %v, want the outside link refused", err)
			}
			assertMode(t, fsys, store, 0o644)
		})
	}
}

// TestResolveLinks pins that links are resolved component by component through the
// file system, as the kernel resolves them.
func TestResolveLinks(t *testing.T) {
	fsys := fs.NewMemFS()
	writeModeFile(t, fsys, "/outside/file", 0o644)
	writeModeFile(t, fsys, "/outside/sub/file", 0o644)
	for link, target := range map[string]string{
		"/d/chain":    "hop",
		"/d/hop":      "/outside/file",
		"/d/dirlink":  "/outside/sub",
		"/d/loop-a":   "loop-b",
		"/d/loop-b":   "loop-a",
		"/d/dangling": "missing",
		"/d/slash":    "/outside/file/",
		"/d/empty":    "",
		"/d/subslash": "/outside/sub/",
	} {
		symlinkOrFatal(t, fsys, target, link)
	}
	tests := []struct {
		path    string
		want    string
		wantErr string
	}{
		{path: "/d/chain", want: "/outside/file"},
		{path: "/d/./dirlink/file", want: "/outside/sub/file"},
		// ".." after a link to a directory leaves the directory the link names, not /d.
		{path: "/d/dirlink/../file", want: "/outside/file"},
		{path: "/d/loop-a", wantErr: "too many levels of symbolic links"},
		{path: "/d/dangling", wantErr: "file does not exist"},
		{path: "/outside/file/..", wantErr: "not a directory"},
		{path: "/d/hop/.", wantErr: "not a directory"},
		{path: "d/chain", wantErr: "not an absolute path"},
		{path: "/d/slash", wantErr: "not a directory"},
		{path: "/d/empty/file", wantErr: "no such file or directory"},
		{path: "/d/subslash", want: "/outside/sub"},
		{path: "/outside/sub/", want: "/outside/sub"},
		{path: "/outside/file/", wantErr: "not a directory"},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got, err := resolveLinks(fsys, tt.path)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("resolveLinks = %q, %v; want an error containing %q", got, err, tt.wantErr)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("resolveLinks = %q, %v; want %q", got, err, tt.want)
			}
		})
	}
}

// TestCargoRootBinaryLinkOutsideRoot pins that cargo install --root keeps a binary
// left as a link to an executable outside its root, without changing that file's mode.
func TestCargoRootBinaryLinkOutsideRoot(t *testing.T) {
	server := newCargoPrereleaseServer(t, nil)
	runner := exec.NewMockRunner()
	inst, _ := newCargoGithubInstaller(server, runner)
	fsys := fs.NewOSFS()
	inst.SetFS(fsys)
	at := underRoot(t)
	inst.BinDir = at("/root")
	inst.Cargo.CratesIO.Host = server.URL
	inst.SetLogger(logger.New(logger.Config{Writer: io.Discard}))
	store := at("/store/mycrate")
	writeModeFile(t, fsys, store, 0o750)
	symlinkOrFatal(t, fsys, store, at("/root/bin/mycrate"))

	res, err := inst.Install(context.Background(), &config.ToolConfig{Name: "mycrate", InstallParams: map[string]interface{}{}})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if !slices.Equal(res.Binaries, []string{"mycrate"}) {
		t.Errorf("Install binaries = %v, want [mycrate]", res.Binaries)
	}
	assertMode(t, fsys, store, 0o750)
}

// TestFindFileWithExtensionSkipsSymlinks pins that an entry named like the file being
// looked for is returned only when it is a regular file or a real directory, never a
// link that installer -pkg or hdiutil attach would follow out of the extraction.
func TestFindFileWithExtensionSkipsSymlinks(t *testing.T) {
	osFS := fs.NewOSFS()
	dir := t.TempDir()
	outside := filepath.Join(dir, "outside")
	extracted := filepath.Join(dir, "extracted")
	writeModeFile(t, osFS, filepath.Join(outside, "Other.pkg"), 0o644)
	if err := osFS.MkdirAll(filepath.Join(outside, "Other.app"), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	// "A" sorts before "Z", so the links are met first.
	symlinkOrFatal(t, osFS, filepath.Join(outside, "Other.pkg"), filepath.Join(extracted, "A.pkg"))
	symlinkOrFatal(t, osFS, filepath.Join(outside, "Other.app"), filepath.Join(extracted, "A.app"))
	wantPkg := filepath.Join(extracted, "Z", "Real.pkg")
	writeModeFile(t, osFS, wantPkg, 0o644)
	wantApp := filepath.Join(extracted, "Z", "Real.app")
	if err := osFS.MkdirAll(wantApp, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	for ext, want := range map[string]string{".pkg": wantPkg, ".app": wantApp} {
		got, err := findFileWithExtension(osFS, extracted, ext)
		if err != nil || got != want {
			t.Errorf("findFileWithExtension(%s) = %q, %v, want %q", ext, got, err, want)
		}
	}
}
