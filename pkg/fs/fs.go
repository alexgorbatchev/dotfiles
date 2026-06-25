package fs

import (
	"io"
	"os"
)

// FS is the unified file system interface supporting standard operations
// for both physical (os_fs) and mocked in-memory (mem_fs) targets.
type FS interface {
	ReadFile(path string) ([]byte, error)
	WriteFile(path string, data []byte, perm os.FileMode) error
	Remove(path string) error
	Exists(path string) (bool, error)
	MkdirAll(path string, perm os.FileMode) error
	Create(path string) (io.WriteCloser, error)
	Open(path string) (io.ReadCloser, error)
	ReadDir(path string) ([]string, error)
	Chmod(path string, perm os.FileMode) error
	Rename(oldname, newname string) error

	Symlink(oldname, newname string) error
	Readlink(path string) (string, error)
	Lstat(path string) (os.FileInfo, error)
	Stat(path string) (os.FileInfo, error)
	RemoveAll(path string) error
	Abs(path string) (string, error)
}
