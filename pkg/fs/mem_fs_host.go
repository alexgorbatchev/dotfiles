package fs

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// NewDryRunFS reads existing host files while keeping every mutation in memory.
// A host file is copied on first use; simulated removal hides the original even
// after the path is recreated. NewMemFS remains completely isolated.
func NewDryRunFS() *MemFS {
	m := NewMemFSWithHostFallback()
	m.hostReads = true
	return m
}

// readNodeLocked snapshots host content only for explicit dry-run overlays.
// Keeping the snapshot in files lets existing writes, append, rename and hard links
// operate on the same simulated entry without any write handle to the host.
func (m *MemFS) readNodeLocked(path string) (*fileNode, error) {
	path = filepath.Clean(path)
	if node, ok := m.files[path]; ok {
		return node, nil
	}
	if !m.hostReads || m.hostPathRemovedLocked(path) {
		return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
	}
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	node := &fileNode{perm: info.Mode(), modTime: info.ModTime(), isDir: info.IsDir(), isSymlink: info.Mode()&os.ModeSymlink != 0}
	switch {
	case node.isSymlink:
		node.linkTarget, err = os.Readlink(path)
	case info.Mode().IsRegular():
		node.data, err = os.ReadFile(path)
	case !node.isDir:
		return nil, &os.PathError{Op: "open", Path: path, Err: fmt.Errorf("unsupported file type %s", info.Mode().Type())}
	}
	if err != nil {
		return nil, err
	}
	m.files[path] = node
	return node, nil
}

// overlayPathLocked resolves directory symlinks against the simulated filesystem,
// so an alternate spelling cannot bypass an earlier write or removal. The leaf is
// left intact for operations on directory entries (unlink, rename and lstat).
func (m *MemFS) overlayPathLocked(path string, followLeaf bool, links int) (string, error) {
	if !m.hostReads {
		return filepath.Clean(path), nil
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return path, err
	}
	parent := filepath.Dir(path)
	if parent != path {
		resolved, err := m.overlayPathLocked(parent, true, links)
		if err != nil {
			return path, err
		}
		if !m.files[resolved].isDir {
			return path, &os.PathError{Op: "open", Path: parent, Err: os.ErrInvalid}
		}
		path = filepath.Join(resolved, filepath.Base(path))
	}
	if !followLeaf {
		return path, nil
	}
	node, err := m.readNodeLocked(path)
	if err != nil {
		return path, err
	}
	if !node.isSymlink {
		return path, nil
	}
	if links >= 40 {
		return path, &os.PathError{Op: "open", Path: path, Err: fmt.Errorf("symlink loop detected")}
	}
	target := node.linkTarget
	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(path), target)
	}
	return m.overlayPathLocked(target, true, links+1)
}

func (m *MemFS) prepareHostWriteLocked(path string) (string, error) {
	path, err := m.overlayPathLocked(path, false, 0)
	if err != nil || !m.hostReads {
		return path, err
	}
	_, err = m.readNodeLocked(path)
	if os.IsNotExist(err) {
		err = nil
	}
	return path, err
}

// Content writes follow the final symlink, including a dangling link whose target
// can be created. Entry operations use prepareHostWriteLocked instead.
func (m *MemFS) prepareHostContentWriteLocked(path string) (string, error) {
	path, err := m.overlayPathLocked(path, true, 0)
	if err != nil && !os.IsNotExist(err) {
		return path, err
	}
	if m.hostReads {
		if _, err := m.overlayPathLocked(filepath.Dir(path), true, 0); err != nil {
			return path, err
		}
	}
	return path, nil
}

func (m *MemFS) mkdirAllHostLocked(path string, perm os.FileMode) error {
	path, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	parent := filepath.Dir(path)
	if parent != path {
		if err := m.mkdirAllHostLocked(parent, perm); err != nil {
			return err
		}
	}
	path, err = m.overlayPathLocked(path, false, 0)
	if err != nil {
		return err
	}
	_, node, err := m.resolveNodeLocked(path)
	if err == nil {
		if !node.isDir {
			return &os.PathError{Op: "mkdir", Path: path, Err: os.ErrExist}
		}
		return nil
	}
	if !os.IsNotExist(err) {
		return err
	}
	if node, err := m.readNodeLocked(path); err == nil && node.isSymlink {
		return &os.PathError{Op: "mkdir", Path: path, Err: os.ErrExist}
	}
	m.files[path] = &fileNode{isDir: true, perm: perm, modTime: time.Now()}
	return nil
}

// A rename of a host directory must bring its existing children into the overlay
// before moving it; otherwise the simulated destination would be empty.
func (m *MemFS) readHostTreeLocked(path string) error {
	node, err := m.readNodeLocked(path)
	if err != nil {
		return err
	}
	if !node.isDir {
		return nil
	}
	names, err := m.readDirLocked(path)
	if err != nil {
		return err
	}
	for _, name := range names {
		if err := m.readHostTreeLocked(filepath.Join(path, name)); err != nil {
			return err
		}
	}
	return nil
}
