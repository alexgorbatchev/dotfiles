package backup

import (
	"errors"
	"os"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func newMemFS(t *testing.T) *fs.MemFS {
	t.Helper()
	mem := fs.NewMemFS()
	if err := mem.MkdirAll("/home/user", 0755); err != nil {
		t.Fatalf("creating home: %v", err)
	}
	return mem
}

func write(t *testing.T, mem *fs.MemFS, path, content string) {
	t.Helper()
	if err := mem.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
}

func read(t *testing.T, mem *fs.MemFS, path string) string {
	t.Helper()
	data, err := mem.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return string(data)
}

func TestReserveUsesThePlainNameWhenItIsFree(t *testing.T) {
	mem := newMemFS(t)

	got, err := Reserve(mem, "/home/user/.gitconfig")
	if err != nil {
		t.Fatalf("reserving: %v", err)
	}
	if got != "/home/user/.gitconfig.bak" {
		t.Errorf("reserved %q, want the plain .bak name", got)
	}
}

// TestReserveNeverReturnsAnOccupiedPath is the whole point of the package. The
// previous behaviour deleted an existing .bak before renaming over it, so the second
// run of generate destroyed the copy of the file as it was before dotfiles ever
// touched it -- the one copy that could not be reproduced from the repository.
func TestReserveNeverReturnsAnOccupiedPath(t *testing.T) {
	mem := newMemFS(t)
	write(t, mem, "/home/user/.gitconfig.bak", "the original, from before dotfiles")
	write(t, mem, "/home/user/.gitconfig.bak.2", "the first overwrite")

	got, err := Reserve(mem, "/home/user/.gitconfig")
	if err != nil {
		t.Fatalf("reserving: %v", err)
	}
	if got != "/home/user/.gitconfig.bak.3" {
		t.Errorf("reserved %q, want the first free name", got)
	}
	if read(t, mem, "/home/user/.gitconfig.bak") != "the original, from before dotfiles" {
		t.Error("the oldest backup was disturbed")
	}
}

// TestMovePreservesEveryGeneration walks the sequence the bug report describes:
// dotfiles takes over a file, the user edits it, dotfiles takes it over again. Every
// version the user had must still be on disk afterwards.
func TestMovePreservesEveryGeneration(t *testing.T) {
	mem := newMemFS(t)
	const path = "/home/user/.gitconfig"

	write(t, mem, path, "the original, from before dotfiles")
	first, err := Move(mem, path)
	if err != nil {
		t.Fatalf("first backup: %v", err)
	}

	write(t, mem, path, "edited by the user")
	second, err := Move(mem, path)
	if err != nil {
		t.Fatalf("second backup: %v", err)
	}

	if first == second {
		t.Fatalf("both backups landed at %q, so the first was destroyed", first)
	}
	if got := read(t, mem, first); got != "the original, from before dotfiles" {
		t.Errorf("the original backup now holds %q", got)
	}
	if got := read(t, mem, second); got != "edited by the user" {
		t.Errorf("the second backup holds %q", got)
	}
	if exists, _ := mem.Exists(path); exists {
		t.Error("the file was left in place rather than moved aside")
	}
}

func TestMoveIsANoOpWhenThereIsNothingThere(t *testing.T) {
	mem := newMemFS(t)

	got, err := Move(mem, "/home/user/.gitconfig")
	if err != nil {
		t.Fatalf("backing up a path with nothing at it: %v", err)
	}
	if got != "" {
		t.Errorf("reported a backup at %q, but there was nothing to back up", got)
	}
}

// TestMoveHandlesADirectory covers a .copy() whose target is a tree.
func TestMoveHandlesADirectory(t *testing.T) {
	mem := newMemFS(t)
	if err := mem.MkdirAll("/home/user/.config/tool", 0755); err != nil {
		t.Fatalf("creating directory: %v", err)
	}
	write(t, mem, "/home/user/.config/tool/theme.toml", "dark")

	got, err := Move(mem, "/home/user/.config/tool")
	if err != nil {
		t.Fatalf("backing up a directory: %v", err)
	}
	if read(t, mem, got+"/theme.toml") != "dark" {
		t.Error("the directory's contents did not come with it")
	}
}

type failingFS struct {
	fs.FS
	lstatErr  error
	renameErr error
}

func (f *failingFS) Lstat(path string) (os.FileInfo, error) {
	if f.lstatErr != nil {
		return nil, f.lstatErr
	}
	return f.FS.Lstat(path)
}

func (f *failingFS) Rename(oldPath, newPath string) error {
	if f.renameErr != nil {
		return f.renameErr
	}
	return f.FS.Rename(oldPath, newPath)
}

func TestErrors(t *testing.T) {
	mem := newMemFS(t)
	write(t, mem, "/home/user/file.txt", "content")

	// Lstat error in occupied
	fErr := &failingFS{FS: mem, lstatErr: errors.New("lstat error")}
	if _, err := Move(fErr, "/home/user/file.txt"); err == nil {
		t.Error("expected error from Move on lstat failure")
	}
	if _, err := Reserve(fErr, "/home/user/file.txt"); err == nil {
		t.Error("expected error from Reserve on lstat failure")
	}

	// Rename error in Move
	rErr := &failingFS{FS: mem, renameErr: errors.New("rename error")}
	if _, err := Move(rErr, "/home/user/file.txt"); err == nil {
		t.Error("expected error from Move on rename failure")
	}
}
