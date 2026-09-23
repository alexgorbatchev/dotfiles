package fs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// errUnsupportedFileType reports a tree entry that is neither a directory, a regular
// file nor a symlink. Copying a named pipe or a device by reading it would block or
// copy something other than the entry, so CopyTree refuses it instead.
var errUnsupportedFileType = errors.New("unsupported file type")

// ownerDirPerm is what CopyTree needs on a directory while it fills it in.
const ownerDirPerm os.FileMode = 0o700

// CopyTree copies src, a directory, a regular file or a symlink, to dest on fsys, the
// way `cp -R` does, except that extended attributes, resource forks and ACLs are not
// copied. Directories are recreated with src's permission bits, regular files are
// copied with theirs, and every symlink is recreated with the same target string,
// whether it names a file, a directory or nothing, rather than followed. A directory
// that already exists at dest is merged into. Any other existing entry where a
// directory or a symlink is to be created, a symlink to a directory included, is an
// error rather than something written through, so a caller that must replace a tree
// copies into a fresh dest.
func CopyTree(fsys FS, src, dest string) error {
	info, err := fsys.Lstat(src)
	if err != nil {
		return err
	}

	mode := info.Mode()
	switch {
	case mode&os.ModeSymlink != 0:
		target, err := fsys.Readlink(src)
		if err != nil {
			return err
		}
		return fsys.Symlink(target, dest)
	case mode.IsDir():
		return copyDirTree(fsys, src, dest, mode.Perm())
	case mode.IsRegular():
		return fsys.CopyFile(src, dest)
	default:
		return &os.PathError{Op: "copytree", Path: src, Err: fmt.Errorf("%w %s", errUnsupportedFileType, mode.Type())}
	}
}

// prepareDirDest creates the directory dest, or accepts the real directory already
// there. Anything else at dest, a symlink to a directory included, is an error: creating
// directories through a link would write the copy into whatever the link names.
func prepareDirDest(fsys FS, dest string, perm os.FileMode) error {
	info, err := fsys.Lstat(dest)
	if err == nil {
		if info.IsDir() {
			return nil
		}
		return &os.PathError{Op: "copytree", Path: dest, Err: os.ErrExist}
	}
	if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return fsys.MkdirAll(dest, perm)
}

// copyDirTree creates dest with room for the owner to write into it, copies src's
// entries, and only then applies perm, so a read-only source directory is still
// reproduced as one without its own permission blocking the copy of its contents. The
// final Chmod also restores the bits a umask takes from a new directory, keeping
// directories exact as CopyFile keeps files.
func copyDirTree(fsys FS, src, dest string, perm os.FileMode) error {
	if err := prepareDirDest(fsys, dest, perm|ownerDirPerm); err != nil {
		return err
	}
	names, err := fsys.ReadDir(src)
	if err != nil {
		return err
	}
	for _, name := range names {
		if err := CopyTree(fsys, filepath.Join(src, name), filepath.Join(dest, name)); err != nil {
			return err
		}
	}
	return fsys.Chmod(dest, perm)
}
