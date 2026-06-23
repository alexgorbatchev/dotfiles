package symlink

import (
	"fmt"
	"os"
	"path/filepath"
)

// FileSystem defines the filesystem operations needed by the symlink package.
type FileSystem interface {
	Abs(path string) (string, error)
	Stat(path string) (os.FileInfo, error)
	Lstat(path string) (os.FileInfo, error)
	Readlink(path string) (string, error)
	Remove(path string) error
	RemoveAll(path string) error
	MkdirAll(path string, perm os.FileMode) error
	Symlink(oldname, newname string) error
	Rename(oldname, newname string) error
}

type realFS struct{}

func (realFS) Abs(path string) (string, error)              { return filepath.Abs(path) }
func (realFS) Stat(path string) (os.FileInfo, error)        { return os.Stat(path) }
func (realFS) Lstat(path string) (os.FileInfo, error)       { return os.Lstat(path) }
func (realFS) Readlink(path string) (string, error)         { return os.Readlink(path) }
func (realFS) Remove(path string) error                     { return os.Remove(path) }
func (realFS) RemoveAll(path string) error                  { return os.RemoveAll(path) }
func (realFS) MkdirAll(path string, perm os.FileMode) error { return os.MkdirAll(path, perm) }
func (realFS) Symlink(oldname, newname string) error        { return os.Symlink(oldname, newname) }
func (realFS) Rename(oldname, newname string) error         { return os.Rename(oldname, newname) }

// Options holds configuration for symlink operations.
type Options struct {
	Overwrite bool
	Backup    bool
}

// Evaluator manages symlink analysis, safety, and creation.
type Evaluator struct {
	fs FileSystem
}

// NewEvaluator creates a new Evaluator instance with standard os operations.
func NewEvaluator() *Evaluator {
	return &Evaluator{fs: realFS{}}
}

// NewEvaluatorWithFS creates a new Evaluator instance with a custom FileSystem.
func NewEvaluatorWithFS(fs FileSystem) *Evaluator {
	return &Evaluator{fs: fs}
}

// CreateSymlink safely creates a symbolic link from source to target.
// It verifies target destinations, handles existing files/folders, and handles overwrite/backup options.
// Returns (wasCreated, error).
func (e *Evaluator) CreateSymlink(source, target string, opts Options) (bool, error) {
	absSource, err := e.fs.Abs(source)
	if err != nil {
		return false, fmt.Errorf("getting absolute source path: %w", err)
	}

	absTarget, err := e.fs.Abs(target)
	if err != nil {
		return false, fmt.Errorf("getting absolute target path: %w", err)
	}

	// Check if source exists
	_, err = e.fs.Stat(absSource)
	if err != nil {
		if os.IsNotExist(err) {
			return false, fmt.Errorf("source path does not exist: %s", absSource)
		}
		return false, fmt.Errorf("stat source path: %w", err)
	}

	// Check if target exists (or is a symlink)
	tgtLstatInfo, tgtLstatErr := e.fs.Lstat(absTarget)
	tgtExists := tgtLstatErr == nil
	if tgtLstatErr != nil && !os.IsNotExist(tgtLstatErr) {
		return false, fmt.Errorf("lstat target path: %w", tgtLstatErr)
	}

	if tgtExists {
		if tgtLstatInfo.Mode()&os.ModeSymlink != 0 {
			linkTarget, err := e.fs.Readlink(absTarget)
			if err != nil {
				return false, fmt.Errorf("reading existing symlink: %w", err)
			}

			resolvedLinkTarget := linkTarget
			if !filepath.IsAbs(linkTarget) {
				resolvedLinkTarget = filepath.Join(filepath.Dir(absTarget), linkTarget)
			}
			resolvedLinkTargetAbs, err := e.fs.Abs(resolvedLinkTarget)
			if err != nil {
				return false, fmt.Errorf("resolving relative symlink target: %w", err)
			}

			if resolvedLinkTargetAbs == absSource {
				// Symlink is already correct and points to correct source
				return false, nil
			}

			if opts.Overwrite {
				if err := e.fs.Remove(absTarget); err != nil {
					return false, fmt.Errorf("removing old wrong symlink: %w", err)
				}
			} else {
				return false, fmt.Errorf("target is a symlink pointing to %s, and overwrite is false", resolvedLinkTargetAbs)
			}
		} else {
			if opts.Backup {
				backupPath := absTarget + ".bak"
				// If backup path already exists, remove it first
				if _, err := e.fs.Stat(backupPath); err == nil {
					_ = e.fs.RemoveAll(backupPath)
				}
				if err := e.fs.Rename(absTarget, backupPath); err != nil {
					return false, fmt.Errorf("backing up target file: %w", err)
				}
			} else if opts.Overwrite {
				if tgtLstatInfo.IsDir() {
					if err := e.fs.RemoveAll(absTarget); err != nil {
						return false, fmt.Errorf("removing existing target directory: %w", err)
					}
				} else {
					if err := e.fs.Remove(absTarget); err != nil {
						return false, fmt.Errorf("removing existing target file: %w", err)
					}
				}
			} else {
				return false, fmt.Errorf("target already exists and overwrite is false")
			}
		}
	}

	targetDir := filepath.Dir(absTarget)
	if err := e.fs.MkdirAll(targetDir, 0755); err != nil {
		return false, fmt.Errorf("creating target parent directory: %w", err)
	}

	if err := e.fs.Symlink(absSource, absTarget); err != nil {
		return false, fmt.Errorf("creating symlink: %w", err)
	}

	verifyLinkTarget, err := e.fs.Readlink(absTarget)
	if err != nil {
		return false, fmt.Errorf("verifying created symlink: %w", err)
	}
	if !filepath.IsAbs(verifyLinkTarget) {
		verifyLinkTarget = filepath.Join(filepath.Dir(absTarget), verifyLinkTarget)
	}
	verifyLinkTargetAbs, err := e.fs.Abs(verifyLinkTarget)
	if err != nil {
		return false, fmt.Errorf("resolving verified symlink target: %w", err)
	}
	if verifyLinkTargetAbs != absSource {
		return false, fmt.Errorf("symlink verification failed: points to %s, expected %s", verifyLinkTargetAbs, absSource)
	}

	return true, nil
}

// RemoveSymlink removes a symlink at target if it exists.
// If verifySource is provided, it only removes the symlink if it points to that source.
// Returns (wasRemoved, error).
func (e *Evaluator) RemoveSymlink(target string, verifySource string) (bool, error) {
	absTarget, err := e.fs.Abs(target)
	if err != nil {
		return false, fmt.Errorf("getting absolute target path: %w", err)
	}

	tgtLstatInfo, err := e.fs.Lstat(absTarget)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("stat target: %w", err)
	}

	if tgtLstatInfo.Mode()&os.ModeSymlink == 0 {
		return false, nil
	}

	if verifySource != "" {
		absSource, err := e.fs.Abs(verifySource)
		if err != nil {
			return false, fmt.Errorf("getting absolute source path: %w", err)
		}

		linkTarget, err := e.fs.Readlink(absTarget)
		if err != nil {
			return false, fmt.Errorf("reading symlink: %w", err)
		}

		if !filepath.IsAbs(linkTarget) {
			linkTarget = filepath.Join(filepath.Dir(absTarget), linkTarget)
		}
		linkTargetAbs, err := e.fs.Abs(linkTarget)
		if err != nil {
			return false, fmt.Errorf("resolving link target: %w", err)
		}

		if linkTargetAbs != absSource {
			return false, nil
		}
	}

	if err := e.fs.Remove(absTarget); err != nil {
		return false, fmt.Errorf("removing symlink: %w", err)
	}

	return true, nil
}
