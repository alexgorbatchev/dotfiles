package fs

import (
	"io"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// ResolvedFS is a decorator wrapping any core filesystem instance.
// It automatically intercepts all path arguments, expanding the user's home shortcut (~ and ~/)
// using utils.ExpandHomePath before delegating to the underlying file system.
type ResolvedFS struct {
	inner   FS
	homeDir string
}

// NewResolvedFS instantiates a new ResolvedFS decorator wrapping the given FS.
// If homeDir is empty, it retrieves the user's home directory path from the operating system dynamically.
func NewResolvedFS(inner FS, homeDir string) *ResolvedFS {
	if homeDir == "" {
		h, err := os.UserHomeDir()
		if err == nil {
			homeDir = h
		}
	}
	return &ResolvedFS{
		inner:   inner,
		homeDir: homeDir,
	}
}

// SetHomeDir updates the home directory path dynamically if non-empty.
func (r *ResolvedFS) SetHomeDir(homeDir string) {
	if homeDir != "" {
		r.homeDir = homeDir
	}
}

// HomeDir returns the currently configured home directory.
func (r *ResolvedFS) HomeDir() string {
	return r.homeDir
}

func (r *ResolvedFS) expand(path string) string {
	expanded := utils.ExpandHomePath(r.homeDir, path)
	return filepath.Clean(expanded)
}

func (r *ResolvedFS) ReadFile(path string) ([]byte, error) {
	return r.inner.ReadFile(r.expand(path))
}

func (r *ResolvedFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	return r.inner.WriteFile(r.expand(path), data, perm)
}

func (r *ResolvedFS) Remove(path string) error {
	return r.inner.Remove(r.expand(path))
}

func (r *ResolvedFS) Exists(path string) (bool, error) {
	return r.inner.Exists(r.expand(path))
}

func (r *ResolvedFS) MkdirAll(path string, perm os.FileMode) error {
	return r.inner.MkdirAll(r.expand(path), perm)
}

func (r *ResolvedFS) Create(path string) (io.WriteCloser, error) {
	return r.inner.Create(r.expand(path))
}

func (r *ResolvedFS) OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	return r.inner.OpenFile(r.expand(path), flag, perm)
}

func (r *ResolvedFS) Open(path string) (io.ReadCloser, error) {
	return r.inner.Open(r.expand(path))
}

func (r *ResolvedFS) ReadDir(path string) ([]string, error) {
	return r.inner.ReadDir(r.expand(path))
}

func (r *ResolvedFS) Chmod(path string, perm os.FileMode) error {
	return r.inner.Chmod(r.expand(path), perm)
}

func (r *ResolvedFS) Rename(oldname, newname string) error {
	return r.inner.Rename(r.expand(oldname), r.expand(newname))
}

func (r *ResolvedFS) Symlink(oldname, newname string) error {
	return r.inner.Symlink(r.expand(oldname), r.expand(newname))
}

func (r *ResolvedFS) Readlink(path string) (string, error) {
	return r.inner.Readlink(r.expand(path))
}

func (r *ResolvedFS) Lstat(path string) (os.FileInfo, error) {
	return r.inner.Lstat(r.expand(path))
}

func (r *ResolvedFS) Stat(path string) (os.FileInfo, error) {
	return r.inner.Stat(r.expand(path))
}

func (r *ResolvedFS) RemoveAll(path string) error {
	return r.inner.RemoveAll(r.expand(path))
}

func (r *ResolvedFS) Abs(path string) (string, error) {
	return r.inner.Abs(r.expand(path))
}

func (r *ResolvedFS) CopyFile(src, dest string) error {
	return r.inner.CopyFile(r.expand(src), r.expand(dest))
}
