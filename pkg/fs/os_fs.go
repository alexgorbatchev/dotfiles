package fs

import (
	"io"
	"os"
	"path/filepath"
)

// OSFS is an implementation of FS backed by the standard operating system filesystem.
type OSFS struct{}

func NewOSFS() *OSFS {
	return &OSFS{}
}

func (o *OSFS) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func (o *OSFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	return os.WriteFile(path, data, perm)
}

func (o *OSFS) Remove(path string) error {
	return os.Remove(path)
}

func (o *OSFS) Exists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func (o *OSFS) MkdirAll(path string, perm os.FileMode) error {
	return os.MkdirAll(path, perm)
}

func (o *OSFS) Create(path string) (io.WriteCloser, error) {
	return os.Create(path)
}

func (o *OSFS) Open(path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (o *OSFS) ReadDir(path string) ([]string, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names, nil
}

func (o *OSFS) Chmod(path string, perm os.FileMode) error {
	return os.Chmod(path, perm)
}

func (o *OSFS) Rename(oldname, newname string) error {
	return os.Rename(oldname, newname)
}

func (o *OSFS) Symlink(oldname, newname string) error {
	return os.Symlink(oldname, newname)
}

func (o *OSFS) Readlink(path string) (string, error) {
	return os.Readlink(path)
}

func (o *OSFS) Lstat(path string) (os.FileInfo, error) {
	return os.Lstat(path)
}

func (o *OSFS) Stat(path string) (os.FileInfo, error) {
	return os.Stat(path)
}

func (o *OSFS) RemoveAll(path string) error {
	return os.RemoveAll(path)
}

func (o *OSFS) Abs(path string) (string, error) {
	return filepath.Abs(path)
}

func (o *OSFS) CopyFile(src, dest string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	info, err := os.Stat(src)
	if err != nil {
		return err
	}

	destFile, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode().Perm())
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, srcFile)
	return err
}
