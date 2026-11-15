package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"debug/buildinfo"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"slices"
	"strings"
	"testing"
)

func writeBuildFixture(t *testing.T, root, name, content string) string {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

// Copy the real generator inputs, while keeping every generated output in the
// test's root. Only installed dependencies are linked back to the checkout.
func newBuildFixture(t *testing.T) string {
	t.Helper()
	repo, err := getRepoRoot()
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	for _, name := range []string{"go.mod", "go.sum", "scripts/typegen/main.go", "pkg/vm/dsl-types.ts", "pkg/vm/globals.d.ts"} {
		content, err := os.ReadFile(filepath.Join(repo, name))
		if err != nil {
			t.Fatal(err)
		}
		writeBuildFixture(t, root, name, string(content))
	}
	for _, name := range []string{"pkg/config", "pkg/utils"} {
		if err := copyDirectoryRecursive(filepath.Join(repo, name), filepath.Join(root, name)); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(filepath.Join(repo, "node_modules"), filepath.Join(root, "node_modules")); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		"package.json":         `{"version":"8.7.6"}`,
		"cmd/dotfiles/main.go": "package main\nimport \"fmt\"\nvar Version string\nfunc main() { fmt.Print(Version) }\n",
		"packages/dashboard/src/client/dashboard.html": "<!doctype html><html><body>Isolated dashboard</body></html>\n",
		"pkg/embedded/skill/SKILL.md":                  "# Isolated skill\n",
		"README.md":                                    "# Fixture release\n",
		"LICENSE":                                      "Fixture license\n",
		"tests/type-tests/index.test-d.ts":             "import { expectType } from 'tsd';\nimport { dedentString } from '@alexgorbatchev/dotfiles';\nexpectType<string>(dedentString('example'));\nexpectType<string | undefined>(process.env.TEST);\n",
	} {
		writeBuildFixture(t, root, name, content)
	}
	return root
}

type archiveEntry struct {
	mode int64
	data []byte
}

func readReleaseArchive(t *testing.T, path string) map[string]archiveEntry {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	entries := map[string]archiveEntry{}
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if _, exists := entries[header.Name]; exists {
			t.Fatalf("duplicate archive entry %q", header.Name)
		}
		data, err := io.ReadAll(tr)
		if err != nil {
			t.Fatal(err)
		}
		entries[header.Name] = archiveEntry{header.Mode, data}
	}
	// Reading through gzip's trailer verifies that the archive was finalized.
	if _, err := io.Copy(io.Discard, gz); err != nil {
		t.Fatal(err)
	}
	return entries
}

func assertBuildPathAbsent(t *testing.T, root, name string) {
	t.Helper()
	if _, err := os.Lstat(filepath.Join(root, name)); !os.IsNotExist(err) {
		t.Fatalf("%s should be absent, stat error: %v", name, err)
	}
}

func runBuildMain(t *testing.T, args ...string) {
	t.Helper()
	previousFlags, previousArgs := flag.CommandLine, os.Args
	t.Cleanup(func() { flag.CommandLine, os.Args = previousFlags, previousArgs })
	flag.CommandLine = flag.NewFlagSet("build", flag.ContinueOnError)
	os.Args = append([]string{"build"}, args...)
	main()
}

func TestBuildModesProduceUsableIsolatedArtifacts(t *testing.T) {
	root := newBuildFixture(t)
	t.Chdir(root)
	writeBuildFixture(t, root, ".dist/stale.d.ts", "obsolete")
	t.Run("assets only", func(t *testing.T) {
		runBuildMain(t, "--assets-only")
		for _, name := range []string{"pkg/dashboard/dist/index.html", "pkg/embedded/dist/index.d.ts", ".dist/skill/SKILL.md"} {
			content, err := os.ReadFile(filepath.Join(root, name))
			if err != nil || len(content) == 0 {
				t.Fatalf("generated %s: size %d, error %v", name, len(content), err)
			}
		}
		assertBuildPathAbsent(t, root, ".dist/stale.d.ts")
		assertBuildPathAbsent(t, root, ".dist/checksums.txt")
		assertBuildPathAbsent(t, root, ".tmp/build_dashboard.js")
	})
	t.Run("types only preserves assets", func(t *testing.T) {
		writeBuildFixture(t, root, ".dist/sentinel", "preserved")
		runBuildMain(t, "--type-tests")
		content, err := os.ReadFile(filepath.Join(root, ".dist/sentinel"))
		if err != nil || string(content) != "preserved" {
			t.Fatalf("type tests modified assets: %q, %v", content, err)
		}
		assertBuildPathAbsent(t, root, ".tmp/tsd-tests")
	})
	t.Run("full build", func(t *testing.T) {
		runBuildMain(t)
		assertBuildPathAbsent(t, root, ".dist/sentinel")
		assertBuildPathAbsent(t, root, ".tmp/release-bins")
		var wantChecksums []string
		for _, target := range releaseTargets {
			name := fmt.Sprintf("dotfiles_8.7.6_%s_%s.tar.gz", target.goos, target.goarch)
			path := filepath.Join(root, ".dist", name)
			entries := readReleaseArchive(t, path)
			if len(entries) != 3 || string(entries["README.md"].data) != "# Fixture release\n" || string(entries["LICENSE"].data) != "Fixture license\n" {
				t.Fatalf("%s has incorrect release contents", name)
			}
			bin := entries["dotfiles"]
			if bin.mode&0111 == 0 {
				t.Errorf("%s binary is not executable: %o", name, bin.mode)
			}
			info, err := buildinfo.Read(bytes.NewReader(bin.data))
			if err != nil {
				t.Fatal(err)
			}
			for _, setting := range []struct{ key, value string }{{"GOOS", target.goos}, {"GOARCH", target.goarch}, {"CGO_ENABLED", "0"}} {
				if !slices.ContainsFunc(info.Settings, func(s debug.BuildSetting) bool { return s.Key == setting.key && s.Value == setting.value }) {
					t.Errorf("%s lacks build setting %s=%s", name, setting.key, setting.value)
				}
			}
			archive, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			wantChecksums = append(wantChecksums, fmt.Sprintf("%x  %s", sha256.Sum256(archive), name))
		}
		slices.Sort(wantChecksums)
		checksums, err := os.ReadFile(filepath.Join(root, ".dist/checksums.txt"))
		if err != nil || string(checksums) != strings.Join(wantChecksums, "\n")+"\n" {
			t.Fatalf("checksum manifest does not match packaged bytes: %q, %v", checksums, err)
		}
		// The host's artifact must run and carry the release version from ldflags.
		output, err := exec.Command(filepath.Join(root, ".dist/dotfiles")).Output()
		if err != nil || string(output) != "8.7.6" {
			t.Fatalf("native binary version = %q, error %v (%s/%s)", output, err, runtime.GOOS, runtime.GOARCH)
		}
	})
}
