package fs

import (
	"errors"
	"fmt"
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
	OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error)
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
	IsAbs(path string) bool
	// CopyFile replaces dest with a copy of src, keeping src's permission bits. A dest
	// that already exists, including a symlink, is replaced rather than written
	// through, and src is never modified. Copying a file onto itself fails.
	CopyFile(src, dest string) error
}

// errSameFile reports a CopyFile whose source and destination are the same file.
var errSameFile = errors.New("source and destination are the same file")

// ErrClose marks any error Close returned for a written file. It usually means the
// operating system could not commit a write, so what the file holds is unknown, even
// the bytes before a copy that stopped part way, and it cannot be resumed onto or
// trusted. On a TrackedFileSystem it can also be a failure to record the file after it
// closed cleanly; callers discard the file in that case too, as a precaution.
var ErrClose = errors.New("closing file")

// WriteAndClose copies r into w and then closes w, returning the errors from either.
// Some write failures surface only when the file is closed (a full disk, an exceeded
// quota, a network file system flushing deferred writes), so a file whose close result
// was not checked may be incomplete. w is closed even when the copy fails. A failed
// close is reported wrapped in ErrClose, joined with the copy error when both fail.
func WriteAndClose(w io.WriteCloser, r io.Reader) error {
	_, copyErr := io.Copy(w, r)
	closeErr := w.Close()
	if copyErr == nil && closeErr == nil {
		return nil
	}
	return &writeError{copyErr: copyErr, closeErr: closeErr}
}

// writeError is a failed WriteAndClose: the copy error, the close error, or both. It
// matches ErrClose when the close failed, and unwraps to each error it holds.
type writeError struct {
	copyErr  error
	closeErr error
}

func (e *writeError) Error() string {
	switch {
	case e.closeErr == nil:
		return e.copyErr.Error()
	case e.copyErr == nil:
		return fmt.Sprintf("%v: %v", ErrClose, e.closeErr)
	default:
		return fmt.Sprintf("%v; %v: %v", e.copyErr, ErrClose, e.closeErr)
	}
}

func (e *writeError) Is(target error) bool {
	return target == ErrClose && e.closeErr != nil
}

func (e *writeError) Unwrap() []error {
	errs := make([]error, 0, 2)
	for _, err := range []error{e.copyErr, e.closeErr} {
		if err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}
