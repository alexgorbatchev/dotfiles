package fs

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type fileNode struct {
	data       []byte
	perm       os.FileMode
	isDir      bool
	isSymlink  bool
	linkTarget string
}

// MemFS implements the FS interface fully in memory, utilizing sync.RWMutex
// for concurrent, safe execution. Perfect for dry-run modes and sandboxed tests.
type MemFS struct {
	mu    sync.RWMutex
	files map[string]*fileNode
}

// NewMemFS creates and returns an empty in-memory filesystem.
func NewMemFS() *MemFS {
	return &MemFS{
		files: make(map[string]*fileNode),
	}
}

func (m *MemFS) ReadFile(path string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
	}
	if node.isDir {
		return nil, &os.PathError{Op: "read", Path: path, Err: os.ErrInvalid}
	}

	// Return a copy to prevent external mutation of internal data
	buf := make([]byte, len(node.data))
	copy(buf, node.data)
	return buf, nil
}

func (m *MemFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanPath := filepath.Clean(path)

	// Check if parent directory exists (mirroring actual OS behavior)
	parent := filepath.Dir(cleanPath)
	if filepath.Dir(parent) != parent {
		parentNode, ok := m.files[parent]
		if !ok || !parentNode.isDir {
			return &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
		}
	}

	node, ok := m.files[cleanPath]
	if ok && node.isDir {
		return &os.PathError{Op: "open", Path: path, Err: os.ErrExist}
	}

	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)

	m.files[cleanPath] = &fileNode{
		data:  dataCopy,
		perm:  perm,
		isDir: false,
	}
	return nil
}

func (m *MemFS) Remove(path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return &os.PathError{Op: "remove", Path: path, Err: os.ErrNotExist}
	}

	if node.isDir {
		// Ensure directory is empty
		separator := string(filepath.Separator)
		prefix := cleanPath
		if !strings.HasSuffix(prefix, separator) {
			prefix += separator
		}
		for k := range m.files {
			if k != cleanPath && strings.HasPrefix(k, prefix) {
				return &os.PathError{Op: "remove", Path: path, Err: os.ErrInvalid} // directory not empty
			}
		}
	}

	delete(m.files, cleanPath)
	return nil
}

func (m *MemFS) Exists(path string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	_, ok := m.files[cleanPath]
	return ok, nil
}

func (m *MemFS) MkdirAll(path string, perm os.FileMode) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.mkdirAllLocked(filepath.Clean(path), perm)
}

func (m *MemFS) mkdirAllLocked(path string, perm os.FileMode) error {
	if path == "." || path == "/" || path == string(filepath.Separator) || path == "" {
		return nil
	}
	vol := filepath.VolumeName(path)
	if path == vol || path == vol+string(filepath.Separator) {
		return nil
	}

	node, ok := m.files[path]
	if ok {
		if !node.isDir {
			return &os.PathError{Op: "mkdir", Path: path, Err: os.ErrExist}
		}
		return nil
	}

	parent := filepath.Dir(path)
	if parent != path {
		if err := m.mkdirAllLocked(parent, perm); err != nil {
			return err
		}
	}

	m.files[path] = &fileNode{
		isDir: true,
		perm:  perm,
	}
	return nil
}

type memFileWriter struct {
	fs   *MemFS
	path string
	buf  bytes.Buffer
}

func (w *memFileWriter) Write(p []byte) (n int, err error) {
	return w.buf.Write(p)
}

func (w *memFileWriter) Close() error {
	w.fs.mu.Lock()
	defer w.fs.mu.Unlock()

	node, ok := w.fs.files[w.path]
	if ok && node.isDir {
		return &os.PathError{Op: "write", Path: w.path, Err: os.ErrExist}
	}

	w.fs.files[w.path] = &fileNode{
		data:  w.buf.Bytes(),
		perm:  0644,
		isDir: false,
	}
	return nil
}

func (m *MemFS) Create(path string) (io.WriteCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanPath := filepath.Clean(path)

	// Check if parent directory exists (mirroring actual OS behavior)
	parent := filepath.Dir(cleanPath)
	if filepath.Dir(parent) != parent {
		parentNode, ok := m.files[parent]
		if !ok || !parentNode.isDir {
			return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
		}
	}

	node, ok := m.files[cleanPath]
	if ok && node.isDir {
		return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrExist}
	}

	// Return writer that saves on Close
	return &memFileWriter{
		fs:   m,
		path: cleanPath,
	}, nil
}

type memFileReader struct {
	*bytes.Reader
}

func (r *memFileReader) Close() error {
	return nil
}

func (m *MemFS) Open(path string) (io.ReadCloser, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
	}
	if node.isDir {
		return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrInvalid}
	}

	return &memFileReader{bytes.NewReader(node.data)}, nil
}

func (m *MemFS) ReadDir(path string) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if ok && !node.isDir {
		return nil, &os.PathError{Op: "readdir", Path: path, Err: os.ErrInvalid}
	}

	separator := string(filepath.Separator)
	prefix := cleanPath
	if !strings.HasSuffix(prefix, separator) && prefix != "/" && prefix != "." && prefix != "" {
		prefix += separator
	}

	var names []string
	seen := make(map[string]bool)
	for k := range m.files {
		if k == cleanPath {
			continue
		}
		if strings.HasPrefix(k, prefix) {
			rel, err := filepath.Rel(cleanPath, k)
			if err == nil {
				parts := strings.Split(rel, separator)
				if len(parts) > 0 && parts[0] != "" {
					if !seen[parts[0]] {
						seen[parts[0]] = true
						names = append(names, parts[0])
					}
				}
			}
		}
	}
	return names, nil
}

func (m *MemFS) Chmod(path string, perm os.FileMode) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return &os.PathError{Op: "chmod", Path: path, Err: os.ErrNotExist}
	}
	node.perm = perm
	return nil
}

func (m *MemFS) Rename(oldname, newname string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanOld := filepath.Clean(oldname)
	cleanNew := filepath.Clean(newname)

	oldNode, ok := m.files[cleanOld]
	if !ok {
		return &os.PathError{Op: "rename", Path: oldname, Err: os.ErrNotExist}
	}

	if oldNode.isDir {
		separator := string(filepath.Separator)
		prefix := cleanOld
		if !strings.HasSuffix(prefix, separator) && prefix != "/" && prefix != "." && prefix != "" {
			prefix += separator
		}

		// Gather all keys that need renaming
		toRename := make(map[string]string)
		for k := range m.files {
			if k == cleanOld {
				toRename[k] = cleanNew
			} else if strings.HasPrefix(k, prefix) {
				rel := k[len(cleanOld):]
				toRename[k] = cleanNew + rel
			}
		}

		for o, n := range toRename {
			node := m.files[o]
			delete(m.files, o)
			m.files[n] = node
		}
	} else {
		delete(m.files, cleanOld)
		m.files[cleanNew] = oldNode
	}

	return nil
}

type memFileInfo struct {
	name    string
	size    int64
	mode    os.FileMode
	modTime time.Time
	isDir   bool
}

func (fi *memFileInfo) Name() string       { return fi.name }
func (fi *memFileInfo) Size() int64        { return fi.size }
func (fi *memFileInfo) Mode() os.FileMode  { return fi.mode }
func (fi *memFileInfo) ModTime() time.Time { return fi.modTime }
func (fi *memFileInfo) IsDir() bool        { return fi.isDir }
func (fi *memFileInfo) Sys() any           { return nil }

func (m *MemFS) Symlink(oldname, newname string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanNew := filepath.Clean(newname)

	parent := filepath.Dir(cleanNew)
	if filepath.Dir(parent) != parent {
		parentNode, ok := m.files[parent]
		if !ok || !parentNode.isDir {
			return &os.PathError{Op: "symlink", Path: newname, Err: os.ErrNotExist}
		}
	}

	_, ok := m.files[cleanNew]
	if ok {
		return &os.PathError{Op: "symlink", Path: newname, Err: os.ErrExist}
	}

	m.files[cleanNew] = &fileNode{
		perm:       0777 | os.ModeSymlink,
		isDir:      false,
		isSymlink:  true,
		linkTarget: oldname,
	}
	return nil
}

func (m *MemFS) Readlink(path string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return "", &os.PathError{Op: "readlink", Path: path, Err: os.ErrNotExist}
	}
	if !node.isSymlink {
		return "", &os.PathError{Op: "readlink", Path: path, Err: os.ErrInvalid}
	}
	return node.linkTarget, nil
}

func (m *MemFS) Lstat(path string) (os.FileInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return nil, &os.PathError{Op: "lstat", Path: path, Err: os.ErrNotExist}
	}

	mode := node.perm
	if node.isDir {
		mode |= os.ModeDir
	}
	if node.isSymlink {
		mode |= os.ModeSymlink
	}

	return &memFileInfo{
		name:  filepath.Base(cleanPath),
		size:  int64(len(node.data)),
		mode:  mode,
		isDir: node.isDir,
	}, nil
}

func (m *MemFS) Stat(path string) (os.FileInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cleanPath := filepath.Clean(path)
	node, ok := m.files[cleanPath]
	if !ok {
		return nil, &os.PathError{Op: "stat", Path: path, Err: os.ErrNotExist}
	}

	visited := make(map[string]bool)
	currPath := cleanPath
	currNode := node
	for currNode.isSymlink {
		if visited[currPath] {
			return nil, &os.PathError{Op: "stat", Path: path, Err: fmt.Errorf("symlink loop detected")}
		}
		visited[currPath] = true

		target := currNode.linkTarget
		if !filepath.IsAbs(target) {
			target = filepath.Join(filepath.Dir(currPath), target)
		}
		currPath = filepath.Clean(target)

		nextNode, ok := m.files[currPath]
		if !ok {
			return nil, &os.PathError{Op: "stat", Path: path, Err: os.ErrNotExist}
		}
		currNode = nextNode
	}

	mode := currNode.perm
	if currNode.isDir {
		mode |= os.ModeDir
	}

	return &memFileInfo{
		name:  filepath.Base(currPath),
		size:  int64(len(currNode.data)),
		mode:  mode,
		isDir: currNode.isDir,
	}, nil
}

func (m *MemFS) RemoveAll(path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cleanPath := filepath.Clean(path)
	_, ok := m.files[cleanPath]
	if !ok {
		return nil
	}

	separator := string(filepath.Separator)
	prefix := cleanPath
	if !strings.HasSuffix(prefix, separator) {
		prefix += separator
	}

	for k := range m.files {
		if k == cleanPath || strings.HasPrefix(k, prefix) {
			delete(m.files, k)
		}
	}

	return nil
}

func (m *MemFS) Abs(path string) (string, error) {
	return filepath.Abs(path)
}
