package orchestrator

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// copyPath puts a declared file or directory in place, and protects whatever was
// already there: a target whose contents differ is moved aside to <path>.bak
// before being overwritten, and a target that already holds the source content is
// registered without being rewritten.
func TestCopyPath(t *testing.T) {
	newFixture := func(t *testing.T) (*Orchestrator, fs.FS) {
		t.Helper()
		memFS := fs.NewMemFS()
		return newTestOrchestrator(t, memFS, ""), memFS
	}

	writeFile := func(t *testing.T, memFS fs.FS, path, content string) {
		t.Helper()
		if err := memFS.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("creating %s: %v", filepath.Dir(path), err)
		}
		if err := memFS.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("writing %s: %v", path, err)
		}
	}

	readFile := func(t *testing.T, memFS fs.FS, path string) string {
		t.Helper()
		data, err := memFS.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		return string(data)
	}

	t.Run("a missing source is reported", func(t *testing.T) {
		orch, _ := newFixture(t)
		err := orch.copyPath(context.Background(), "tool", "/home/user/absent", "/home/user/target")
		if err == nil {
			t.Fatal("expected an error for a source that does not exist")
		}
	})

	t.Run("copies a file into place", func(t *testing.T) {
		orch, memFS := newFixture(t)
		writeFile(t, memFS, "/home/user/src/config.toml", "theme = \"dark\"")

		if err := orch.copyPath(context.Background(), "tool", "/home/user/src/config.toml", "/home/user/dst/config.toml"); err != nil {
			t.Fatalf("copyPath returned error: %v", err)
		}
		if got := readFile(t, memFS, "/home/user/dst/config.toml"); got != "theme = \"dark\"" {
			t.Errorf("target contents = %q", got)
		}
	})

	t.Run("a differing target is backed up first", func(t *testing.T) {
		orch, memFS := newFixture(t)
		writeFile(t, memFS, "/home/user/src/config.toml", "new")
		writeFile(t, memFS, "/home/user/dst/config.toml", "existing")

		if err := orch.copyPath(context.Background(), "tool", "/home/user/src/config.toml", "/home/user/dst/config.toml"); err != nil {
			t.Fatalf("copyPath returned error: %v", err)
		}
		if got := readFile(t, memFS, "/home/user/dst/config.toml"); got != "new" {
			t.Errorf("target contents = %q, want the source's", got)
		}
		if got := readFile(t, memFS, "/home/user/dst/config.toml.bak"); got != "existing" {
			t.Errorf("backup contents = %q, want what the target held", got)
		}
	})

	t.Run("an older backup is replaced", func(t *testing.T) {
		orch, memFS := newFixture(t)
		writeFile(t, memFS, "/home/user/src/config.toml", "new")
		writeFile(t, memFS, "/home/user/dst/config.toml", "existing")
		writeFile(t, memFS, "/home/user/dst/config.toml.bak", "older backup")

		if err := orch.copyPath(context.Background(), "tool", "/home/user/src/config.toml", "/home/user/dst/config.toml"); err != nil {
			t.Fatalf("copyPath returned error: %v", err)
		}
		if got := readFile(t, memFS, "/home/user/dst/config.toml.bak"); got != "existing" {
			t.Errorf("backup contents = %q, want the target it just displaced", got)
		}
	})

	t.Run("a target that already matches is left alone", func(t *testing.T) {
		orch, memFS := newFixture(t)
		writeFile(t, memFS, "/home/user/src/config.toml", "same")
		writeFile(t, memFS, "/home/user/dst/config.toml", "same")

		if err := orch.copyPath(context.Background(), "tool", "/home/user/src/config.toml", "/home/user/dst/config.toml"); err != nil {
			t.Fatalf("copyPath returned error: %v", err)
		}
		if exists, _ := memFS.Exists("/home/user/dst/config.toml.bak"); exists {
			t.Error("a target that already held the source content was backed up anyway")
		}
	})

	t.Run("copies a directory recursively", func(t *testing.T) {
		orch, memFS := newFixture(t)
		writeFile(t, memFS, "/home/user/src/tree/a.txt", "a")
		writeFile(t, memFS, "/home/user/src/tree/nested/b.txt", "b")

		if err := orch.copyPath(context.Background(), "tool", "/home/user/src/tree", "/home/user/dst/tree"); err != nil {
			t.Fatalf("copyPath returned error: %v", err)
		}
		if got := readFile(t, memFS, "/home/user/dst/tree/a.txt"); got != "a" {
			t.Errorf("a.txt = %q", got)
		}
		if got := readFile(t, memFS, "/home/user/dst/tree/nested/b.txt"); got != "b" {
			t.Errorf("nested/b.txt = %q", got)
		}
	})
}
