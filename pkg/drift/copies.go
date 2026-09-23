package drift

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// CopyMember is one entry a .copy() declaration places: a directory copy is settled
// entry by entry, so each file carries its own three versions and its own decision,
// and each directory is checked before anything is placed beneath it.
type CopyMember struct {
	Source string
	Target string
	// Dir marks a directory of the source. It has no content to settle; the copy
	// only needs a real directory at its target.
	Dir bool
}

// Contains reports whether other lies beneath this member's target.
func (m CopyMember) Contains(other CopyMember) bool {
	return strings.HasPrefix(other.Target, m.Target+string(filepath.Separator))
}

// CopyMembers lists the entries a copy of source to target places, parents before
// their contents and siblings in lexical order: source itself when it is a file, and
// the directory with every directory and file beneath it when it is a directory.
// Links in the source are followed, since a copy places the content a link names.
//
// Directories are listed so that each one is judged (see ForeignEntry) before the
// entries beneath it are looked at. Looking beneath a plain file fails on a real
// filesystem, and looking beneath a symlink reads and writes wherever it points.
//
// The orchestrator settles exactly these entries and the inspector reports exactly
// these, which is what keeps `state diff` describing what the next generate does.
func CopyMembers(fsys fs.FS, source, target string) ([]CopyMember, error) {
	// Cleaned so that "~/tree/" and "~/tree" are the same member: an uncleaned
	// trailing slash would defeat Contains, and a backup of "tree/" would be
	// reserved inside the directory it is meant to sit beside.
	return copyMembers(fsys, filepath.Clean(source), filepath.Clean(target))
}

func copyMembers(fsys fs.FS, source, target string) ([]CopyMember, error) {
	info, err := fsys.Stat(source)
	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", source, err)
	}
	if !info.IsDir() {
		return []CopyMember{{Source: source, Target: target}}, nil
	}

	names, err := fsys.ReadDir(source)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", source, err)
	}
	slices.Sort(names)

	members := []CopyMember{{Source: source, Target: target, Dir: true}}
	for _, name := range names {
		nested, err := copyMembers(fsys, filepath.Join(source, name), filepath.Join(target, name))
		if err != nil {
			return nil, err
		}
		members = append(members, nested...)
	}
	return members, nil
}

// ForeignEntry reports whether path holds something a copy cannot settle as its own:
// a symlink, whatever it points at, or an entry of the wrong kind (a directory where a
// file is copied, or anything but a directory where a directory is copied).
//
// Reading through a symlink would measure the file it points at, and writing through
// one would change that file, which is the dotfiles repository itself when the target
// used to be a .symlink() of the same source. Such an entry has no recorded base, so
// it is judged as StateUnmanaged.
func ForeignEntry(fsys fs.FS, path string, wantDir bool) (bool, error) {
	info, err := fsys.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("lstat %s: %w", path, err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return true, nil
	}
	return info.IsDir() != wantDir, nil
}
