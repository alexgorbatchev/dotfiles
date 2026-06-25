package fs

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type fileNode struct {
	data  []byte
	perm  os.FileMode
	isDir bool
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
