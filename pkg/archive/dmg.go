package archive

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// hdiutilAttachFlags attach an image read-only, since nothing that mounts one writes to
// the volume, and keep the volume out of the Finder: -nobrowse hides it, and
// -noautoopen stops the Finder opening a window for it.
var hdiutilAttachFlags = []string{"-readonly", "-nobrowse", "-noautoopen"}

// MountDmg attaches the disk image at image to mountPoint with hdiutil and returns
// the function that detaches it again, which the caller must call exactly once and
// whose error it must report. mountPoint is created through fsys and must not exist
// yet, or be an empty directory: an image is never attached over files, which may
// be a volume a previous image is still attached with.
//
// detach runs hdiutil detach, retries once with -force when that fails, and then
// removes the mount point with Remove, which removes only an empty directory. When
// the image stays attached, detach fails naming the mount point and leaves it in
// place; the mount point is never removed recursively, since that would delete the
// files of a volume that is still mounted there. detach ignores the cancellation of
// ctx, so a cancelled operation still detaches its image.
func MountDmg(ctx context.Context, runner exec.CommandRunner, fsys fs.FS, image, mountPoint string) (detach func() error, err error) {
	if err := prepareMountPoint(fsys, mountPoint); err != nil {
		return nil, err
	}
	args := append([]string{"attach"}, hdiutilAttachFlags...)
	args = append(args, "-mountpoint", mountPoint, image)
	if out, err := runner.CommandContext(ctx, "hdiutil", args...).CombinedOutput(); err != nil {
		attachErr := fmt.Errorf("attaching %s at %s: %w", image, mountPoint, commandError(out, err))
		if removeErr := fsys.Remove(mountPoint); removeErr != nil {
			return nil, errors.Join(attachErr, fmt.Errorf("removing mount point %s: %w", mountPoint, removeErr))
		}
		return nil, attachErr
	}
	detachCtx := context.WithoutCancel(ctx)
	return func() error { return detachDmg(detachCtx, runner, fsys, mountPoint) }, nil
}

// prepareMountPoint creates mountPoint, or accepts it as it is when it is already an
// empty directory. A symlink is refused like any other non-directory, since hdiutil
// would mount wherever it points.
func prepareMountPoint(fsys fs.FS, mountPoint string) error {
	info, err := fsys.Lstat(mountPoint)
	if errors.Is(err, os.ErrNotExist) {
		if err := fsys.MkdirAll(mountPoint, 0o755); err != nil {
			return fmt.Errorf("creating mount point %s: %w", mountPoint, err)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspecting mount point %s: %w", mountPoint, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("mount point %s exists and is not a directory", mountPoint)
	}
	entries, err := fsys.ReadDir(mountPoint)
	if err != nil {
		return fmt.Errorf("inspecting mount point %s: %w", mountPoint, err)
	}
	if len(entries) > 0 {
		return fmt.Errorf("mount point %s is not empty; if a disk image is still attached there, detach it with `hdiutil detach %s`", mountPoint, mountPoint)
	}
	return nil
}

func detachDmg(ctx context.Context, runner exec.CommandRunner, fsys fs.FS, mountPoint string) error {
	out, err := runner.CommandContext(ctx, "hdiutil", "detach", mountPoint).CombinedOutput()
	if err != nil {
		forceOut, forceErr := runner.CommandContext(ctx, "hdiutil", "detach", mountPoint, "-force").CombinedOutput()
		if forceErr != nil {
			return fmt.Errorf("detaching the disk image mounted at %s, which is left in place: %w",
				mountPoint, errors.Join(commandError(out, err), fmt.Errorf("with -force: %w", commandError(forceOut, forceErr))))
		}
	}
	// Whether unmounting removes a mount point it did not create is up to the system;
	// one that is already gone needs no removing.
	if err := fsys.Remove(mountPoint); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("removing mount point %s after detaching its disk image: %w", mountPoint, err)
	}
	return nil
}

// commandError adds what a failed command printed to its error.
func commandError(out []byte, err error) error {
	if msg := strings.TrimSpace(string(out)); msg != "" {
		return fmt.Errorf("%w: %s", err, msg)
	}
	return err
}

// dmgMountPoint is where extractDmg mounts an image it extracts into dest: a hidden
// sibling of dest, so the mount point is on the file system the extraction goes
// through and outside the tree it walks and copies into.
func dmgMountPoint(dest string) string {
	clean := filepath.Clean(dest)
	return filepath.Join(filepath.Dir(clean), "."+filepath.Base(clean)+".dmg-mount")
}
