package archivetest

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const (
	mountPoint = "/stage/mnt"
	volumeRel  = "App.app/Contents/MacOS/app"
	volumePath = mountPoint + "/" + volumeRel
)

// run attaches the image and then runs each of detaches, returning the error of each
// command in order.
func run(t *testing.T, h Hdiutil, detaches ...[]string) (*exec.MockRunner, []error) {
	t.Helper()
	runner := exec.NewMockRunner()
	h.Register(runner)
	errs := []error{runner.CommandContext(context.Background(), "hdiutil", "attach", "-readonly", "-mountpoint", mountPoint, "/stage/app.dmg").Run()}
	for _, args := range detaches {
		errs = append(errs, runner.CommandContext(context.Background(), "hdiutil", args...).Run())
	}
	return runner, errs
}

func newHdiutil(t *testing.T) (Hdiutil, fs.FS) {
	t.Helper()
	fsys := fs.NewMemFS()
	if err := fsys.MkdirAll(mountPoint, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	return Hdiutil{FS: fsys, Volume: VolumeFile(fsys, volumeRel, "bin")}, fsys
}

func TestHdiutil(t *testing.T) {
	detach := []string{"detach", mountPoint}
	force := []string{"detach", mountPoint, "-force"}
	tests := []struct {
		name     string
		setup    func(h *Hdiutil)
		detaches [][]string
		wantErrs []error
		// wantVolume and wantMountPoint report what must exist after the commands.
		wantVolume, wantMountPoint bool
	}{
		{name: "a detach unmounts the volume", detaches: [][]string{detach}, wantErrs: []error{nil, nil}, wantMountPoint: true},
		{
			name:     "a detach that is refused unless forced",
			setup:    func(h *Hdiutil) { h.Detach = RefuseUnlessForced },
			detaches: [][]string{detach, force}, wantErrs: []error{nil, ErrResourceBusy, nil}, wantMountPoint: true,
		},
		{
			name:     "no Volume attaches an empty volume",
			setup:    func(h *Hdiutil) { h.Volume, h.StayMounted = nil, true },
			detaches: [][]string{detach}, wantErrs: []error{nil, nil}, wantMountPoint: true,
		},
		{
			name:     "a volume that stays mounted",
			setup:    func(h *Hdiutil) { h.StayMounted = true },
			detaches: [][]string{detach}, wantErrs: []error{nil, nil}, wantVolume: true, wantMountPoint: true,
		},
		{
			name:     "a system that removes the mount point on unmount",
			setup:    func(h *Hdiutil) { h.RemoveMountPoint = true },
			detaches: [][]string{detach}, wantErrs: []error{nil, nil},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, fsys := newHdiutil(t)
			if tt.setup != nil {
				tt.setup(&h)
			}
			runner, errs := run(t, h, tt.detaches...)
			if !slices.EqualFunc(errs, tt.wantErrs, func(a, b error) bool { return errors.Is(a, b) }) {
				t.Errorf("errors = %v, want %v", errs, tt.wantErrs)
			}
			if got := len(Calls(runner)); got != len(tt.detaches)+1 {
				t.Errorf("Calls recorded %d commands, want %d", got, len(tt.detaches)+1)
			}
			if exists, _ := fsys.Exists(volumePath); exists != tt.wantVolume {
				t.Errorf("volume file present = %v, want %v", exists, tt.wantVolume)
			}
			if exists, _ := fsys.Exists(mountPoint); exists != tt.wantMountPoint {
				t.Errorf("mount point present = %v, want %v", exists, tt.wantMountPoint)
			}
		})
	}
}

func TestHdiutilAttachOutput(t *testing.T) {
	h, _ := newHdiutil(t)
	h.AttachOutput = "hdiutil: attach failed - no mountable file systems"
	h.Volume = func(string) error { return errors.New("exit status 1") }
	runner := exec.NewMockRunner()
	h.Register(runner)
	out, err := runner.Command("hdiutil", "attach", "-mountpoint", mountPoint, "/stage/app.dmg").CombinedOutput()
	if err == nil || string(out) != h.AttachOutput {
		t.Errorf("attach = %q, %v; want %q and an error", out, err, h.AttachOutput)
	}
}

func TestHdiutilRejectsMalformedCommands(t *testing.T) {
	h, _ := newHdiutil(t)
	runner := exec.NewMockRunner()
	h.Register(runner)
	for _, args := range [][]string{{"attach"}, {"attach", "/stage/app.dmg"}, {"verify", "/stage/app.dmg"}} {
		if err := runner.Command("hdiutil", args...).Run(); err == nil {
			t.Errorf("hdiutil %v = nil, want an error", args)
		}
	}
	if err := runner.Command("hdiutil", "detach", "/missing").Run(); err == nil {
		t.Error("detaching a mount point that does not exist = nil, want an error")
	}
}
