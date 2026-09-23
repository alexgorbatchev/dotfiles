package fs

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// runCommonFSTests executes a suite of standard operations against any FS implementation.
func runCommonFSTests(t *testing.T, filesystem FS, baseDir string) {
	t.Helper()

	file1 := filepath.Join(baseDir, "file1.txt")
	dir1 := filepath.Join(baseDir, "dir1")
	subFile := filepath.Join(dir1, "subfile.txt")

	// 1. Exists checks on empty
	exists, err := filesystem.Exists(file1)
	if err != nil {
		t.Fatalf("Exists failed: %v", err)
	}
	if exists {
		t.Errorf("Expected file1 to not exist initially")
	}

	// 2. MkdirAll
	err = filesystem.MkdirAll(dir1, 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	exists, err = filesystem.Exists(dir1)
	if err != nil || !exists {
		t.Errorf("Expected directory to exist after MkdirAll")
	}

	// 3. WriteFile
	err = filesystem.WriteFile(subFile, []byte("hello sub"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// 4. ReadFile
	data, err := filesystem.ReadFile(subFile)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if string(data) != "hello sub" {
		t.Errorf("ReadFile returned %q, want %q", string(data), "hello sub")
	}

	// Chmod test
	err = filesystem.Chmod(subFile, 0755)
	if err != nil {
		t.Fatalf("Chmod failed: %v", err)
	}

	// 5. Create & Open
	file2 := filepath.Join(dir1, "file2.txt")
	writer, err := filesystem.Create(file2)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	_, err = writer.Write([]byte("created and written"))
	if err != nil {
		t.Fatalf("Write to created file failed: %v", err)
	}
	err = writer.Close()
	if err != nil {
		t.Fatalf("Close of created file failed: %v", err)
	}

	reader, err := filesystem.Open(file2)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	readData, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("Read from opened file failed: %v", err)
	}
	_ = reader.Close()
	if string(readData) != "created and written" {
		t.Errorf("Opened file read %q, want %q", string(readData), "created and written")
	}

	// 6. Non-empty directory removal should fail
	err = filesystem.Remove(dir1)
	if err == nil {
		t.Errorf("Expected non-empty directory removal to fail")
	}

	// 7. Remove files then empty directory
	err = filesystem.Remove(subFile)
	if err != nil {
		t.Fatalf("Remove of subFile failed: %v", err)
	}
	err = filesystem.Remove(file2)
	if err != nil {
		t.Fatalf("Remove of file2 failed: %v", err)
	}
	err = filesystem.Remove(dir1)
	if err != nil {
		t.Fatalf("Remove of empty directory failed: %v", err)
	}

	exists, _ = filesystem.Exists(dir1)
	if exists {
		t.Errorf("Expected directory to be removed")
	}
}

func TestOSFS(t *testing.T) {
	tempDir := t.TempDir()
	filesystem := NewOSFS()
	runCommonFSTests(t, filesystem, tempDir)

	// Test Exists with null byte path to trigger os.Stat returning other errors
	_, err := filesystem.Exists("\x00")
	if err == nil {
		t.Errorf("Expected error when checking existence of path with null byte")
	}
}

func TestMemFS(t *testing.T) {
	filesystem := NewMemFS()
	// Create a simulated root base directory
	baseDir := "/workspace"
	err := filesystem.MkdirAll(baseDir, 0755)
	if err != nil {
		t.Fatalf("Failed to prepare base directory: %v", err)
	}
	runCommonFSTests(t, filesystem, baseDir)
}

func TestMemFS_ErrorsAndIsolation(t *testing.T) {
	fs := NewMemFS()

	// 1. Read non-existent file
	_, err := fs.ReadFile("/missing.txt")
	if err == nil {
		t.Errorf("Expected error reading missing file")
	}

	// 2. Open non-existent file
	_, err = fs.Open("/missing.txt")
	if err == nil {
		t.Errorf("Expected error opening missing file")
	}

	// 3. Remove non-existent file
	err = fs.Remove("/missing.txt")
	if err == nil {
		t.Errorf("Expected error removing missing file")
	}

	// 4. Create in non-existent directory
	_, err = fs.Create("/missing_dir/file.txt")
	if err == nil {
		t.Errorf("Expected error creating file in non-existent directory")
	}

	// 5. Write to non-existent directory
	err = fs.WriteFile("/missing_dir/file.txt", []byte("data"), 0644)
	if err == nil {
		t.Errorf("Expected error writing file in non-existent directory")
	}

	// 6. Create directory where file exists
	err = fs.WriteFile("/file.txt", []byte("data"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}
	err = fs.MkdirAll("/file.txt/subdir", 0755)
	if err == nil {
		t.Errorf("Expected error making subdir inside a file path")
	}

	// 7. Write to a path that is a directory
	err = fs.MkdirAll("/dir", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	err = fs.WriteFile("/dir", []byte("data"), 0644)
	if err == nil {
		t.Errorf("Expected error writing file to a path that is a directory")
	}

	// 8. Open a directory as a file
	_, err = fs.Open("/dir")
	if err == nil {
		t.Errorf("Expected error opening directory")
	}

	// 9. Read a directory as a file
	_, err = fs.ReadFile("/dir")
	if err == nil {
		t.Errorf("Expected error reading directory")
	}

	// 10. Close a directory-clashing write closer
	wc, err := fs.Create("/file_clash.txt")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	// Change file_clash.txt into a directory before closing
	delete(fs.files, "/file_clash.txt")
	err = fs.MkdirAll("/file_clash.txt", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	err = wc.Close()
	if err == nil {
		t.Errorf("Expected error closing writer when destination is a directory")
	}

	// 11. MkdirAll with root / current dir
	err = fs.MkdirAll(".", 0755)
	if err != nil {
		t.Errorf("Expected MkdirAll('.') to succeed, got: %v", err)
	}
	err = fs.MkdirAll("/", 0755)
	if err != nil {
		t.Errorf("Expected MkdirAll('/') to succeed, got: %v", err)
	}

	// 12. Create on path that is already a directory
	err = fs.MkdirAll("/some_dir", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	_, err = fs.Create("/some_dir")
	if err == nil {
		t.Errorf("Expected error when creating file over a directory")
	}
}

func TestMemFS_SymlinkResolutionAndBrokenLinks(t *testing.T) {
	fs := NewMemFS()
	_ = fs.MkdirAll("/workspace", 0755)
	_ = fs.WriteFile("/workspace/target.txt", []byte("target data"), 0644)

	// Valid symlink
	err := fs.Symlink("/workspace/target.txt", "/workspace/link.txt")
	if err != nil {
		t.Fatalf("Symlink failed: %v", err)
	}

	// Exists via symlink
	exists, err := fs.Exists("/workspace/link.txt")
	if err != nil || !exists {
		t.Errorf("Expected Exists on valid symlink to return true")
	}

	// ReadFile via symlink
	data, err := fs.ReadFile("/workspace/link.txt")
	if err != nil || string(data) != "target data" {
		t.Errorf("Expected ReadFile via symlink to return 'target data', got %q, err: %v", string(data), err)
	}

	// Broken symlink
	err = fs.Symlink("/workspace/missing.txt", "/workspace/broken.txt")
	if err != nil {
		t.Fatalf("Symlink failed: %v", err)
	}

	// Exists via broken symlink MUST return false
	exists, err = fs.Exists("/workspace/broken.txt")
	if err != nil {
		t.Fatalf("Exists on broken symlink returned error: %v", err)
	}
	if exists {
		t.Errorf("Expected Exists on broken symlink to return false")
	}

	// ReadFile via broken symlink MUST fail
	_, err = fs.ReadFile("/workspace/broken.txt")
	if err == nil {
		t.Errorf("Expected ReadFile on broken symlink to return error")
	}
}

func TestMemFS_Concurrency(t *testing.T) {
	fs := NewMemFS()
	err := fs.MkdirAll("/concurrency", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	var wg sync.WaitGroup
	workers := 10
	iterations := 50

	// Concurrent Writers
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				path := filepath.Join("/concurrency", string(rune('a'+workerID)))
				_ = fs.WriteFile(path, []byte("data"), 0644)
			}
		}(i)
	}

	// Concurrent Readers
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				path := filepath.Join("/concurrency", string(rune('a'+workerID)))
				_, _ = fs.ReadFile(path)
				_, _ = fs.Exists(path)
			}
		}(i)
	}

	wg.Wait()
}

func TestMemFS_ReadDirSorted(t *testing.T) {
	fs := NewMemFS()
	err := fs.MkdirAll("/dir", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	// Create files in unsorted order
	files := []string{"z_file.txt", "a_file.txt", "m_file.txt", "b_dir/sub.txt"}
	for _, f := range files {
		err := fs.WriteFile(filepath.Join("/dir", f), []byte("test"), 0644)
		if err != nil && f == "b_dir/sub.txt" {
			// Need to create parent dir first
			_ = fs.MkdirAll("/dir/b_dir", 0755)
			_ = fs.WriteFile(filepath.Join("/dir", f), []byte("test"), 0644)
		}
	}

	names, err := fs.ReadDir("/dir")
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}

	expected := []string{"a_file.txt", "b_dir", "m_file.txt", "z_file.txt"}
	if len(names) != len(expected) {
		t.Fatalf("expected %d entries, got %d: %v", len(expected), len(names), names)
	}

	for i, name := range names {
		if name != expected[i] {
			t.Errorf("at index %d: expected %q, got %q", i, expected[i], name)
		}
	}
}

func TestMemFS_ReadDirNonExistentDir(t *testing.T) {
	fs := NewMemFS()
	_, err := fs.ReadDir("/nonexistent")
	if err == nil {
		t.Fatalf("Expected ReadDir('/nonexistent') to return error, got nil")
	}
}

func TestMemFS_CopyFileSymlinkDereference(t *testing.T) {
	fs := NewMemFS()
	err := fs.WriteFile("/target.txt", []byte("target content"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	err = fs.Symlink("/target.txt", "/symlink.txt")
	if err != nil {
		t.Fatalf("Symlink failed: %v", err)
	}

	// Copy from symlink to destination
	err = fs.CopyFile("/symlink.txt", "/copied.txt")
	if err != nil {
		t.Fatalf("CopyFile failed on symlink: %v", err)
	}

	// Verify /copied.txt exists and is a regular file with target content
	content, err := fs.ReadFile("/copied.txt")
	if err != nil {
		t.Fatalf("ReadFile on copied.txt failed: %v", err)
	}
	if string(content) != "target content" {
		t.Errorf("Expected copied file content 'target content', got %q", string(content))
	}

	// Verify CopyFile on broken symlink returns error
	err = fs.Symlink("/nonexistent.txt", "/broken.txt")
	if err != nil {
		t.Fatalf("Symlink failed: %v", err)
	}
	err = fs.CopyFile("/broken.txt", "/broken_copied.txt")
	if err == nil {
		t.Fatalf("Expected CopyFile on broken symlink to return error, got nil")
	}
}

func TestMemFS_HostFallback(t *testing.T) {
	memFS := NewMemFSWithHostFallback()

	// Create a real temporary file on the host OS
	tempFile, err := os.CreateTemp("", "test-memfs-fallback-*.txt")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tempFile.Name())
	_, _ = tempFile.WriteString("host content")
	tempFile.Close()

	// 1. Stat on host file from MemFS
	info, err := memFS.Stat(tempFile.Name())
	if err != nil {
		t.Errorf("expected Stat fallback to host OS file to succeed: %v", err)
	} else if info.Name() != filepath.Base(tempFile.Name()) {
		t.Errorf("expected Stat name %q, got %q", filepath.Base(tempFile.Name()), info.Name())
	}

	// 2. Lstat on host file from MemFS
	linfo, err := memFS.Lstat(tempFile.Name())
	if err != nil {
		t.Errorf("expected Lstat fallback to host OS file to succeed: %v", err)
	} else if linfo.Name() != filepath.Base(tempFile.Name()) {
		t.Errorf("expected Lstat name %q, got %q", filepath.Base(tempFile.Name()), linfo.Name())
	}

	// 3. Exists on host file from MemFS
	exists, err := memFS.Exists(tempFile.Name())
	if err != nil || !exists {
		t.Errorf("expected Exists fallback to host OS file to return true, got exists=%v, err=%v", exists, err)
	}
}

func TestMemFS_ModTime(t *testing.T) {
	memFS := NewMemFS()

	before := time.Now().Add(-time.Second)

	err := memFS.WriteFile("/test.txt", []byte("hello"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	info, err := memFS.Stat("/test.txt")
	if err != nil {
		t.Fatalf("Stat failed: %v", err)
	}

	if info.ModTime().IsZero() {
		t.Fatalf("expected non-zero ModTime for /test.txt")
	}

	if info.ModTime().Before(before) {
		t.Errorf("expected ModTime to be after %v, got %v", before, info.ModTime())
	}

	linfo, err := memFS.Lstat("/test.txt")
	if err != nil {
		t.Fatalf("Lstat failed: %v", err)
	}

	if linfo.ModTime().IsZero() {
		t.Fatalf("expected non-zero ModTime in Lstat for /test.txt")
	}
}

// os.OpenFile creates a missing file only when O_CREATE is set. MemFS stands in
// for the real file system in tests and dry runs, so an append to a file it does
// not hold must fail the same way instead of quietly starting a new one.
func TestMemFS_OpenFile_MissingFileRequiresCreate(t *testing.T) {
	tests := []struct {
		name       string
		flag       int
		wantErr    error
		wantExists bool
	}{
		{"append without create", os.O_WRONLY | os.O_APPEND, os.ErrNotExist, false},
		{"write without create", os.O_WRONLY, os.ErrNotExist, false},
		{"append with create", os.O_WRONLY | os.O_APPEND | os.O_CREATE, nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := NewMemFS()
			w, err := memFS.OpenFile("/missing.txt", tt.flag, 0644)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("OpenFile error = %v, want %v", err, tt.wantErr)
			}
			if err == nil {
				if err := w.Close(); err != nil {
					t.Fatalf("Close failed: %v", err)
				}
			}
			exists, err := memFS.Exists("/missing.txt")
			if err != nil {
				t.Fatalf("Exists failed: %v", err)
			}
			if exists != tt.wantExists {
				t.Errorf("file exists = %v, want %v", exists, tt.wantExists)
			}
		})
	}
}

// Host fallback answers metadata from the host but never serves or writes host
// content, so appending to a file that only the host has must fail rather than
// create a MemFS file holding just the appended bytes.
func TestMemFS_HostFallback_OpenFileAppendToHostOnlyFile(t *testing.T) {
	hostPath := filepath.Join(t.TempDir(), "partial.bin")
	if err := os.WriteFile(hostPath, []byte("host bytes"), 0644); err != nil {
		t.Fatalf("writing host file: %v", err)
	}
	memFS := NewMemFSWithHostFallback()
	if err := memFS.MkdirAll(filepath.Dir(hostPath), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	_, err := memFS.OpenFile(hostPath, os.O_WRONLY|os.O_APPEND, 0644)
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("OpenFile error = %v, want %v", err, os.ErrNotExist)
	}
	if _, err := memFS.ReadFile(hostPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected no MemFS file at %s, ReadFile error = %v", hostPath, err)
	}
}

func TestMemFS_OpenFile_PreservesPermission(t *testing.T) {
	memFS := NewMemFS()

	// OpenFile with 0755
	w, err := memFS.OpenFile("/exec.sh", os.O_CREATE|os.O_WRONLY, 0755)
	if err != nil {
		t.Fatalf("OpenFile failed: %v", err)
	}
	_, _ = w.Write([]byte("#!/bin/sh\necho test\n"))
	err = w.Close()
	if err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	info, err := memFS.Stat("/exec.sh")
	if err != nil {
		t.Fatalf("Stat failed: %v", err)
	}
	if info.Mode().Perm() != 0755 {
		t.Errorf("expected permissions 0755, got %#o", info.Mode().Perm())
	}
}

// An in-memory filesystem is what tests and dry runs are given so that neither
// touches the real one. Reporting that a host path exists makes the result of a
// test depend on what happens to be installed on the machine running it, so the
// host is only visible to a MemFS that explicitly asked to see it.
func TestMemFS_IsIsolatedFromTheHostByDefault(t *testing.T) {
	hostFile := filepath.Join(t.TempDir(), "present-on-the-host.txt")
	if err := os.WriteFile(hostFile, []byte("host content"), 0644); err != nil {
		t.Fatalf("writing host file: %v", err)
	}

	memFS := NewMemFS()

	if exists, err := memFS.Exists(hostFile); err != nil || exists {
		t.Errorf("Exists(%s) = %v (err %v), want false: the host is visible", hostFile, exists, err)
	}
	if _, err := memFS.Stat(hostFile); err == nil {
		t.Error("Stat succeeded on a host path")
	}
	if _, err := memFS.Lstat(hostFile); err == nil {
		t.Error("Lstat succeeded on a host path")
	}

	// The opt-in filesystem does see it, which is what a dry run needs.
	hostVisible := NewMemFSWithHostFallback()
	if exists, err := hostVisible.Exists(hostFile); err != nil || !exists {
		t.Errorf("the host-visible filesystem reported Exists = %v (err %v), want true", exists, err)
	}

	// Even there, only the shape of a host path is visible, never its contents.
	if _, err := hostVisible.ReadFile(hostFile); err == nil {
		t.Error("ReadFile returned host contents; the fallback must expose metadata only")
	}
}

// copyFileImplementations pins OSFS and MemFS to one CopyFile behaviour: each entry
// returns a filesystem and an existing directory to work in.
var copyFileImplementations = []struct {
	name  string
	setup func(t *testing.T) (FS, string)
}{
	{"OSFS", func(t *testing.T) (FS, string) { return NewOSFS(), t.TempDir() }},
	{"MemFS", func(t *testing.T) (FS, string) {
		memFS := NewMemFS()
		if err := memFS.MkdirAll("/workspace", 0755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		return memFS, "/workspace"
	}},
}

const copySourceContent = "source-binary-content"

func writeCopySource(t *testing.T, filesystem FS, dir string) string {
	t.Helper()
	src := filepath.Join(dir, "tool-bin")
	if err := filesystem.WriteFile(src, []byte(copySourceContent), 0644); err != nil {
		t.Fatalf("WriteFile(%s): %v", src, err)
	}
	return src
}

func assertFileContent(t *testing.T, filesystem FS, path, want string) {
	t.Helper()
	data, err := filesystem.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s): %v", path, err)
	}
	if string(data) != want {
		t.Errorf("%s holds %q, want %q", path, data, want)
	}
}

// TestCopyFileReplacesDestinationSymlink covers a destination that is a symlink to the
// source: the copy replaces the link with a regular file and never writes through it.
func TestCopyFileReplacesDestinationSymlink(t *testing.T) {
	for _, impl := range copyFileImplementations {
		t.Run(impl.name, func(t *testing.T) {
			filesystem, dir := impl.setup(t)
			src := writeCopySource(t, filesystem, dir)
			dest := filepath.Join(dir, "staged-tool")
			if err := filesystem.Symlink(src, dest); err != nil {
				t.Fatalf("Symlink: %v", err)
			}

			if err := filesystem.CopyFile(src, dest); err != nil {
				t.Fatalf("CopyFile(%s, %s) = %v, want nil", src, dest, err)
			}

			assertFileContent(t, filesystem, src, copySourceContent)
			info, err := filesystem.Lstat(dest)
			if err != nil {
				t.Fatalf("Lstat(%s): %v", dest, err)
			}
			if !info.Mode().IsRegular() {
				t.Errorf("Lstat(%s) mode = %v, want a regular file", dest, info.Mode())
			}
			assertFileContent(t, filesystem, dest, copySourceContent)
		})
	}
}

// TestCopyFileReplacesExistingDestination covers an existing regular destination: its
// content and mode are replaced by the source's.
func TestCopyFileReplacesExistingDestination(t *testing.T) {
	for _, impl := range copyFileImplementations {
		t.Run(impl.name, func(t *testing.T) {
			filesystem, dir := impl.setup(t)
			src := writeCopySource(t, filesystem, dir)
			if err := filesystem.Chmod(src, 0750); err != nil {
				t.Fatalf("Chmod: %v", err)
			}
			dest := filepath.Join(dir, "existing")
			if err := filesystem.WriteFile(dest, []byte("a much longer previous destination content"), 0600); err != nil {
				t.Fatalf("WriteFile: %v", err)
			}

			if err := filesystem.CopyFile(src, dest); err != nil {
				t.Fatalf("CopyFile = %v, want nil", err)
			}

			assertFileContent(t, filesystem, dest, copySourceContent)
			info, err := filesystem.Stat(dest)
			if err != nil {
				t.Fatalf("Stat(%s): %v", dest, err)
			}
			if got := info.Mode().Perm(); got != 0750 {
				t.Errorf("%s mode = %v, want %v", dest, got, os.FileMode(0750))
			}
		})
	}
}

// TestCopyFileRefusesToCopyAFileOntoItself covers a source and destination that name
// the same file, directly or through the source being a symlink to the destination.
func TestCopyFileRefusesToCopyAFileOntoItself(t *testing.T) {
	cases := []struct {
		name string
		// arrange returns the source to copy onto dest, the file the source resolves to.
		arrange func(t *testing.T, filesystem FS, dir, dest string) string
	}{
		{"same path", func(t *testing.T, filesystem FS, dir, dest string) string { return dest }},
		{"source is a symlink to the destination", func(t *testing.T, filesystem FS, dir, dest string) string {
			link := filepath.Join(dir, "link-to-dest")
			if err := filesystem.Symlink(dest, link); err != nil {
				t.Fatalf("Symlink: %v", err)
			}
			return link
		}},
	}
	for _, impl := range copyFileImplementations {
		for _, tc := range cases {
			t.Run(impl.name+"/"+tc.name, func(t *testing.T) {
				filesystem, dir := impl.setup(t)
				dest := writeCopySource(t, filesystem, dir)
				src := tc.arrange(t, filesystem, dir, dest)

				err := filesystem.CopyFile(src, dest)
				if !errors.Is(err, errSameFile) {
					t.Errorf("CopyFile(%s, %s) = %v, want %v", src, dest, err, errSameFile)
				}
				assertFileContent(t, filesystem, dest, copySourceContent)
			})
		}
	}
}

// TestCopyFileRefusesToCopyASymlinkOntoItself covers a source and destination that are
// the same symlink: replacing dest would turn the source's own entry into a regular file.
func TestCopyFileRefusesToCopyASymlinkOntoItself(t *testing.T) {
	for _, impl := range copyFileImplementations {
		t.Run(impl.name, func(t *testing.T) {
			filesystem, dir := impl.setup(t)
			target := writeCopySource(t, filesystem, dir)
			link := filepath.Join(dir, "link")
			if err := filesystem.Symlink(target, link); err != nil {
				t.Fatalf("Symlink: %v", err)
			}

			err := filesystem.CopyFile(link, link)
			if !errors.Is(err, errSameFile) {
				t.Errorf("CopyFile(%s, %s) = %v, want %v", link, link, err, errSameFile)
			}
			info, err := filesystem.Lstat(link)
			if err != nil {
				t.Fatalf("Lstat(%s): %v", link, err)
			}
			if info.Mode()&os.ModeSymlink == 0 {
				t.Errorf("Lstat(%s) mode = %v, want the symlink kept", link, info.Mode())
			}
			assertFileContent(t, filesystem, target, copySourceContent)
		})
	}
}

// TestCopyFileLeavesTheDestinationUntouchedWhenTheCopyFails covers a source that cannot
// be read as a file: the existing destination keeps its content.
func TestCopyFileLeavesTheDestinationUntouchedWhenTheCopyFails(t *testing.T) {
	const previous = "previous destination"
	for _, impl := range copyFileImplementations {
		t.Run(impl.name, func(t *testing.T) {
			filesystem, dir := impl.setup(t)
			src := filepath.Join(dir, "a-directory")
			if err := filesystem.MkdirAll(src, 0755); err != nil {
				t.Fatalf("MkdirAll: %v", err)
			}
			dest := filepath.Join(dir, "dest")
			if err := filesystem.WriteFile(dest, []byte(previous), 0644); err != nil {
				t.Fatalf("WriteFile: %v", err)
			}

			if err := filesystem.CopyFile(src, dest); !errors.Is(err, os.ErrInvalid) {
				t.Fatalf("CopyFile(%s, %s) = %v, want %v", src, dest, err, os.ErrInvalid)
			}

			assertFileContent(t, filesystem, dest, previous)
			entries, err := filesystem.ReadDir(dir)
			if err != nil {
				t.Fatalf("ReadDir: %v", err)
			}
			if len(entries) != 2 {
				t.Errorf("%s holds %v, want only the source and the destination", dir, entries)
			}
		})
	}
}

// TestOSFSCopyFileErrors covers the operating system refusing a step of the copy: each
// failure is reported and no temporary file is left beside the destination.
func TestOSFSCopyFileErrors(t *testing.T) {
	// Each case names its source and destination relative to a directory holding the
	// regular file "tool-bin" and the directory "dir".
	cases := []struct {
		name, src, dest string
	}{
		{"source is missing", "missing", "dir/unused"},
		{"destination is a directory", "tool-bin", "dir"},
		{"destination parent is a file", "tool-bin", "tool-bin/child"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			filesystem, root := NewOSFS(), t.TempDir()
			writeCopySource(t, filesystem, root)
			dir := filepath.Join(root, "dir")
			if err := filesystem.MkdirAll(dir, 0755); err != nil {
				t.Fatalf("MkdirAll: %v", err)
			}
			src := filepath.Join(root, filepath.FromSlash(tc.src))
			dest := filepath.Join(root, filepath.FromSlash(tc.dest))

			if err := filesystem.CopyFile(src, dest); err == nil {
				t.Fatalf("CopyFile(%s, %s) = nil, want an error", src, dest)
			}

			for _, d := range []string{root, dir} {
				entries, err := filesystem.ReadDir(d)
				if err != nil {
					t.Fatalf("ReadDir(%s): %v", d, err)
				}
				for _, name := range entries {
					if name != "tool-bin" && name != "dir" {
						t.Errorf("%s holds unexpected %s", d, name)
					}
				}
			}
		})
	}
}

// failingCloseWriter closes the file it wraps and then reports errClose, the way a
// write that fails only once the file is closed (EIO, a quota, NFS) surfaces.
type failingCloseWriter struct{ *os.File }

var errClose = errors.New("close failed")

func (w failingCloseWriter) Close() error {
	_ = w.File.Close() // the error under test is errClose, not this one
	return errClose
}

// TestOSFSCopyFileReportsACloseFailure covers a destination whose close fails: the copy
// is reported as failed, no temporary file is left behind, and the destination is
// either still absent or keeps its previous content.
func TestOSFSCopyFileReportsACloseFailure(t *testing.T) {
	const previous = "previous destination"
	cases := []struct {
		name       string
		destExists bool
	}{
		{"new destination", false},
		{"existing destination", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			destExists := tc.destExists
			filesystem, dir := NewOSFS(), t.TempDir()
			src := writeCopySource(t, filesystem, dir)
			dest := filepath.Join(dir, "dest")
			want := []string{filepath.Base(src)}
			if destExists {
				if err := filesystem.WriteFile(dest, []byte(previous), 0644); err != nil {
					t.Fatalf("WriteFile: %v", err)
				}
				want = append(want, filepath.Base(dest))
			}

			err := copyFile(src, dest, func(f *os.File) io.WriteCloser { return failingCloseWriter{f} })
			if !errors.Is(err, errClose) {
				t.Fatalf("copyFile = %v, want %v", err, errClose)
			}

			entries, err := filesystem.ReadDir(dir)
			if err != nil {
				t.Fatalf("ReadDir: %v", err)
			}
			slices.Sort(entries)
			slices.Sort(want)
			if !slices.Equal(entries, want) {
				t.Errorf("%s holds %v, want %v", dir, entries, want)
			}
			assertFileContent(t, filesystem, src, copySourceContent)
			if destExists {
				assertFileContent(t, filesystem, dest, previous)
			}
		})
	}
}

// recordingWriteCloser collects what is written to it and fails its Close with closeErr.
type recordingWriteCloser struct {
	strings.Builder
	closed   bool
	closeErr error
}

func (w *recordingWriteCloser) Close() error {
	w.closed = true
	return w.closeErr
}

// failingReader fails every read with errRead.
type failingReader struct{}

var errRead = errors.New("read failed")

func (failingReader) Read([]byte) (int, error) { return 0, errRead }

// TestWriteAndClose covers the result WriteAndClose reports: a failed close is a failed
// write, a failed copy and a failed close are both reported, and the writer is closed
// either way. Every failed close is reported as ErrClose, which is how a caller tells a
// file whose contents are unknown from one whose copy merely stopped part way.
func TestWriteAndClose(t *testing.T) {
	cases := []struct {
		name      string
		r         io.Reader
		closeErr  error
		want      error
		wantClose bool
		content   string
	}{
		{"copy and close succeed", strings.NewReader("payload"), nil, nil, false, "payload"},
		{"close fails", strings.NewReader("payload"), errClose, errClose, true, "payload"},
		{"copy fails", failingReader{}, nil, errRead, false, ""},
		{"copy and close fail", failingReader{}, errClose, errRead, true, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := &recordingWriteCloser{closeErr: tc.closeErr}
			err := WriteAndClose(w, tc.r)
			if !errors.Is(err, tc.want) || (tc.want == nil && err != nil) {
				t.Errorf("WriteAndClose = %v, want %v", err, tc.want)
			}
			if got := errors.Is(err, ErrClose); got != tc.wantClose {
				t.Errorf("errors.Is(WriteAndClose = %v, ErrClose) = %v, want %v", err, got, tc.wantClose)
			}
			if !w.closed {
				t.Error("WriteAndClose left the writer open")
			}
			if got := w.String(); got != tc.content {
				t.Errorf("WriteAndClose wrote %q, want %q", got, tc.content)
			}
		})
	}
}

// TestCopyErrorNamesTheDestination covers the error a failed copy step reports: it
// names dest, drops the temporary file's name, and keeps an error about src whole.
func TestCopyErrorNamesTheDestination(t *testing.T) {
	const dest, tmpPath, src = "/bin/tool", "/bin/.dotfiles-copy-1", "/src/tool"
	srcErr := &os.PathError{Op: "read", Path: src, Err: errClose}
	cases := []struct {
		name string
		err  error
		want error
	}{
		{"temporary file error", &os.PathError{Op: "chmod", Path: tmpPath, Err: os.ErrPermission}, os.ErrPermission},
		{"rename error", &os.LinkError{Op: "rename", Old: tmpPath, New: dest, Err: os.ErrPermission}, os.ErrPermission},
		{"source error", srcErr, srcErr},
		{"plain error", errClose, errClose},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := copyError(dest, tmpPath, tc.err)
			want := (&os.PathError{Op: "copyfile", Path: dest, Err: tc.want}).Error()
			if err.Error() != want {
				t.Errorf("copyError = %q, want %q", err, want)
			}
			if !errors.Is(err, tc.want) {
				t.Errorf("copyError = %v, want it to wrap %v", err, tc.want)
			}
		})
	}

	t.Run("source and close error", func(t *testing.T) {
		closeErr := &os.PathError{Op: "close", Path: tmpPath, Err: os.ErrPermission}
		err := copyError(dest, tmpPath, &writeError{copyErr: srcErr, closeErr: closeErr})
		want := (&os.PathError{Op: "copyfile", Path: dest, Err: &writeError{copyErr: srcErr, closeErr: os.ErrPermission}}).Error()
		if err.Error() != want {
			t.Errorf("copyError = %q, want %q", err, want)
		}
		if !errors.Is(err, srcErr) || !errors.Is(err, os.ErrPermission) || !errors.Is(err, ErrClose) {
			t.Errorf("copyError = %v, want it to wrap the source error, the close cause and ErrClose", err)
		}
	})
}

// TestOSFSCopyFileToADestinationAtTheNameLengthLimit covers a destination whose name is
// as long as most file systems allow (NAME_MAX, 255 bytes): the temporary file beside
// it must not need a longer name.
func TestOSFSCopyFileToADestinationAtTheNameLengthLimit(t *testing.T) {
	filesystem, dir := NewOSFS(), t.TempDir()
	src := writeCopySource(t, filesystem, dir)
	dest := filepath.Join(dir, strings.Repeat("n", 255))

	if err := filesystem.CopyFile(src, dest); err != nil {
		t.Fatalf("CopyFile = %v, want nil", err)
	}
	assertFileContent(t, filesystem, dest, copySourceContent)
}

// TestOSFSCopyFileRefusesAHardLinkToTheSource covers a destination that is another
// name for the source's inode, which only a real filesystem can have.
func TestOSFSCopyFileRefusesAHardLinkToTheSource(t *testing.T) {
	filesystem, dir := NewOSFS(), t.TempDir()
	src := writeCopySource(t, filesystem, dir)
	dest := filepath.Join(dir, "hard-link")
	if err := os.Link(src, dest); err != nil {
		t.Fatalf("Link: %v", err)
	}

	err := filesystem.CopyFile(src, dest)
	if !errors.Is(err, errSameFile) {
		t.Errorf("CopyFile(%s, %s) = %v, want %v", src, dest, err, errSameFile)
	}
	assertFileContent(t, filesystem, src, copySourceContent)
}

// treeFile and treeLink describe the entries of a tree built by buildTree, relative
// to its root.
type treeFile struct {
	path    string
	content string
	perm    os.FileMode
}

type treeLink struct {
	path   string
	target string
}

// frameworkBundleFiles and frameworkBundleLinks lay out an app bundle that ships a
// versioned macOS framework: Versions/Current links to a directory, the framework's
// top-level binary links to a file through it, and one link points nowhere.
var (
	frameworkBundleFiles = []treeFile{
		{"Contents/Info.plist", "plist", 0o644},
		{"Contents/MacOS/app", "app-binary", 0o755},
		{"Contents/Frameworks/Sparkle.framework/Versions/A/Sparkle", "sparkle-binary", 0o755},
		{"Contents/Resources/read-only/notice.txt", "notice", 0o444},
		{"Contents/Resources/shared/notes.txt", "notes", 0o664},
	}
	frameworkBundleLinks = []treeLink{
		{"Contents/Frameworks/Sparkle.framework/Versions/Current", "A"},
		{"Contents/Frameworks/Sparkle.framework/Sparkle", "Versions/Current/Sparkle"},
		{"Contents/Frameworks/Sparkle.framework/Dangling", "Versions/B/Missing"},
	}
)

// readOnlyBundleDir is a directory of the bundle whose permission bits deny writing.
const (
	readOnlyBundleDir     = "Contents/Resources/read-only"
	readOnlyBundleDirPerm = os.FileMode(0o555)
	// sharedBundleDir is group-writable, which a umask would take away from a new
	// directory.
	sharedBundleDir     = "Contents/Resources/shared"
	sharedBundleDirPerm = os.FileMode(0o775)
)

func buildTree(t *testing.T, filesystem FS, root string, files []treeFile, links []treeLink) {
	t.Helper()
	for _, f := range files {
		path := filepath.Join(root, f.path)
		if err := filesystem.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll(%s): %v", filepath.Dir(path), err)
		}
		if err := filesystem.WriteFile(path, []byte(f.content), f.perm); err != nil {
			t.Fatalf("WriteFile(%s): %v", path, err)
		}
		if err := filesystem.Chmod(path, f.perm); err != nil {
			t.Fatalf("Chmod(%s): %v", path, err)
		}
	}
	for _, l := range links {
		path := filepath.Join(root, l.path)
		if err := filesystem.Symlink(l.target, path); err != nil {
			t.Fatalf("Symlink(%s, %s): %v", l.target, path, err)
		}
	}
}

// buildFrameworkBundle builds the framework bundle at root, with readOnlyBundleDir
// made read-only, and makes it writable again before t.TempDir removes it.
func buildFrameworkBundle(t *testing.T, filesystem FS, root string) {
	t.Helper()
	buildTree(t, filesystem, root, frameworkBundleFiles, frameworkBundleLinks)
	restrictDir(t, filesystem, filepath.Join(root, readOnlyBundleDir), readOnlyBundleDirPerm)
	if err := filesystem.Chmod(filepath.Join(root, sharedBundleDir), sharedBundleDirPerm); err != nil {
		t.Fatalf("Chmod: %v", err)
	}
}

// restrictDir applies perm to dir and restores write access at cleanup, which the
// removal of a t.TempDir holding a read-only directory needs.
func restrictDir(t *testing.T, filesystem FS, dir string, perm os.FileMode) {
	t.Helper()
	if err := filesystem.Chmod(dir, perm); err != nil {
		t.Fatalf("Chmod(%s): %v", dir, err)
	}
	t.Cleanup(func() { _ = filesystem.Chmod(dir, 0o755) })
}

func assertTreeCopy(t *testing.T, filesystem FS, root string, files []treeFile, links []treeLink) {
	t.Helper()
	for _, f := range files {
		path := filepath.Join(root, f.path)
		assertFileContent(t, filesystem, path, f.content)
		info, err := filesystem.Lstat(path)
		if err != nil {
			t.Fatalf("Lstat(%s): %v", path, err)
		}
		if !info.Mode().IsRegular() || info.Mode().Perm() != f.perm {
			t.Errorf("%s mode = %v, want a regular file with %v", path, info.Mode(), f.perm)
		}
	}
	for _, l := range links {
		path := filepath.Join(root, l.path)
		info, err := filesystem.Lstat(path)
		if err != nil {
			t.Fatalf("Lstat(%s): %v", path, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			t.Errorf("%s mode = %v, want a symlink", path, info.Mode())
			continue
		}
		target, err := filesystem.Readlink(path)
		if err != nil {
			t.Fatalf("Readlink(%s): %v", path, err)
		}
		if target != l.target {
			t.Errorf("%s links to %q, want %q", path, target, l.target)
		}
	}
}

// TestCopyTreeReproducesAFrameworkBundle covers the tree #144 describes: every symlink,
// to a directory, to a file or dangling, is recreated with its target string, regular
// files keep their content and permission bits, and a read-only directory is copied
// with its contents and then made read-only.
func TestCopyTreeReproducesAFrameworkBundle(t *testing.T) {
	for _, impl := range copyFileImplementations {
		t.Run(impl.name, func(t *testing.T) {
			filesystem, dir := impl.setup(t)
			src := filepath.Join(dir, "vol", "App.app")
			dest := filepath.Join(dir, "Applications", "App.app")
			buildFrameworkBundle(t, filesystem, src)
			t.Cleanup(func() { _ = filesystem.Chmod(filepath.Join(dest, readOnlyBundleDir), 0o755) })

			if err := CopyTree(filesystem, src, dest); err != nil {
				t.Fatalf("CopyTree(%s, %s) = %v, want nil", src, dest, err)
			}

			assertTreeCopy(t, filesystem, dest, frameworkBundleFiles, frameworkBundleLinks)
			for dir, want := range map[string]os.FileMode{readOnlyBundleDir: readOnlyBundleDirPerm, sharedBundleDir: sharedBundleDirPerm} {
				path := filepath.Join(dest, dir)
				info, err := filesystem.Stat(path)
				if err != nil {
					t.Fatalf("Stat(%s): %v", path, err)
				}
				if got := info.Mode().Perm(); got != want {
					t.Errorf("%s mode = %v, want %v", path, got, want)
				}
			}
		})
	}
}

// TestCopyTreeMergesIntoAnExistingDirectory pins the documented contract: an existing
// destination directory is merged into, and an existing entry at a symlink's
// destination is an error rather than something silently written through.
func TestCopyTreeMergesIntoAnExistingDirectory(t *testing.T) {
	for _, impl := range copyFileImplementations {
		t.Run(impl.name, func(t *testing.T) {
			filesystem, dir := impl.setup(t)
			src := filepath.Join(dir, "src")
			dest := filepath.Join(dir, "dest")
			buildTree(t, filesystem, src, []treeFile{{"new.txt", "new", 0o644}}, nil)
			buildTree(t, filesystem, dest, []treeFile{{"kept.txt", "kept", 0o644}}, nil)

			if err := CopyTree(filesystem, src, dest); err != nil {
				t.Fatalf("CopyTree = %v, want nil", err)
			}
			assertFileContent(t, filesystem, filepath.Join(dest, "new.txt"), "new")
			assertFileContent(t, filesystem, filepath.Join(dest, "kept.txt"), "kept")

			if err := filesystem.Symlink("new.txt", filepath.Join(src, "link")); err != nil {
				t.Fatalf("Symlink: %v", err)
			}
			if err := filesystem.Symlink("kept.txt", filepath.Join(dest, "link")); err != nil {
				t.Fatalf("Symlink: %v", err)
			}
			if err := CopyTree(filesystem, src, dest); !errors.Is(err, os.ErrExist) {
				t.Errorf("CopyTree over an existing link = %v, want %v", err, os.ErrExist)
			}

			// A source directory landing on a link to a directory must not be written
			// through the link into whatever it names.
			outside := filepath.Join(dir, "outside")
			buildTree(t, filesystem, outside, []treeFile{{"marker", "outside", 0o644}}, nil)
			buildTree(t, filesystem, filepath.Join(src, "sub"), []treeFile{{"planted", "planted", 0o644}}, nil)
			if err := filesystem.Remove(filepath.Join(src, "link")); err != nil {
				t.Fatalf("Remove: %v", err)
			}
			if err := filesystem.Symlink(outside, filepath.Join(dest, "sub")); err != nil {
				t.Fatalf("Symlink: %v", err)
			}
			if err := CopyTree(filesystem, src, dest); !errors.Is(err, os.ErrExist) {
				t.Errorf("CopyTree of a directory over a link = %v, want %v", err, os.ErrExist)
			}
			if exists, _ := filesystem.Exists(filepath.Join(outside, "planted")); exists {
				t.Errorf("CopyTree wrote through %s into %s", filepath.Join(dest, "sub"), outside)
			}
		})
	}
}

// unsupportedTypeFS reports one path as a named pipe, which a portable test cannot
// create on every platform.
type unsupportedTypeFS struct {
	FS
	pipe string
}

type pipeInfo struct{ os.FileInfo }

func (pipeInfo) Mode() os.FileMode { return os.ModeNamedPipe | 0o644 }

func (u unsupportedTypeFS) Lstat(path string) (os.FileInfo, error) {
	info, err := u.FS.Lstat(path)
	if err != nil || path != u.pipe {
		return info, err
	}
	return pipeInfo{info}, nil
}

func TestCopyTreeRefusesAnUnsupportedFileType(t *testing.T) {
	memFS := NewMemFS()
	pipe := "/src/pipe"
	buildTree(t, memFS, "/src", []treeFile{{"pipe", "", 0o644}}, nil)

	err := CopyTree(unsupportedTypeFS{FS: memFS, pipe: pipe}, "/src", "/dest")
	if !errors.Is(err, errUnsupportedFileType) {
		t.Fatalf("CopyTree = %v, want %v", err, errUnsupportedFileType)
	}
	if !strings.Contains(err.Error(), pipe) {
		t.Errorf("CopyTree error %q does not name %s", err, pipe)
	}
	if exists, _ := memFS.Exists("/dest/pipe"); exists {
		t.Error("CopyTree created /dest/pipe for an entry it refused")
	}
}

// copyTreeFaultFS fails one operation on one path.
type copyTreeFaultFS struct {
	FS
	op   string
	path string
}

var errCopyTreeFault = errors.New("injected fault")

func (f copyTreeFaultFS) fault(op, path string) error {
	if op == f.op && path == f.path {
		return errCopyTreeFault
	}
	return nil
}

func (f copyTreeFaultFS) Readlink(path string) (string, error) {
	if err := f.fault("readlink", path); err != nil {
		return "", err
	}
	return f.FS.Readlink(path)
}

func (f copyTreeFaultFS) Lstat(path string) (os.FileInfo, error) {
	if err := f.fault("lstat", path); err != nil {
		return nil, err
	}
	return f.FS.Lstat(path)
}

func (f copyTreeFaultFS) MkdirAll(path string, perm os.FileMode) error {
	if err := f.fault("mkdir", path); err != nil {
		return err
	}
	return f.FS.MkdirAll(path, perm)
}

func (f copyTreeFaultFS) ReadDir(path string) ([]string, error) {
	if err := f.fault("readdir", path); err != nil {
		return nil, err
	}
	return f.FS.ReadDir(path)
}

func (f copyTreeFaultFS) Chmod(path string, perm os.FileMode) error {
	if err := f.fault("chmod", path); err != nil {
		return err
	}
	return f.FS.Chmod(path, perm)
}

func (f copyTreeFaultFS) CopyFile(src, dest string) error {
	if err := f.fault("copy", src); err != nil {
		return err
	}
	return f.FS.CopyFile(src, dest)
}

// TestCopyTreeReportsEachFailure covers every step of the copy failing: the error is
// returned rather than the entry being skipped.
func TestCopyTreeReportsEachFailure(t *testing.T) {
	const src = "/vol/App.app"
	tests := []struct {
		name string
		op   string
		path string
	}{
		{"missing source", "", ""},
		{"readlink", "readlink", src + "/Contents/Frameworks/Sparkle.framework/Versions/Current"},
		{"mkdir", "mkdir", "/Applications/App.app/Contents"},
		{"lstat destination", "lstat", "/Applications/App.app/Contents"},
		{"readdir", "readdir", src + "/Contents/MacOS"},
		{"copy", "copy", src + "/Contents/MacOS/app"},
		{"chmod", "chmod", "/Applications/App.app/" + readOnlyBundleDir},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := NewMemFS()
			from := src
			if tt.op == "" {
				from = "/vol/Missing.app"
			} else {
				buildFrameworkBundle(t, memFS, src)
			}
			faulty := copyTreeFaultFS{FS: memFS, op: tt.op, path: tt.path}

			err := CopyTree(faulty, from, "/Applications/App.app")
			if tt.op == "" {
				if !errors.Is(err, os.ErrNotExist) {
					t.Errorf("CopyTree = %v, want %v", err, os.ErrNotExist)
				}
				return
			}
			if !errors.Is(err, errCopyTreeFault) {
				t.Errorf("CopyTree = %v, want %v", err, errCopyTreeFault)
			}
		})
	}
}
