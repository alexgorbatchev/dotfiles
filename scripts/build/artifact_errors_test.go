package main

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildFilesystemFailuresRetainContext(t *testing.T) {
	tests := []struct {
		name string
		run  func(*testing.T, string) error
		want string
	}{
		{"clean distribution", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "not-directory", "blocked")
			return cleanPreviousBuild(filepath.Join(root, "not-directory"))
		}, "failed to remove .dist"},
		{"clean dashboard", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "pkg/dashboard", "blocked")
			return cleanPreviousBuild(root)
		}, "failed to remove pkg/dashboard/dist"},
		{"clean embedded declarations", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "pkg/embedded", "blocked")
			return cleanPreviousBuild(root)
		}, "failed to remove pkg/embedded/dist"},
		{"dashboard scratch parent", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, ".tmp", "blocked")
			return buildDashboard(root)
		}, "failed to create .tmp directory"},
		{"dashboard script destination", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, ".tmp/build_dashboard.js/child", "blocked")
			return buildDashboard(root)
		}, "failed to write build_dashboard.js"},
		{"public asset destination", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "README.md", "readme")
			writeBuildFixture(t, root, ".dist/README.md/child", "blocked")
			return copyAssetsAndSkill(root)
		}, "failed to copy asset README.md"},
		{"missing canonical skill", func(t *testing.T, root string) error {
			return copyAssetsAndSkill(root)
		}, "failed to copy skill directory"},
		{"release scratch parent", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "package.json", `{"version":"1.2.3"}`)
			writeBuildFixture(t, root, ".tmp", "blocked")
			return compileAllBinaries(root)
		}, ""},
		{"summary missing distribution", func(t *testing.T, root string) error {
			return printBuildSummary(root)
		}, "failed to print build summary"},
		{"checksums missing distribution", func(t *testing.T, root string) error {
			return generateChecksums(filepath.Join(root, "missing"))
		}, ""},
		{"checksums unreadable archive", func(t *testing.T, root string) error {
			if err := os.Symlink("missing", filepath.Join(root, "archive.tar.gz")); err != nil {
				t.Fatal(err)
			}
			return generateChecksums(root)
		}, ""},
		{"checksums archive read fails", func(t *testing.T, root string) error {
			if err := os.Symlink(root, filepath.Join(root, "archive.tar.gz")); err != nil {
				t.Fatal(err)
			}
			return generateChecksums(root)
		}, ""},
		{"checksums destination", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "checksums.txt/child", "blocked")
			bin := writeBuildFixture(t, root, "dotfiles", "binary")
			return finishRelease(io.Discard, root, []string{bin})
		}, "failed to generate checksums"},
		{"archive parent", func(t *testing.T, root string) error {
			writeBuildFixture(t, root, "blocked", "file")
			return createTarGz(filepath.Join(root, "blocked", "release.tar.gz"), nil)
		}, ""},
		{"archive destination", func(t *testing.T, root string) error {
			return createTarGz(root, nil)
		}, ""},
		{"archive missing source", func(t *testing.T, root string) error {
			return createTarGz(filepath.Join(root, "release.tar.gz"), map[string]string{"dotfiles": filepath.Join(root, "missing")})
		}, ""},
		{"archive unreadable source", func(t *testing.T, root string) error {
			return createTarGz(filepath.Join(root, "release.tar.gz"), map[string]string{"directory": root})
		}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.run(t, t.TempDir())
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want context %q", err, tt.want)
			}
			var pathErr *fs.PathError
			if !errors.As(err, &pathErr) {
				t.Errorf("filesystem cause lost: %v", err)
			}
		})
	}
}

func TestSchemaGenerationFailures(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{"missing DSL", "pkg/vm/dsl-types.ts", "failed to read dsl-types.ts"},
		{"missing generated types", "packages/dashboard/src/shared/types.gen.ts", "failed to read types.gen.ts"},
		{"distribution directory", ".dist", "failed to create .dist directory"},
		{"embedded directory", "pkg/embedded/dist", "failed to create pkg/embedded/dist directory"},
		{"distribution declarations", ".dist/index.d.ts", "failed to write index.d.ts"},
		{"embedded declarations", "pkg/embedded/dist/index.d.ts", "failed to write index.d.ts"},
		{"distribution globals", ".dist/globals.d.ts", "failed to write globals.d.ts"},
		{"embedded globals", "pkg/embedded/dist/globals.d.ts", "failed to write globals.d.ts"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			writeBuildFixture(t, root, "pkg/vm/dsl-types.ts", "export interface Example {}\n")
			writeBuildFixture(t, root, "pkg/vm/globals.d.ts", "declare var process: {env: Record<string, string>};\n")
			writeBuildFixture(t, root, "packages/dashboard/src/shared/types.gen.ts", "export interface Generated {}\n")
			path := filepath.Join(root, tt.path)
			if strings.HasPrefix(tt.name, "missing") {
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
			} else if strings.HasSuffix(tt.name, "directory") {
				writeBuildFixture(t, root, tt.path, "blocked")
			} else {
				writeBuildFixture(t, root, filepath.Join(tt.path, "child"), "blocked")
			}
			err := generateSchemaTypes(root)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want %q", err, tt.want)
			}
		})
	}
}

func TestCopyDirectoryRetainsLinksAndExecutableModes(t *testing.T) {
	root := t.TempDir()
	src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
	path := writeBuildFixture(t, src, "bin/tool", "executable")
	if err := os.Chmod(path, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../bin/tool", filepath.Join(src, "bin/link")); err != nil {
		t.Fatal(err)
	}
	if err := copyDirectoryRecursive(src, dst); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dst, "bin/tool"))
	if err != nil || info.Mode().Perm() != 0755 {
		t.Fatalf("copied executable permissions: %v, %v", info, err)
	}
	link, err := os.Readlink(filepath.Join(dst, "bin/link"))
	if err != nil || link != "../bin/tool" {
		t.Fatalf("copied link = %q, %v", link, err)
	}
	// A directory at a file destination must fail rather than overwrite it.
	if err := os.Remove(filepath.Join(dst, "bin/tool")); err != nil {
		t.Fatal(err)
	}
	writeBuildFixture(t, dst, "bin/tool/owned", "preserved")
	if err := os.Remove(filepath.Join(dst, "bin/link")); err != nil {
		t.Fatal(err)
	}
	if err := copyDirectoryRecursive(src, dst); err == nil {
		t.Fatal("copy unexpectedly replaced destination directory")
	}
	content, err := os.ReadFile(filepath.Join(dst, "bin/tool/owned"))
	if err != nil || string(content) != "preserved" {
		t.Fatalf("existing destination modified: %q, %v", content, err)
	}
}
