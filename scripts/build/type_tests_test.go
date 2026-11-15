package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTypeTestFixture(t *testing.T) string {
	t.Helper()
	repo, err := getRepoRoot()
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	writeBuildFixture(t, root, ".dist/index.d.ts", "declare module '@alexgorbatchev/dotfiles' { export function example(): string; }\n")
	writeBuildFixture(t, root, ".dist/globals.d.ts", "declare var process: { env: Record<string, string | undefined> };\n")
	writeBuildFixture(t, root, "tests/type-tests/index.test-d.ts", "import { expectType } from 'tsd';\nimport { example } from '@alexgorbatchev/dotfiles';\nexpectType<string>(example());\n")
	if err := os.Symlink(filepath.Join(repo, "node_modules"), filepath.Join(root, "node_modules")); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestTypeTestStagingFailures(t *testing.T) {
	tests := []struct {
		name string
		path string
		kind string
		want string
	}{
		{"scratch parent", ".tmp", "file", "failed to clean tsd-tests directory"},
		{"generated directory", "tests/type-tests/.generated", "file", "failed to create .generated directory"},
		{"missing declarations", ".dist/index.d.ts", "remove", "failed to copy index.d.ts to .generated"},
		{"package directory", "tests/type-tests/node_modules", "file", "failed to create node_modules/@alexgorbatchev/dotfiles"},
		{"package declaration destination", "tests/type-tests/node_modules/@alexgorbatchev/dotfiles/index.d.ts", "directory", "failed to copy index.d.ts to node_modules"},
		{"entrypoint destination", "tests/type-tests/index.d.ts", "directory", "failed to write index.d.ts for tsd tests"},
		{"missing globals", ".dist/globals.d.ts", "remove", "failed to copy globals.d.ts for tsd tests"},
		{"package manifest destination", "tests/type-tests/package.json", "directory", "failed to write package.json for tsd tests"},
		{"compiler config destination", "tests/type-tests/tsconfig.json", "directory", "failed to write tsconfig.json for tsd tests"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := newTypeTestFixture(t)
			switch tt.kind {
			case "file":
				writeBuildFixture(t, root, tt.path, "blocked")
			case "directory":
				writeBuildFixture(t, root, filepath.Join(tt.path, "child"), "blocked")
			case "remove":
				if err := os.Remove(filepath.Join(root, tt.path)); err != nil {
					t.Fatal(err)
				}
			}
			err := runTypeTests(root)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want %q", err, tt.want)
			}
			if tt.name != "scratch parent" {
				assertBuildPathAbsent(t, root, ".tmp/tsd-tests")
			}
		})
	}
}

func TestTypeTestsRejectInvalidConsumer(t *testing.T) {
	root := newTypeTestFixture(t)
	consumer := "import { expectType } from 'tsd';\nimport { example } from '@alexgorbatchev/dotfiles';\nexpectType<number>(example());\n"
	path := writeBuildFixture(t, root, "tests/type-tests/index.test-d.ts", consumer)
	err := runTypeTests(root)
	if err == nil || !strings.Contains(err.Error(), "tsd type tests failed") {
		t.Fatalf("invalid consumer accepted: %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != consumer {
		t.Fatalf("source test modified: %q, %v", content, err)
	}
	assertBuildPathAbsent(t, root, ".tmp/tsd-tests")
}
