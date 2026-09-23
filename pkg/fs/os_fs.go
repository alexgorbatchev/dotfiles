package fs

import (
	"errors"
	"fmt"
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

func (o *OSFS) OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	return os.OpenFile(path, flag, perm)
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

func (o *OSFS) IsAbs(path string) bool {
	return filepath.IsAbs(path)
}

func (o *OSFS) CopyFile(src, dest string) error {
	return copyFile(src, dest, func(f *os.File) io.WriteCloser { return f })
}

// copyTempPattern names the temporary file by a fixed prefix rather than after dest, so
// a dest name near the file system's name length limit still leaves room for it.
const copyTempPattern = ".dotfiles-copy-*"

// copyFile writes the copy to a temporary file beside dest and renames it over dest.
// Opening dest itself would follow a symlink there, and truncating it would empty
// src when the link points back at it; a rename replaces the directory entry
// without following it, and a failed copy leaves dest as it was. destWriter wraps
// the temporary file for writing and closing, which lets a test fail the close.
func copyFile(src, dest string, destWriter func(*os.File) io.WriteCloser) (err error) {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close() // opened read-only, so closing it cannot lose data

	info, err := srcFile.Stat()
	if err != nil {
		return err
	}
	if info.IsDir() {
		return &os.PathError{Op: "copyfile", Path: src, Err: os.ErrInvalid}
	}
	srcEntry, err := os.Lstat(src)
	if err != nil {
		return err
	}
	// Lstat, not Stat: a dest symlink is a separate entry to replace, while a dest
	// that is src itself is not. That covers dest being the file src resolves to
	// (the same path, src's link target, or a hard link) and dest being src's own
	// entry when src is a symlink, which replacing would turn into a regular file.
	destInfo, err := os.Lstat(dest)
	if err == nil && (os.SameFile(info, destInfo) || os.SameFile(srcEntry, destInfo)) {
		return &os.PathError{Op: "copyfile", Path: dest, Err: errSameFile}
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	destDir := filepath.Dir(dest)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(destDir, copyTempPattern)
	if err != nil {
		return fmt.Errorf("creating temporary file for %s: %w", dest, err)
	}
	defer func() {
		if err != nil {
			_ = os.Remove(tmp.Name()) // best-effort cleanup; the copy error is what matters
		}
	}()

	if err := tmp.Chmod(info.Mode().Perm()); err != nil {
		_ = tmp.Close() // the chmod error is the one to report
		return copyError(dest, tmp.Name(), err)
	}
	if err := WriteAndClose(destWriter(tmp), srcFile); err != nil {
		return copyError(dest, tmp.Name(), err)
	}
	if err := os.Rename(tmp.Name(), dest); err != nil {
		return copyError(dest, tmp.Name(), err)
	}
	return nil
}

// copyError reports a failed step of the copy against dest, the way MemFS reports its
// errors. The temporary file is gone by the time the caller sees the error, so an
// error that names it is reduced to its cause; one naming src is kept whole.
func copyError(dest, tmpPath string, err error) error {
	return &os.PathError{Op: "copyfile", Path: dest, Err: copyCause(tmpPath, err)}
}

// copyCause reduces an error that names the temporary file to its cause. A failed
// WriteAndClose is reduced part by part, since its copy and close errors can each name
// a different file.
func copyCause(tmpPath string, err error) error {
	var writeErr *writeError
	var pathErr *os.PathError
	var linkErr *os.LinkError
	switch {
	case errors.As(err, &writeErr):
		return &writeError{copyErr: copyCause(tmpPath, writeErr.copyErr), closeErr: copyCause(tmpPath, writeErr.closeErr)}
	case errors.As(err, &pathErr) && pathErr.Path == tmpPath:
		return pathErr.Err
	case errors.As(err, &linkErr) && linkErr.Old == tmpPath:
		return linkErr.Err
	}
	return err
}
