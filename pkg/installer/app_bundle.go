package installer

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// Prefixes of the siblings installAppBundle builds a new bundle in and moves the
// installed one aside to. The leading dot keeps them out of Finder while they exist.
const (
	stagingBundlePrefix  = ".dotfiles-new-"
	previousBundlePrefix = ".dotfiles-old-"
)

// bundleSibling names the entry beside dest that prefix marks.
func bundleSibling(dest, prefix string) string {
	return filepath.Join(filepath.Dir(dest), prefix+filepath.Base(dest))
}

// installAppBundle replaces the app bundle at dest with a copy of src, symlinks
// included, as v1's `rm -rf` of the old bundle followed by `cp -R` did: nothing the
// previous version shipped survives in the new one. The copy is built beside dest and
// only then swapped in, so a copy that fails part way leaves the installed app as it
// was, and a swap that fails moves the installed app back. Once the new bundle is in
// place the install has succeeded, so a failure to remove the replaced one is a warning
// on log; the next install removes it before moving its own predecessor aside.
func installAppBundle(fsys fs.FS, log *logger.Logger, src, dest string) error {
	staging := bundleSibling(dest, stagingBundlePrefix)
	previous := bundleSibling(dest, previousBundlePrefix)

	// A staging copy that is still there was left by an install that never finished.
	if err := fsys.RemoveAll(staging); err != nil {
		return fmt.Errorf("removing incomplete bundle %s: %w", staging, err)
	}
	if err := fs.CopyTree(fsys, src, staging); err != nil {
		_ = fsys.RemoveAll(staging) // best-effort cleanup; the copy error is the one to report
		return fmt.Errorf("copying %s: %w", src, err)
	}

	replacing, err := entryExists(fsys, dest)
	if err != nil {
		_ = fsys.RemoveAll(staging) // best-effort cleanup; the stat error is the one to report
		return err
	}
	if replacing {
		if err := moveAside(fsys, dest, previous); err != nil {
			_ = fsys.RemoveAll(staging) // best-effort cleanup; the move error is the one to report
			return err
		}
	}

	if err := fsys.Rename(staging, dest); err != nil {
		_ = fsys.RemoveAll(staging) // best-effort cleanup; the rename error is the one to report
		if !replacing {
			return fmt.Errorf("moving new bundle into %s: %w", dest, err)
		}
		if restoreErr := fsys.Rename(previous, dest); restoreErr != nil {
			return fmt.Errorf("moving new bundle into %s: %w; restoring the previous bundle from %s also failed: %v", dest, err, previous, restoreErr)
		}
		return fmt.Errorf("moving new bundle into %s (the previous bundle was restored): %w", dest, err)
	}

	if err := fsys.RemoveAll(previous); err != nil && log != nil {
		log.Warn(logger.Message(fmt.Sprintf("installed %s but could not remove the replaced bundle %s: %v", dest, previous, err)))
	}
	return nil
}

// moveAside renames the installed bundle at dest to previous, first removing a
// previous bundle an earlier install failed to remove.
func moveAside(fsys fs.FS, dest, previous string) error {
	if err := fsys.RemoveAll(previous); err != nil {
		return fmt.Errorf("removing previous bundle %s: %w", previous, err)
	}
	if err := fsys.Rename(dest, previous); err != nil {
		return fmt.Errorf("moving installed bundle %s aside: %w", dest, err)
	}
	return nil
}

// entryExists reports whether path names an entry, a dangling symlink included.
func entryExists(fsys fs.FS, path string) (bool, error) {
	_, err := fsys.Lstat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, fmt.Errorf("checking %s: %w", path, err)
}
