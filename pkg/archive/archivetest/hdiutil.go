// Package archivetest provides a stand-in for hdiutil, for tests of code that mounts
// disk images with archive.MountDmg.
package archivetest

import (
	"errors"
	"path/filepath"
	"slices"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// ErrResourceBusy is what hdiutil reports when a process holds a file on the volume
// open, the ordinary reason a detach fails.
var ErrResourceBusy = errors.New("hdiutil: couldn't unmount \"disk4\" - Resource busy")

// RefuseUnlessForced is a Detach that fails with ErrResourceBusy unless -force is
// passed, like a volume a process holds a file open on.
func RefuseUnlessForced(force bool) error {
	if force {
		return nil
	}
	return ErrResourceBusy
}

// Hdiutil models hdiutil attach and detach over FS. attach lays a volume out at its
// -mountpoint with Volume; a detach that Detach lets through unmounts the volume,
// which leaves the mount point an empty directory, as unmounting a real volume does.
type Hdiutil struct {
	FS fs.FS
	// Volume lays the volume out at the mount point; nil attaches an empty volume.
	Volume func(mountPoint string) error
	// AttachOutput is what attach prints, such as the reason a failing Volume gives.
	AttachOutput string
	// Detach decides the outcome of a detach from whether it was forced; nil lets
	// every detach through.
	Detach func(force bool) error
	// StayMounted keeps the volume's files at the mount point after a detach that
	// reports success.
	StayMounted bool
	// RemoveMountPoint removes the mount point itself when a detach unmounts the
	// volume, as a system that deletes mount points on unmount would.
	RemoveMountPoint bool
}

// Register makes h the hdiutil that runner runs.
func (h Hdiutil) Register(runner *exec.MockRunner) {
	runner.RegisterFunc("hdiutil", h.run)
}

func (h Hdiutil) run(c *exec.MockCmd) error {
	if len(c.Args) < 2 {
		return errors.New("hdiutil: missing arguments")
	}
	switch c.Args[0] {
	case "attach":
		mountPoint := flagValue(c.Args, "-mountpoint")
		if mountPoint == "" {
			return errors.New("hdiutil attach: no -mountpoint")
		}
		if h.AttachOutput != "" {
			c.SetOutput([]byte(h.AttachOutput))
		}
		if h.Volume == nil {
			return nil
		}
		return h.Volume(mountPoint)
	case "detach":
		if h.Detach != nil {
			if err := h.Detach(slices.Contains(c.Args, "-force")); err != nil {
				return err
			}
		}
		if h.StayMounted {
			return nil
		}
		return h.unmount(c.Args[1])
	}
	return errors.New("hdiutil: unexpected subcommand " + c.Args[0])
}

func (h Hdiutil) unmount(mountPoint string) error {
	// A volume root can deny writing; the mount point underneath does not.
	if err := h.FS.Chmod(mountPoint, 0o755); err != nil {
		return err
	}
	entries, err := h.FS.ReadDir(mountPoint)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if err := h.FS.RemoveAll(filepath.Join(mountPoint, entry)); err != nil {
			return err
		}
	}
	if h.RemoveMountPoint {
		return h.FS.Remove(mountPoint)
	}
	return nil
}

// VolumeFile returns a Volume holding one executable file at rel with content.
func VolumeFile(fsys fs.FS, rel, content string) func(mountPoint string) error {
	return func(mountPoint string) error {
		path := filepath.Join(mountPoint, rel)
		if err := fsys.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		return fsys.WriteFile(path, []byte(content), 0o755)
	}
}

// Calls returns the arguments of every hdiutil command runner ran, in order.
func Calls(runner *exec.MockRunner) [][]string {
	var calls [][]string
	for _, c := range runner.History {
		if c.Name == "hdiutil" {
			calls = append(calls, c.Args)
		}
	}
	return calls
}

// flagValue returns the argument following flag in args, or "" when there is none.
func flagValue(args []string, flag string) string {
	i := slices.Index(args, flag)
	if i < 0 || i+1 >= len(args) {
		return ""
	}
	return args[i+1]
}
