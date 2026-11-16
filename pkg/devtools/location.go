package devtools

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// ValidateLocation rejects development storage that aliases a managed directory
// or one of its ancestors or descendants. Existing symlink components are resolved
// through fsys; missing directories are allowed so first-time setup remains valid.
// The caller retains its configured path, including harmless home-directory aliases.
// Containers own only direct files: an independent subtree is allowed beneath them.
func ValidateLocation(fsys fs.FS, root string, managed []string, containers ...string) error {
	if root == "" {
		return fmt.Errorf("development tools directory is empty")
	}
	dev, err := resolveDirectory(fsys, root)
	if err != nil {
		return fmt.Errorf("resolving development tools directory: %w", err)
	}
	for _, path := range managed {
		if path == "" {
			continue
		}
		other, err := resolveDirectory(fsys, path)
		if err != nil {
			return fmt.Errorf("resolving managed directory: %w", err)
		}
		if containsDirectory(dev, other) || containsDirectory(other, dev) {
			return fmt.Errorf("paths.devToolsDir %q overlaps managed directory %q after resolving symbolic links; choose a separate directory such as {paths.generatedDir}/dev-tools", root, path)
		}
	}
	// A shim directory owns direct entries, not its descendants. It may contain
	// a separate development subtree but cannot itself be inside the dev store.
	for _, path := range containers {
		if path == "" {
			continue
		}
		other, err := resolveDirectory(fsys, path)
		if err != nil {
			return fmt.Errorf("resolving shim directory: %w", err)
		}
		if containsDirectory(dev, other) {
			return fmt.Errorf("paths.devToolsDir %q contains shim directory %q after resolving symbolic links", root, path)
		}
	}
	return nil
}

func containsDirectory(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// resolveDirectory follows components individually: a relative link containing
// ".." is interpreted from its resolved parent, never cleaned across another link.
// Unlike filepath.EvalSymlinks this works with injected filesystems and future paths.
func resolveDirectory(fsys fs.FS, path string) (string, error) {
	abs, err := fsys.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolving %q: %w", path, err)
	}
	resolved, pending := directoryComponents(abs)
	hops := 0
	for len(pending) > 0 {
		name := pending[0]
		pending = pending[1:]
		switch name {
		case ".":
			continue
		case "..":
			resolved = filepath.Dir(resolved)
			continue
		}
		next := filepath.Join(resolved, name)
		info, err := fsys.Lstat(next)
		if errors.Is(err, os.ErrNotExist) {
			resolved = next
			continue
		}
		if err != nil {
			return "", fmt.Errorf("inspecting directory %q: %w", next, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			if !info.IsDir() {
				return "", fmt.Errorf("%q is not a directory", next)
			}
			resolved = next
			continue
		}
		hops++
		if hops > 40 {
			return "", fmt.Errorf("resolving %q: too many symbolic links", path)
		}
		target, err := fsys.Readlink(next)
		if err != nil {
			return "", fmt.Errorf("reading symbolic link %q: %w", next, err)
		}
		if target == "" {
			return "", fmt.Errorf("symbolic link %q has an empty target", next)
		}
		base, parts := directoryComponents(target)
		if filepath.IsAbs(target) {
			resolved = base
		}
		pending = append(parts, pending...)
	}
	return resolved, nil
}

func directoryComponents(path string) (string, []string) {
	volume := filepath.VolumeName(path)
	parts := strings.FieldsFunc(path[len(volume):], func(r rune) bool { return r == '/' || r == rune(filepath.Separator) })
	return volume + string(filepath.Separator), parts
}
