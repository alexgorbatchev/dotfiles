package catalog

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func physicalGitTestDir(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

func gitFixtureCommand(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.NewOSRunner().Command("git", args...)
	cmd.SetDir(dir)
	cmd.SetEnv(append(os.Environ(), "GIT_AUTHOR_NAME=Fixture", "GIT_AUTHOR_EMAIL=fixture@example.test", "GIT_COMMITTER_NAME=Fixture", "GIT_COMMITTER_EMAIL=fixture@example.test"))
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func newGitFixture(t *testing.T) (string, string) {
	t.Helper()
	repo := physicalGitTestDir(t)
	gitFixtureCommand(t, repo, "init", "--initial-branch=main")
	gitFixtureCommand(t, repo, "config", "uploadpack.allowFilter", "true")
	files := map[string][]byte{
		"tools/b/a/bat/tool.ts":         []byte("throw new Error('must not execute');\r\n"),
		"tools/b/a/bat/files/helper.ts": []byte("export const greeting = 'hello';\n"),
		"tools/b/a/bat/files/icon.bin":  {0, 255, 12},
		"tools/j/_/j/tool.ts":           []byte("one-character ID\n"),
		"unrelated.txt":                 []byte("do not import"),
	}
	for path, data := range files {
		name := filepath.Join(repo, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(name), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(name, data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	gitFixtureCommand(t, repo, "add", ".")
	gitFixtureCommand(t, repo, "update-index", "--chmod=+x", "tools/b/a/bat/files/helper.ts")
	gitFixtureCommand(t, repo, "commit", "-m", "fixture")
	return repo, gitFixtureCommand(t, repo, "rev-parse", "HEAD")
}

func TestFetchGitFiles(t *testing.T) {
	repo, commit := newGitFixture(t)
	for _, id := range []string{"bat", "j"} {
		t.Run(id, func(t *testing.T) {
			dir := physicalGitTestDir(t)
			options := FetchOptions{ID: id, Repository: repo, Ref: commit, TemporaryDir: filepath.Join(dir, ".tmp"), ToolsDir: filepath.Join(dir, "tools")}
			result, err := Fetch(context.Background(), exec.NewOSRunner(), options)
			if err != nil {
				t.Fatal(err)
			}
			if result.Commit != commit {
				t.Fatalf("commit = %s, want %s", result.Commit, commit)
			}
			source, err := SourcePath(id)
			if err != nil {
				t.Fatal(err)
			}
			original, err := os.ReadFile(filepath.Join(repo, filepath.FromSlash(source), "tool.ts"))
			if err != nil {
				t.Fatal(err)
			}
			actual, err := os.ReadFile(filepath.Join(options.ToolsDir, id, id+".tool.ts"))
			if err != nil || string(actual) != string(original) {
				t.Fatalf("source bytes changed: %v, %q", err, actual)
			}
			if _, err := os.Stat(filepath.Join(options.ToolsDir, id, "unrelated.txt")); !os.IsNotExist(err) {
				t.Fatalf("unrelated file imported: %v", err)
			}
			if id == "bat" {
				binary, err := os.ReadFile(filepath.Join(result.Destination, "files", "icon.bin"))
				if err != nil || string(binary) != string([]byte{0, 255, 12}) {
					t.Fatalf("binary bytes changed: %v, %v", binary, err)
				}
			}
			entries, err := os.ReadDir(options.TemporaryDir)
			if err != nil || len(entries) != 0 {
				t.Fatalf("temporary Git files remain: %v, %v", entries, err)
			}
			if _, err := Fetch(context.Background(), exec.NewOSRunner(), options); err == nil {
				t.Fatal("existing destination overwritten")
			}
		})
	}
}

func TestFetchGitRefsAndDryRun(t *testing.T) {
	repo, original := newGitFixture(t)
	gitFixtureCommand(t, repo, "tag", "v1")
	if err := os.WriteFile(filepath.Join(repo, "tools", "b", "a", "bat", "tool.ts"), []byte("changed"), 0644); err != nil {
		t.Fatal(err)
	}
	gitFixtureCommand(t, repo, "commit", "-am", "second")
	latest := gitFixtureCommand(t, repo, "rev-parse", "HEAD")
	for _, test := range []struct{ ref, commit string }{{"", latest}, {"main", latest}, {"v1", original}, {original, original}} {
		t.Run("ref="+test.ref, func(t *testing.T) {
			dir := physicalGitTestDir(t)
			repositoryURL := (&url.URL{Scheme: "file", Path: "/" + strings.TrimPrefix(filepath.ToSlash(repo), "/")}).String()
			options := FetchOptions{ID: "bat", Repository: repositoryURL, Ref: test.ref, TemporaryDir: filepath.Join(dir, ".tmp"), ToolsDir: filepath.Join(dir, "tools"), DryRun: true}
			result, err := Fetch(context.Background(), exec.NewOSRunner(), options)
			if err != nil || result.Commit != test.commit || len(result.Files) != 3 {
				t.Fatalf("ref selection: %v, %#v", err, result)
			}
			if _, err := os.Stat(options.ToolsDir); !os.IsNotExist(err) {
				t.Fatalf("dry-run created tools directory: %v", err)
			}
		})
	}
}

func TestFetchGitFailuresLeaveNoImportedFiles(t *testing.T) {
	for _, test := range []struct{ name, id, ref, badPath, mode string }{
		{name: "missing tool", id: "missing"},
		{name: "missing ref", id: "bat", ref: "missing"},
		{name: "symlink", id: "bat", badPath: "files/link", mode: "120000"},
		{name: "submodule", id: "bat", badPath: "files/module", mode: "160000"},
		{name: "additional definition", id: "bat", badPath: "files/bad.tool.ts", mode: "100644"},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo, commit := newGitFixture(t)
			if test.badPath != "" {
				object := commit
				if test.mode != "160000" {
					object = gitFixtureCommand(t, repo, "rev-parse", "HEAD:tools/b/a/bat/tool.ts")
				}
				gitFixtureCommand(t, repo, "update-index", "--add", "--cacheinfo", test.mode, object, "tools/b/a/bat/"+test.badPath)
				gitFixtureCommand(t, repo, "commit", "-m", "invalid entry")
			}
			dir := physicalGitTestDir(t)
			options := FetchOptions{ID: test.id, Repository: repo, Ref: test.ref, TemporaryDir: filepath.Join(dir, ".tmp"), ToolsDir: filepath.Join(dir, "tools")}
			if _, err := Fetch(context.Background(), exec.NewOSRunner(), options); err == nil {
				t.Fatal("invalid repository contents accepted")
			}
			if _, err := os.Stat(options.ToolsDir); !os.IsNotExist(err) {
				t.Fatalf("failed retrieval wrote destination: %v", err)
			}
			entries, err := os.ReadDir(options.TemporaryDir)
			if err != nil || len(entries) != 0 {
				t.Fatalf("failed retrieval left scratch objects: %v, %v", entries, err)
			}
		})
	}
}

func TestFetchOptionsValidation(t *testing.T) {
	for _, repo := range []string{"https://example.test/tools.git", "ssh://git@example.test/tools.git", "file:///catalog/repository", filepath.Join(physicalGitTestDir(t), "repository")} {
		if err := (FetchOptions{ID: "bat", Repository: repo}).Validate(); err != nil {
			t.Fatalf("valid repository %q: %v", repo, err)
		}
	}
	for _, test := range []struct{ name, id, repo, ref string }{
		{name: "missing repository", id: "bat"},
		{name: "invalid ID", id: "../bat", repo: "https://example.test/tools.git"},
		{name: "URL parse", id: "bat", repo: "https://%bad"},
		{name: "API origin", id: "bat", repo: "https://api.github.com/repos/owner/repo"},
		{name: "API path", id: "bat", repo: "https://example.test/api/v3/repos/owner/repo"},
		{name: "query", id: "bat", repo: "https://example.test/tools.git?token=secret"},
		{name: "credentials", id: "bat", repo: "https://user:secret@example.test/tools.git"},
		{name: "SSH password", id: "bat", repo: "ssh://user:secret@example.test/tools.git"},
		{name: "no host", id: "bat", repo: "https:///tools.git"},
		{name: "file host", id: "bat", repo: "file://example.test/tools.git"},
		{name: "file relative", id: "bat", repo: "file:relative"},
		{name: "custom helper", id: "bat", repo: "ext::command"},
		{name: "refspec", id: "bat", repo: "https://example.test/tools.git", ref: "HEAD:refs/heads/main"},
		{name: "option", id: "bat", repo: "https://example.test/tools.git", ref: "--upload-pack=command"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := (FetchOptions{ID: test.id, Repository: test.repo, Ref: test.ref}).Validate(); err == nil {
				t.Fatal("invalid selector accepted")
			}
		})
	}
}

func TestParseGitFilesRejectsUnsafeEntries(t *testing.T) {
	const source = "tools/b/a/bat"
	const object = "0000000000000000000000000000000000000000"
	entry := func(path, size string) string {
		return "100644 blob " + object + " " + size + "\t" + source + "/" + path + "\x00"
	}
	for _, test := range []struct{ name, data string }{
		{"malformed", "bad\x00"},
		{"outside", "100644 blob " + object + " 1\toutside/tool.ts\x00"},
		{"traversal", entry("../outside", "1")},
		{"Git config", entry(".git/config", "1")},
		{"control", entry("files/tab\tname", "1")},
		{"nonportable character", entry("files/question?mark", "1")},
		{"invalid UTF-8", entry("files/\xff", "1")},
		{"case collision", entry("files/A", "1") + entry("files/a", "1")},
		{"directory casing", entry("files/A/one", "1") + entry("files/a/two", "1")},
		{"parent collision", entry("files", "1") + entry("files/a", "1")},
		{"size parse", entry("tool.ts", "invalid")},
		{"negative", entry("tool.ts", "-1")},
		{"source limit", entry("tool.ts", fmt.Sprint(maxTypeScriptBytes+1))},
		{"asset limit", entry("files/asset", fmt.Sprint(maxAssetBytes+1))},
		{"main missing", entry("files/a", "1")},
	} {
		t.Run(test.name, func(t *testing.T) {
			listing := test.data
			if test.name != "main missing" && !strings.Contains(listing, source+"/tool.ts\x00") {
				listing += entry("tool.ts", "1")
			}
			if _, err := parseGitFiles([]byte(listing), source); err == nil {
				t.Fatal("unsafe entry accepted")
			}
		})
	}
	for _, test := range []struct {
		name        string
		count, size int
	}{{"file count", maxBundleFiles + 1, 1}, {"total bytes", 6, maxAssetBytes}} {
		t.Run(test.name, func(t *testing.T) {
			listing := entry("tool.ts", "1")
			for i := range test.count {
				listing += entry(fmt.Sprintf("files/%d", i), fmt.Sprint(test.size))
			}
			if _, err := parseGitFiles([]byte(listing), source); err == nil {
				t.Fatal("unbounded directory accepted")
			}
		})
	}
}

func TestGitFilesystemBoundaries(t *testing.T) {
	fsys := fs.NewOSFS()
	dir := physicalGitTestDir(t)
	file := filepath.Join(dir, "file")
	if err := os.WriteFile(file, []byte("local"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := safeGitDirectory(fsys, filepath.Join(file, "child")); err == nil {
		t.Fatal("regular-file ancestor accepted")
	}
	if err := absentGitDestination(fsys, filepath.Join(file, "child")); err == nil {
		t.Fatal("inaccessible destination accepted")
	}
	result := FetchResult{ID: "bat", Destination: filepath.Join(dir, "tools", "bat")}
	if err := publishGitFiles(fsys, filepath.Join(dir, "missing"), result); err == nil {
		t.Fatal("missing payload accepted")
	}
	if _, err := os.Stat(result.Destination); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed copy left partial import: %v", err)
	}
	payload := filepath.Join(dir, "payload")
	if err := os.MkdirAll(payload, 0700); err != nil {
		t.Fatal(err)
	}
	if err := publishGitFiles(fsys, payload, result); err == nil {
		t.Fatal("payload without definition accepted")
	}
	if _, err := os.Stat(result.Destination); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed publication left partial import: %v", err)
	}
	if err := writeGitFile(fsys, file, gitFile{path: "child", mode: 0644}, []byte("data")); err == nil {
		t.Fatal("file parent accepted")
	}
	if err := writeGitFile(fsys, dir, gitFile{path: "file", mode: 0644}, []byte("data")); err == nil {
		t.Fatal("existing file replaced")
	}
}

func TestGitRunnerCancellationAndMissingExecutable(t *testing.T) {
	dir := physicalGitTestDir(t)
	options := FetchOptions{ID: "bat", Repository: dir, TemporaryDir: filepath.Join(dir, ".tmp"), ToolsDir: filepath.Join(dir, "tools")}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Fetch(ctx, exec.NewOSRunner(), options); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	t.Setenv("PATH", physicalGitTestDir(t))
	if _, err := Fetch(context.Background(), exec.NewOSRunner(), options); err == nil {
		t.Fatal("missing git executable accepted")
	}
	options.ToolsDir = "relative"
	if _, err := Fetch(context.Background(), exec.NewOSRunner(), options); err == nil {
		t.Fatal("relative tool directory accepted")
	}
	options.ID = "../invalid"
	if _, err := Fetch(context.Background(), exec.NewOSRunner(), options); err == nil {
		t.Fatal("invalid selector accepted")
	}
}

func TestGitOutputLimit(t *testing.T) {
	out := limitedGitOutput{remaining: 3}
	if _, err := io.Copy(&out, io.LimitReader(strings.NewReader("oversized"), 9)); err == nil {
		t.Fatal("stream bypassed Git output limit")
	}
}

func TestGitRejectsDirectoryCaseCollision(t *testing.T) {
	listing := "100644 blob 0000000000000000000000000000000000000000 1\ttools/b/a/bat/A/asset\x00" +
		"100644 blob 0000000000000000000000000000000000000000 1\ttools/b/a/bat/a\x00" +
		"100644 blob 0000000000000000000000000000000000000000 1\ttools/b/a/bat/tool.ts\x00"
	if _, err := parseGitFiles([]byte(listing), "tools/b/a/bat"); err == nil {
		t.Fatal("accepted case-insensitive file/directory collision")
	}
}
