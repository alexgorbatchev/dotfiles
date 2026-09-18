package installer

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestExpandBraces(t *testing.T) {
	tests := []struct {
		pattern string
		want    []string
	}{
		{"*.tar.gz", []string{"*.tar.gz"}},
		{"*.{tar.xz,zip}", []string{"*.tar.xz", "*.zip"}},
		{"{,*/}tool", []string{"tool", "*/tool"}},
		{"*.{tar.{gz,xz},zip}", []string{"*.tar.gz", "*.tar.xz", "*.zip"}},
		{"{a,b}-{1,2}", []string{"a-1", "a-2", "b-1", "b-2"}},
		{"tool{x}.zip", []string{"tool{x}.zip"}},
		{"tool{x}.{zip,gz}", []string{"tool{x}.zip", "tool{x}.gz"}},
		{"tool{a,b", []string{"tool{a,b"}},
		{"tool}a,b{", []string{"tool}a,b{"}},
	}
	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			got := expandBraces(tt.pattern)
			if len(got) != len(tt.want) {
				t.Fatalf("expandBraces(%q) = %q, want %q", tt.pattern, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("expandBraces(%q) = %q, want %q", tt.pattern, got, tt.want)
				}
			}
		})
	}
}

func TestGlobMatch(t *testing.T) {
	tests := []struct {
		pattern string
		name    string
		want    bool
		wantErr bool
	}{
		{"tool", "tool", true, false},
		{"tool", "dir/tool", false, false},
		{"*/tool", "dir/tool", true, false},
		{"*/tool", "a/b/tool", false, false},
		{"*", "dir/tool", false, false},
		{"{,*/}tool", "tool", true, false},
		{"{,*/}tool", "dir/tool", true, false},
		{"{,*/}tool", "a/b/tool", false, false},
		{"tool-*/bin/tool", "tool-1.2.3/bin/tool", true, false},
		{"tool-*/bin/tool", "other/bin/tool", false, false},
		{"tool?", "tool1", true, false},
		{"tool?", "tool", false, false},
		{"[!t]*", "tool", false, false},
		{"[!t]*", "atool", true, false},
		{"[^t]*", "atool", true, false},
		{"bin/{tool,tool-helper}", "bin/tool-helper", true, false},
		{"tool[", "tool", false, true},
		{"tool[", "other", false, true},
	}
	for _, tt := range tests {
		t.Run(tt.pattern+" vs "+tt.name, func(t *testing.T) {
			got, err := globMatch(tt.pattern, tt.name)
			if (err != nil) != tt.wantErr {
				t.Fatalf("globMatch(%q, %q) error = %v, wantErr %v", tt.pattern, tt.name, err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("globMatch(%q, %q) = %v, want %v", tt.pattern, tt.name, got, tt.want)
			}
		})
	}
}

// extractedTree builds the layout of an extracted archive under root on a fresh MemFS.
// files maps slash-separated relative paths to modes; a mode with os.ModeDir creates an
// empty directory. symlinks maps relative link paths to their targets.
func extractedTree(t *testing.T, root string, files map[string]os.FileMode, symlinks map[string]string) fs.FS {
	t.Helper()
	fsys := fs.NewMemFS()
	if err := fsys.MkdirAll(root, 0755); err != nil {
		t.Fatalf("creating %s: %v", root, err)
	}
	for rel, mode := range files {
		full := filepath.Join(root, filepath.FromSlash(rel))
		if mode.IsDir() {
			if err := fsys.MkdirAll(full, mode.Perm()); err != nil {
				t.Fatalf("creating directory %s: %v", rel, err)
			}
			continue
		}
		if err := fsys.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatalf("creating parent of %s: %v", rel, err)
		}
		if err := fsys.WriteFile(full, []byte(rel), mode); err != nil {
			t.Fatalf("writing %s: %v", rel, err)
		}
	}
	for rel, target := range symlinks {
		if err := fsys.Symlink(target, filepath.Join(root, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("linking %s -> %s: %v", rel, target, err)
		}
	}
	return fsys
}

func TestDefaultBinaryPattern(t *testing.T) {
	if got := defaultBinaryPattern("tool"); got != "{,*/}tool" {
		t.Fatalf("defaultBinaryPattern(%q) = %q, want %q", "tool", got, "{,*/}tool")
	}
}

func TestFindBinaryByPattern(t *testing.T) {
	const root = "/extract"
	tests := []struct {
		name     string
		files    map[string]os.FileMode
		symlinks map[string]string
		pattern  string
		bin      string
		want     string
		wantErr  string
	}{
		{
			name:    "default pattern matches the archive root",
			files:   map[string]os.FileMode{"tool": 0755, "README.md": 0644},
			pattern: defaultBinaryPattern("tool"),
			bin:     "tool",
			want:    "tool",
		},
		{
			name:    "default pattern matches one directory deep",
			files:   map[string]os.FileMode{"tool-1.0/tool": 0755, "tool-1.0/LICENSE": 0644},
			pattern: defaultBinaryPattern("tool"),
			bin:     "tool",
			want:    "tool-1.0/tool",
		},
		{
			name:    "default pattern does not descend two directories",
			files:   map[string]os.FileMode{"tool-1.0/bin/tool": 0755},
			pattern: defaultBinaryPattern("tool"),
			bin:     "tool",
			want:    "",
		},
		{
			name:    "star reaches a bin subdirectory",
			files:   map[string]os.FileMode{"tool-1.0/bin/tool": 0755, "tool-1.0/lib/libtool.so": 0644},
			pattern: "*/bin/tool",
			bin:     "tool",
			want:    "tool-1.0/bin/tool",
		},
		{
			name:    "prefixed star selects the versioned directory",
			files:   map[string]os.FileMode{"tool-1.0/bin/tool": 0755, "other/bin/tool": 0755},
			pattern: "tool-*/bin/tool",
			bin:     "tool",
			want:    "tool-1.0/bin/tool",
		},
		{
			name:    "exact root path ignores nested files of the same name",
			files:   map[string]os.FileMode{"tool": 0755, "dir/tool": 0755},
			pattern: "tool",
			bin:     "tool",
			want:    "tool",
		},
		{
			name:    "exact nested path",
			files:   map[string]os.FileMode{"go/bin/go": 0755, "go/bin/gofmt": 0755},
			pattern: "go/bin/go",
			bin:     "go",
			want:    "go/bin/go",
		},
		{
			name:    "nothing matches",
			files:   map[string]os.FileMode{"other": 0755},
			pattern: defaultBinaryPattern("tool"),
			bin:     "tool",
			want:    "",
		},
		{
			name:    "a directory never matches",
			files:   map[string]os.FileMode{"tool": os.ModeDir | 0755, "tool/README": 0644},
			pattern: defaultBinaryPattern("tool"),
			bin:     "tool",
			want:    "",
		},
		{
			name:    "executable named after the binary beats other executables",
			files:   map[string]os.FileMode{"helper": 0755, "tool": 0755},
			pattern: "*",
			bin:     "tool",
			want:    "tool",
		},
		{
			name:    "executable beats a non-executable named after the binary",
			files:   map[string]os.FileMode{"tool": 0644, "tool.sh": 0755},
			pattern: "*",
			bin:     "tool",
			want:    "tool.sh",
		},
		{
			name:    "executable beats a non-executable checksum sibling",
			files:   map[string]os.FileMode{"hermit-darwin-arm64": 0755, "hermit-darwin-arm64.sha256": 0644},
			pattern: "hermit-*",
			bin:     "hermit",
			want:    "hermit-darwin-arm64",
		},
		{
			name:    "file named after the binary beats the first match when nothing is executable",
			files:   map[string]os.FileMode{"helper": 0644, "tool": 0644},
			pattern: "*",
			bin:     "tool",
			want:    "tool",
		},
		{
			name:    "first match in path order otherwise",
			files:   map[string]os.FileMode{"b-file": 0644, "a-file": 0644},
			pattern: "*",
			bin:     "tool",
			want:    "a-file",
		},
		{
			name:    "a single non-executable match is still found",
			files:   map[string]os.FileMode{"tool": 0644},
			pattern: defaultBinaryPattern("tool"),
			bin:     "tool",
			want:    "tool",
		},
		{
			name:     "a dangling symlink is matched but ranks below a real executable",
			files:    map[string]os.FileMode{"tool-2.0/tool": 0755},
			symlinks: map[string]string{"tool": "tool-1.0/tool"},
			pattern:  defaultBinaryPattern("tool"),
			bin:      "tool",
			want:     "tool-2.0/tool",
		},
		{
			name:    "malformed pattern",
			files:   map[string]os.FileMode{"tool": 0755},
			pattern: "tool[",
			bin:     "tool",
			wantErr: "syntax error in pattern",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := extractedTree(t, root, tt.files, tt.symlinks)
			got, err := findBinaryByPattern(fsys, root, tt.pattern, tt.bin)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("findBinaryByPattern(%q) error = %v, want it to contain %q", tt.pattern, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("findBinaryByPattern(%q) unexpected error: %v", tt.pattern, err)
			}
			want := ""
			if tt.want != "" {
				want = filepath.Join(root, filepath.FromSlash(tt.want))
			}
			if got != want {
				t.Fatalf("findBinaryByPattern(%q) = %q, want %q", tt.pattern, got, want)
			}
		})
	}

	t.Run("missing extraction directory", func(t *testing.T) {
		_, err := findBinaryByPattern(fs.NewMemFS(), "/nowhere", "tool", "tool")
		if err == nil {
			t.Fatal("expected an error for a missing extraction directory")
		}
	})

	t.Run("unreadable subdirectory is reported", func(t *testing.T) {
		fsys := &faultyFS{FS: extractedTree(t, root, map[string]os.FileMode{"sub/tool": 0755}, nil), failOp: "readdir", failPath: filepath.Join(root, "sub")}
		_, err := findBinaryByPattern(fsys, root, "*/tool", "tool")
		if err == nil || !strings.Contains(err.Error(), `reading "/extract/sub": readdir denied`) {
			t.Fatalf("expected the subdirectory read failure to be reported, got %v", err)
		}
	})

	t.Run("entry that vanishes after listing is skipped", func(t *testing.T) {
		fsys := &faultyFS{FS: extractedTree(t, root, map[string]os.FileMode{"tool": 0755}, nil), ghostDir: root}
		got, err := findBinaryByPattern(fsys, root, "*", "tool")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if want := filepath.Join(root, "tool"); got != want {
			t.Fatalf("findBinaryByPattern = %q, want %q", got, want)
		}
	})
}
