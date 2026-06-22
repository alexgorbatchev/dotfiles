package fs

import (
	"io"
	"path/filepath"
	"sync"
	"testing"
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
