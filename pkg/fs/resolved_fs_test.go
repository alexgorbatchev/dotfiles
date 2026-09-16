package fs

import (
	"bytes"
	"path/filepath"
	"testing"
)

func TestResolvedFS_PathExpansion(t *testing.T) {
	homeDir := "/home/testuser"
	mem := NewMemFS()
	// MkdirAll must be called first for parent directories in MemFS
	err := mem.MkdirAll(homeDir, 0755)
	if err != nil {
		t.Fatalf("Failed to setup test environment: %v", err)
	}

	rfs := NewResolvedFS(mem, homeDir)

	tests := []struct {
		name         string
		inputPath    string
		expectedPath string
		writeData    []byte
	}{
		{
			name:         "Tilde at root of home",
			inputPath:    "~/test_file.txt",
			expectedPath: "/home/testuser/test_file.txt",
			writeData:    []byte("hello tilde"),
		},
		{
			name:         "Secure directory traversal with double dots",
			inputPath:    "~/../other/test.txt",
			expectedPath: "/home/other/test.txt",
			writeData:    []byte("hello traversal"),
		},
		{
			name:         "Non-home path unchanged",
			inputPath:    "/workspace/foo.txt",
			expectedPath: "/workspace/foo.txt",
			writeData:    []byte("hello non-home"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Ensure parent exists in memfs
			parentDir := filepath.Dir(tt.expectedPath)
			err = mem.MkdirAll(parentDir, 0755)
			if err != nil {
				t.Fatalf("Failed to create parent directory %s: %v", parentDir, err)
			}

			// Write using ResolvedFS
			err := rfs.WriteFile(tt.inputPath, tt.writeData, 0644)
			if err != nil {
				t.Fatalf("WriteFile failed: %v", err)
			}

			// Verify physically written to expected path in MemFS
			data, err := mem.ReadFile(tt.expectedPath)
			if err != nil {
				t.Fatalf("ReadFile from expected underlying path %s failed: %v", tt.expectedPath, err)
			}

			if !bytes.Equal(data, tt.writeData) {
				t.Errorf("Expected content %q, got %q", string(tt.writeData), string(data))
			}

			// Verify Exists on ResolvedFS
			exists, err := rfs.Exists(tt.inputPath)
			if err != nil {
				t.Fatalf("Exists failed: %v", err)
			}
			if !exists {
				t.Errorf("Expected path %s to exist via ResolvedFS", tt.inputPath)
			}
		})
	}
}

func TestResolvedFS_IsAbs(t *testing.T) {
	homeDir := "/home/testuser"
	mem := NewMemFS()
	rfs := NewResolvedFS(mem, homeDir)
	osfs := NewOSFS()

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"empty", "", false},
		{"relative simple", "foo/bar", false},
		{"relative dot slash", "./foo/bar", false},
		{"relative parent", "../foo/bar", false},
		{"absolute posix", "/usr/local/bin", true},
		{"tilde root", "~", true},
		{"tilde subpath", "~/.local/bin/claude", true},
		{"tilde windows slash", "~\\.local\\bin", true},
		{"dollar home", "$HOME", true},
		{"dollar home subpath", "$HOME/.local/bin", true},
		{"braced dollar home", "${HOME}", true},
		{"braced dollar home subpath", "${HOME}/.local/bin", true},
	}

	for _, tt := range tests {
		t.Run("ResolvedFS_"+tt.name, func(t *testing.T) {
			if got := rfs.IsAbs(tt.path); got != tt.want {
				t.Errorf("rfs.IsAbs(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}

	// For standard OSFS/MemFS, tilde is not an absolute path unless expanded
	if osfs.IsAbs("~/.local/bin") {
		t.Errorf("osfs.IsAbs should be false for unexpanded tilde")
	}
	if !osfs.IsAbs("/usr/local/bin") {
		t.Errorf("osfs.IsAbs should be true for absolute path")
	}
	if mem.IsAbs("foo/bar") {
		t.Errorf("mem.IsAbs should be false for relative path")
	}
	if !mem.IsAbs("/usr/local/bin") {
		t.Errorf("mem.IsAbs should be true for absolute path")
	}
}
