// Package backup moves aside whatever occupies a path dotfiles is about to write,
// without ever destroying a backup it made earlier.
//
// The earlier behaviour deleted an existing <path>.bak before renaming over it. The
// first run therefore preserved the file as it was before dotfiles existed, and the
// second run destroyed exactly that copy -- the one version of the file that could
// not be reproduced from the repository.
package backup

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// suffix is what a backup is recognisable by.
const suffix = ".bak"

// maxAttempts bounds the search for a free name. Reaching it means something is
// generating backups without ever clearing them, which is worth reporting rather
// than looping over.
const maxAttempts = 1000

// Reserve returns a backup path that nothing occupies.
//
// The first backup of a file is the plain <path>.bak, which is what a user looking
// for it expects; later ones are numbered from two, so the sequence reads in the
// order it was made.
func Reserve(fsys fs.FS, path string) (string, error) {
	candidate := path + suffix
	for attempt := 2; attempt < maxAttempts; attempt++ {
		taken, err := occupied(fsys, candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s%s.%d", path, suffix, attempt)
	}
	return "", fmt.Errorf("no free backup name for %s after %d attempts", path, maxAttempts)
}

// Move renames whatever is at path to a free backup path and returns it. An empty
// string means there was nothing there to move.
func Move(fsys fs.FS, path string) (string, error) {
	taken, err := occupied(fsys, path)
	if err != nil {
		return "", err
	}
	if !taken {
		return "", nil
	}

	destination, err := Reserve(fsys, path)
	if err != nil {
		return "", err
	}
	if err := fsys.Rename(path, destination); err != nil {
		return "", fmt.Errorf("backing up %s to %s: %w", path, destination, err)
	}
	return destination, nil
}

// occupied reports whether anything at all sits at path. Lstat rather than Stat, so
// that a broken symlink counts as something worth preserving rather than as an
// absence to write over.
func occupied(fsys fs.FS, path string) (bool, error) {
	_, err := fsys.Lstat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, fmt.Errorf("checking %s: %w", path, err)
}
