package installer

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// OutsideLinkPolicy decides what PromoteBinaries does with a binary that is a symlink,
// or reached through one, whose final target lies outside the directory it searched.
// Whatever the policy, PromoteBinaries never changes the mode of a file outside that
// directory.
type OutsideLinkPolicy int

const (
	// RejectOutsideLinks fails the promotion. It is for a tree an installer extracted
	// from a downloaded archive, whose links were written by whoever published the
	// asset: a .dmg volume, which keeps its links (see pkg/archive), can hold one named
	// after the binary that points at any file the user owns.
	RejectOutsideLinks OutsideLinkPolicy = iota
	// KeepOutsideLinks keeps the link and leaves its target's mode alone, failing the
	// promotion when the target is not already executable. It is for a directory a
	// tool's own installer populated (a curl-script staging directory, a cargo install
	// --root), which may legitimately leave the binary as a link into the tool's store.
	KeepOutsideLinks
)

// executableTarget returns the file to make executable for the binary at path: the file
// its link chain finally names, when that lies inside destDir, or "" when the policy
// keeps a link to an executable file outside it as it is. A link outside that the
// policy refuses, or one to a file that is not executable, is an error naming the link
// and its target.
func (p binaryPromoter) executableTarget(binName, path string) (string, error) {
	target, err := resolveLinks(p.fsys, path)
	if err != nil {
		return "", fmt.Errorf("binary %q: %w", binName, err)
	}
	link := path
	if linkTarget, err := p.fsys.Readlink(path); err == nil {
		link = fmt.Sprintf("%s -> %s", path, linkTarget)
	}
	info, err := p.fsys.Lstat(target)
	if err != nil {
		return "", fmt.Errorf("binary %q: inspecting %s: %w", binName, target, err)
	}
	inside := isWithin(p.realDestDir, target)
	if !inside && p.policy != KeepOutsideLinks {
		return "", fmt.Errorf("binary %q is the symlink %s, which resolves to %s outside the extracted archive %s; refusing to install a binary from outside it",
			binName, link, target, p.displayDestDir())
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("binary %q at %s resolves to %s, which is not a regular file", binName, link, target)
	}
	if inside {
		// The same file, named below destDir as the caller wrote it, so that a chmod is
		// logged and tracked under the directory the user configured.
		rel, err := filepath.Rel(p.realDestDir, target)
		if err != nil {
			return "", fmt.Errorf("binary %q: resolving %s relative to %s: %w", binName, target, p.realDestDir, err)
		}
		return filepath.Join(p.destDir, rel), nil
	}
	if info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("binary %q is the symlink %s, which resolves to %s outside %s, and that is not an executable file; its mode is left as it is",
			binName, link, target, p.displayDestDir())
	}
	return "", nil
}

// displayDestDir names destDir for an error, with the path it resolves to when that
// differs, so that a resolved target is compared against a path of the same form.
func (p binaryPromoter) displayDestDir() string {
	if p.realDestDir == filepath.Clean(p.destDir) {
		return p.destDir
	}
	return fmt.Sprintf("%s (%s)", p.destDir, p.realDestDir)
}

// makeExecutable makes the binary at path executable, changing the mode only of a file
// inside destDir (see executableTarget).
func (p binaryPromoter) makeExecutable(binName, path string) error {
	target, err := p.executableTarget(binName, path)
	if err != nil || target == "" {
		return err
	}
	if err := p.fsys.Chmod(target, 0o755); err != nil {
		return fmt.Errorf("making %q executable: %w", path, err)
	}
	return nil
}

// maxLinkHops bounds how many symlinks resolveLinks follows, so that a link cycle is an
// error rather than a hang. It is Linux's MAXSYMLINKS; macOS stops at 32.
const maxLinkHops = 40

// resolveLinks returns the path that path names once every symlink in it, in any
// component, is replaced by what it points to. Each component is looked up through
// fsys with Lstat and Readlink, so that a MemFS resolves exactly as the host does, and
// a ".." is applied to the path resolved so far, as the kernel applies it, never
// lexically across a link. path must be absolute; every component must exist.
func resolveLinks(fsys fs.FS, path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("resolving %q: not an absolute path", path)
	}
	const sep = string(filepath.Separator)
	resolved := sep
	pending := linkComponents(path)
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
		if err != nil {
			return "", fmt.Errorf("resolving %q: %w", path, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			// As for the kernel, only a directory can be followed by another component,
			// ".." included: "file/.." is ENOTDIR, not the file's directory.
			if !info.IsDir() && len(pending) > 0 {
				return "", fmt.Errorf("resolving %q: %w", path, &os.PathError{Op: "lstat", Path: next, Err: syscall.ENOTDIR})
			}
			resolved = next
			continue
		}
		hops++
		if hops > maxLinkHops {
			return "", fmt.Errorf("resolving %q: too many levels of symbolic links", path)
		}
		target, err := fsys.Readlink(next)
		if err != nil {
			return "", fmt.Errorf("resolving %q: %w", path, err)
		}
		if target == "" {
			return "", fmt.Errorf("resolving %q: %w", path, &os.PathError{Op: "readlink", Path: next, Err: syscall.ENOENT})
		}
		// A link target is read by the kernel, which gives "~" no meaning, so this is
		// the host's notion of absolute rather than ResolvedFS.IsAbs.
		if filepath.IsAbs(target) {
			resolved = sep
		}
		pending = append(linkComponents(target), pending...)
	}
	return resolved, nil
}

// linkComponents returns the non-empty components of path. A trailing separator becomes
// a final ".", so that, as for the kernel, it names a directory and "file/" is ENOTDIR.
func linkComponents(path string) []string {
	parts := strings.FieldsFunc(path, func(r rune) bool { return r == filepath.Separator })
	if len(parts) > 0 && strings.HasSuffix(path, string(filepath.Separator)) {
		parts = append(parts, ".")
	}
	return parts
}

// isWithin reports whether path lies strictly below dir. Both must be resolved paths.
func isWithin(dir, path string) bool {
	return strings.HasPrefix(path, strings.TrimSuffix(dir, string(filepath.Separator))+string(filepath.Separator))
}
