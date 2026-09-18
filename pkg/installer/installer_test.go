package installer

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type mockInstaller struct {
	name         string
	supportsSudo bool
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.supportsSudo
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	return &InstallResult{}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{}, nil
}

func TestRegistry_RegisterAndGet(t *testing.T) {
	reg := NewRegistry()

	inst := &mockInstaller{name: "test-inst"}

	// Successfully register
	if err := reg.Register(inst); err != nil {
		t.Fatalf("unexpected error registering installer: %v", err)
	}

	// Register duplicate should fail
	if err := reg.Register(inst); err == nil {
		t.Fatal("expected error registering duplicate installer, got nil")
	}

	// Register nil should fail
	if err := reg.Register(nil); err == nil {
		t.Fatal("expected error registering nil installer, got nil")
	}

	// Register empty name should fail
	if err := reg.Register(&mockInstaller{name: ""}); err == nil {
		t.Fatal("expected error registering empty name, got nil")
	}

	// Get registered installer
	found, err := reg.Get("test-inst")
	if err != nil {
		t.Fatalf("unexpected error getting installer: %v", err)
	}
	if found != inst {
		t.Errorf("expected to find registered installer %v, got %v", inst, found)
	}

	// Get unregistered installer should fail
	if _, err := reg.Get("nonexistent"); err == nil {
		t.Fatal("expected error getting unregistered installer, got nil")
	}
}

func TestRegistry_List(t *testing.T) {
	reg := NewRegistry()

	_ = reg.Register(&mockInstaller{name: "inst1"})
	_ = reg.Register(&mockInstaller{name: "inst2"})

	list := reg.List()
	if len(list) != 2 {
		t.Fatalf("expected 2 registered installers, got %d", len(list))
	}

	hasInst1 := false
	hasInst2 := false
	for _, name := range list {
		if name == "inst1" {
			hasInst1 = true
		}
		if name == "inst2" {
			hasInst2 = true
		}
	}

	if !hasInst1 || !hasInst2 {
		t.Errorf("expected list to contain both inst1 and inst2, got: %v", list)
	}
}

func TestGlobalRegistry(t *testing.T) {
	reg := DefaultRegistry()
	if reg == nil {
		t.Fatal("expected DefaultRegistry() to return a valid registry, got nil")
	}

	inst := &mockInstaller{name: "global-inst"}
	if err := Register(inst); err != nil {
		t.Fatalf("unexpected error registering to global registry: %v", err)
	}

	found, err := Get("global-inst")
	if err != nil {
		t.Fatalf("unexpected error getting from global registry: %v", err)
	}
	if found != inst {
		t.Errorf("expected to find %v in global registry, got %v", inst, found)
	}
}

func TestRegistry_ZeroValue(t *testing.T) {
	var reg Registry // zero value, uninitialized installers map

	// List should return nil and not panic
	if list := reg.List(); list != nil {
		t.Fatalf("expected nil list for zero value registry, got %v", list)
	}

	// Get should return error and not panic
	if _, err := reg.Get("any"); err == nil {
		t.Fatal("expected error on get from zero-value registry, got nil")
	}

	// Register should initialize and succeed
	inst := &mockInstaller{name: "any"}
	if err := reg.Register(inst); err != nil {
		t.Fatalf("expected registration to succeed on zero-value registry, got: %v", err)
	}

	// Now List and Get should work
	if list := reg.List(); len(list) != 1 || list[0] != "any" {
		t.Fatalf("expected list of length 1, got %v", list)
	}

	if found, err := reg.Get("any"); err != nil || found != inst {
		t.Fatalf("expected to get registered installer, got: %v, %v", found, err)
	}
}

// assertLink fails unless dest/name is a symlink to target.
func assertLink(t *testing.T, fsys fs.FS, dest, name, target string) {
	t.Helper()
	got, err := fsys.Readlink(filepath.Join(dest, name))
	if err != nil {
		t.Fatalf("expected %s to be a symlink: %v", name, err)
	}
	if got != filepath.FromSlash(target) {
		t.Fatalf("%s links to %q, want %q", name, got, target)
	}
}

// assertExecutableFile fails unless dest/name is a regular, executable file.
func assertExecutableFile(t *testing.T, fsys fs.FS, dest, name string) {
	t.Helper()
	info, err := fsys.Lstat(filepath.Join(dest, name))
	if err != nil {
		t.Fatalf("expected %s at the root: %v", name, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || info.IsDir() {
		t.Fatalf("expected %s to be a regular file, got mode %v", name, info.Mode())
	}
	if info.Mode()&0111 == 0 {
		t.Fatalf("expected %s to be executable, got mode %v", name, info.Mode())
	}
}

func TestPromoteBinaries(t *testing.T) {
	const dest = "/dest"
	binary := func(name, pattern string) map[string]interface{} {
		return map[string]interface{}{"name": name, "pattern": pattern}
	}
	tests := []struct {
		name     string
		files    map[string]os.FileMode
		symlinks map[string]string
		binaries []interface{}
		tool     string
		want     []string
		wantErr  string
		check    func(t *testing.T, fsys fs.FS)
	}{
		{
			name:  "root binary is made executable in place",
			files: map[string]os.FileMode{"tool": 0644},
			tool:  "tool",
			want:  []string{"tool"},
			check: func(t *testing.T, fsys fs.FS) {
				assertExecutableFile(t, fsys, dest, "tool")
			},
		},
		{
			name:  "one-level binary is linked from the root",
			files: map[string]os.FileMode{"tool-1.0/tool": 0755, "tool-1.0/LICENSE": 0644},
			tool:  "tool",
			want:  []string{"tool"},
			check: func(t *testing.T, fsys fs.FS) {
				assertLink(t, fsys, dest, "tool", "tool-1.0/tool")
			},
		},
		{
			name:     "glob pattern reaches a bin subdirectory and keeps the layout",
			files:    map[string]os.FileMode{"tool-1.2.3/bin/tool": 0644, "tool-1.2.3/lib/marker": 0644},
			binaries: []interface{}{binary("tool", "tool-*/bin/tool")},
			tool:     "tool",
			want:     []string{"tool"},
			check: func(t *testing.T, fsys fs.FS) {
				assertLink(t, fsys, dest, "tool", "tool-1.2.3/bin/tool")
				assertExecutableFile(t, fsys, filepath.Join(dest, "tool-1.2.3", "bin"), "tool")
				if exists, _ := fsys.Exists(filepath.Join(dest, "tool-1.2.3", "lib", "marker")); !exists {
					t.Fatal("expected the archive layout next to the binary to survive promotion")
				}
			},
		},
		{
			name:  "directory occupying the binary name is moved aside for every binary in it",
			files: map[string]os.FileMode{"go/bin/go": 0755, "go/bin/gofmt": 0755, "go/src/runtime.go": 0644},
			binaries: []interface{}{
				config.BinaryConfig{Name: "go", Pattern: "go/bin/go"},
				&config.BinaryConfig{Name: "gofmt", Pattern: "go/bin/gofmt"},
			},
			tool: "go",
			want: []string{"go", "gofmt"},
			check: func(t *testing.T, fsys fs.FS) {
				assertLink(t, fsys, dest, "go", "go-root/bin/go")
				assertLink(t, fsys, dest, "gofmt", "go-root/bin/gofmt")
				if exists, _ := fsys.Exists(filepath.Join(dest, "go-root", "src", "runtime.go")); !exists {
					t.Fatal("expected the toolchain tree to be preserved under go-root")
				}
			},
		},
		{
			name:     "root match under another name is renamed to the binary",
			files:    map[string]os.FileMode{"hermit-darwin-arm64": 0755, "hermit-darwin-arm64.sha256": 0644},
			binaries: []interface{}{binary("hermit", "hermit-*")},
			tool:     "hermit",
			want:     []string{"hermit"},
			check: func(t *testing.T, fsys fs.FS) {
				assertExecutableFile(t, fsys, dest, "hermit")
				if exists, _ := fsys.Exists(filepath.Join(dest, "hermit-darwin-arm64")); exists {
					t.Fatal("expected the matched file to be renamed, not copied")
				}
			},
		},
		{
			name:     "stale link from an earlier promotion is replaced",
			files:    map[string]os.FileMode{"tool-2.0/tool": 0755},
			symlinks: map[string]string{"tool": "tool-1.0/tool"},
			tool:     "tool",
			want:     []string{"tool"},
			check: func(t *testing.T, fsys fs.FS) {
				assertLink(t, fsys, dest, "tool", "tool-2.0/tool")
			},
		},
		{
			name:     "promotion is idempotent",
			files:    map[string]os.FileMode{"tool-1.0/tool": 0755},
			symlinks: map[string]string{"tool": "tool-1.0/tool"},
			tool:     "tool",
			want:     []string{"tool"},
			check: func(t *testing.T, fsys fs.FS) {
				assertLink(t, fsys, dest, "tool", "tool-1.0/tool")
			},
		},
		{
			name:  "every declared binary is promoted",
			files: map[string]os.FileMode{"flat-bin": 0644, "nested-dir/nested-bin": 0644, "go/bin/go-real": 0644},
			binaries: []interface{}{
				map[string]interface{}{"name": "flat-bin"},
				map[string]interface{}{"name": "nested-bin"},
				config.BinaryConfig{Name: "go-real", Pattern: "go/bin/go-real"},
			},
			tool: "test-tool",
			want: []string{"flat-bin", "nested-bin", "go-real"},
			check: func(t *testing.T, fsys fs.FS) {
				for _, name := range []string{"flat-bin", "nested-bin", "go-real"} {
					if exists, err := fsys.Exists(filepath.Join(dest, name)); err != nil || !exists {
						t.Fatalf("expected %s at the root, got exists=%v err=%v", name, exists, err)
					}
				}
			},
		},
		{
			name:    "binary missing names the pattern",
			files:   map[string]os.FileMode{"other": 0755},
			tool:    "tool",
			wantErr: `binary "tool" not found in extracted archive under "/dest": nothing matches pattern "{,*/}tool"`,
		},
		{
			name:    "default pattern stops one directory deep",
			files:   map[string]os.FileMode{"tool-1.0/bin/tool": 0755},
			tool:    "tool",
			wantErr: `nothing matches pattern "{,*/}tool"`,
		},
		{
			name:     "malformed pattern is reported",
			files:    map[string]os.FileMode{"tool": 0755},
			binaries: []interface{}{binary("tool", "tool[")},
			tool:     "tool",
			wantErr:  `searching for binary "tool": invalid pattern "tool[": syntax error in pattern`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := extractedTree(t, dest, tt.files, tt.symlinks)
			got, err := PromoteBinaries(fsys, dest, tt.tool, tt.binaries)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("PromoteBinaries error = %v, want it to contain %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("PromoteBinaries unexpected error: %v", err)
			}
			if !slices.Equal(got, tt.want) {
				t.Fatalf("PromoteBinaries = %q, want %q", got, tt.want)
			}
			tt.check(t, fsys)
		})
	}
}

func TestValidateSudo(t *testing.T) {
	tests := []struct {
		name         string
		inst         Installer
		tool         *config.ToolConfig
		wantErr      bool
		errSubstring string
	}{
		{
			name:    "nil installer",
			inst:    nil,
			tool:    &config.ToolConfig{Name: "test"},
			wantErr: true,
		},
		{
			name:    "nil tool",
			inst:    &mockInstaller{name: "test", supportsSudo: false},
			tool:    nil,
			wantErr: false,
		},
		{
			name:    "sudo not requested, installer supports sudo",
			inst:    &mockInstaller{name: "apt", supportsSudo: true},
			tool:    &config.ToolConfig{Name: "git", Sudo: false},
			wantErr: false,
		},
		{
			name:    "sudo requested, installer supports sudo",
			inst:    &mockInstaller{name: "apt", supportsSudo: true},
			tool:    &config.ToolConfig{Name: "git", Sudo: true},
			wantErr: false,
		},
		{
			name:         "sudo requested, installer does not support sudo",
			inst:         &mockInstaller{name: "brew", supportsSudo: false},
			tool:         &config.ToolConfig{Name: "git", Sudo: true},
			wantErr:      true,
			errSubstring: `installer "brew" does not support sudo elevation`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateSudo(tt.inst, tt.tool)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateSudo() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && tt.errSubstring != "" {
				if err == nil || err.Error() != tt.errSubstring {
					t.Errorf("ValidateSudo() error = %v, wantSubstring %q", err, tt.errSubstring)
				}
			}
		})
	}
}

func TestAllInstallers_SupportsSudo(t *testing.T) {
	tests := []struct {
		name         string
		inst         Installer
		supportsSudo bool
	}{
		{"apt", NewAptInstaller(nil, nil, nil), true},
		{"dnf", NewDnfInstaller(nil, nil, nil), true},
		{"pacman", NewPacmanInstaller(nil, nil, nil), true},
		{"pkg", NewPkgInstaller(nil, nil, nil, nil), true},
		{"manual", NewManualInstaller(nil, nil, nil), true},
		{"brew", NewBrewInstaller(nil, nil, nil), false},
		{"cargo", NewCargoInstaller(nil, nil, nil, nil), false},
		{"curl-binary", NewCurlBinaryInstaller(nil, nil, nil, nil), false},
		{"curl-script", NewCurlScriptInstaller(nil, nil, nil, nil), false},
		{"curl-tar", NewCurlTarInstaller(nil, nil, nil, nil), false},
		{"dmg", NewDmgInstaller(nil, nil, nil, nil), false},
		{"gitea", NewGiteaInstaller(nil, nil, nil, nil), false},
		{"github", NewGitHubInstaller(nil, nil, nil, nil), false},
		{"npm", NewNpmInstaller(nil, nil, nil), false},
		{"zsh-plugin", NewZshPluginInstaller(nil, nil, nil), false},
	}

	if len(tests) != 15 {
		t.Fatalf("expected 15 installers, got %d", len(tests))
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.inst.SupportsSudo(); got != tt.supportsSudo {
				t.Errorf("installer %s: SupportsSudo() = %v, want %v", tt.name, got, tt.supportsSudo)
			}
		})
	}
}

// faultyFS wraps a file system and fails one operation, named by failOp, to exercise the
// error paths of binary promotion. ReadDir on ghostDir additionally reports an entry that
// does not exist.
type faultyFS struct {
	fs.FS
	failOp   string
	failPath string
	ghostDir string
}

func (f *faultyFS) fails(op, path string) bool {
	return f.failOp == op && (f.failPath == "" || f.failPath == path)
}

func (f *faultyFS) Chmod(path string, perm os.FileMode) error {
	if f.fails("chmod", path) {
		return errors.New("chmod denied")
	}
	return f.FS.Chmod(path, perm)
}

func (f *faultyFS) Remove(path string) error {
	if f.fails("remove", path) {
		return errors.New("remove denied")
	}
	return f.FS.Remove(path)
}

func (f *faultyFS) RemoveAll(path string) error {
	if f.fails("removeall", path) {
		return errors.New("removeall denied")
	}
	return f.FS.RemoveAll(path)
}

func (f *faultyFS) Rename(oldname, newname string) error {
	if f.fails("rename", oldname) {
		return errors.New("rename denied")
	}
	return f.FS.Rename(oldname, newname)
}

func (f *faultyFS) Symlink(oldname, newname string) error {
	if f.fails("symlink", newname) {
		return errors.New("symlink denied")
	}
	return f.FS.Symlink(oldname, newname)
}

func (f *faultyFS) Lstat(path string) (os.FileInfo, error) {
	if f.fails("lstat", path) {
		return nil, errors.New("lstat denied")
	}
	return f.FS.Lstat(path)
}

func (f *faultyFS) ReadDir(path string) ([]string, error) {
	if f.fails("readdir", path) {
		return nil, errors.New("readdir denied")
	}
	entries, err := f.FS.ReadDir(path)
	if err == nil && f.ghostDir != "" && path == f.ghostDir {
		entries = append(entries, "ghost")
	}
	return entries, err
}

func TestPromoteBinariesFileSystemErrors(t *testing.T) {
	const dest = "/dest"
	tests := []struct {
		name     string
		files    map[string]os.FileMode
		binaries []interface{}
		failOp   string
		failPath string
		wantErr  string
		check    func(t *testing.T, fsys fs.FS)
	}{
		{
			name:    "root binary cannot be made executable",
			files:   map[string]os.FileMode{"tool": 0644},
			failOp:  "chmod",
			wantErr: `making "/dest/tool" executable: chmod denied`,
		},
		{
			name:    "stale file occupying the name cannot be removed",
			files:   map[string]os.FileMode{"tool": 0644, "tool-1.0/tool": 0755},
			failOp:  "remove",
			wantErr: `removing stale "/dest/tool": remove denied`,
		},
		{
			name:     "directory occupying the name cannot be moved aside",
			files:    map[string]os.FileMode{"go/bin/go": 0755},
			binaries: []interface{}{config.BinaryConfig{Name: "go", Pattern: "go/bin/go"}},
			failOp:   "rename",
			wantErr:  `moving directory "/dest/go" aside to "/dest/go-root": rename denied`,
		},
		{
			name:     "previous -root directory cannot be removed",
			files:    map[string]os.FileMode{"go/bin/go": 0755, "go-root/stale": 0644},
			binaries: []interface{}{config.BinaryConfig{Name: "go", Pattern: "go/bin/go"}},
			failOp:   "removeall",
			wantErr:  `removing "/dest/go-root": removeall denied`,
		},
		{
			name:     "root match under another name cannot be renamed",
			files:    map[string]os.FileMode{"hermit-darwin-arm64": 0755},
			binaries: []interface{}{config.BinaryConfig{Name: "hermit", Pattern: "hermit-*"}},
			failOp:   "rename",
			wantErr:  `promoting binary from "/dest/hermit-darwin-arm64" to "/dest/hermit": rename denied`,
		},
		{
			name:     "occupant of the name cannot be inspected",
			files:    map[string]os.FileMode{"tool-1.0/tool": 0755},
			failOp:   "lstat",
			failPath: "/dest/tool",
			wantErr:  `inspecting "/dest/tool": lstat denied`,
		},
		{
			name:   "nested binary is moved when symlinks are unavailable",
			files:  map[string]os.FileMode{"tool-1.0/tool": 0755},
			failOp: "symlink",
			check: func(t *testing.T, fsys fs.FS) {
				assertExecutableFile(t, fsys, dest, "tool")
				if exists, _ := fsys.Exists(filepath.Join(dest, "tool-1.0", "tool")); exists {
					t.Fatal("expected the nested binary to be moved to the root")
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := &faultyFS{FS: extractedTree(t, dest, tt.files, nil), failOp: tt.failOp, failPath: tt.failPath}
			_, err := PromoteBinaries(fsys, dest, "tool", tt.binaries)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("PromoteBinaries error = %v, want it to contain %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("PromoteBinaries unexpected error: %v", err)
			}
			tt.check(t, fsys)
		})
	}
}
