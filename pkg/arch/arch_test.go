package arch

import (
	"os"
	"runtime"
	"testing"
)

func TestGetOS(t *testing.T) {
	oldGOOS := goos
	t.Cleanup(func() { goos = oldGOOS })

	tests := []struct {
		override string
		want     string
	}{
		{"darwin", OSDarwin},
		{"linux", OSLinux},
		{"windows", OSUnknown},
		{"freebsd", OSUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.override, func(t *testing.T) {
			goos = tt.override
			if got := GetOS(); got != tt.want {
				t.Errorf("GetOS() with override %q = %q, want %q", tt.override, got, tt.want)
			}
		})
	}
}

func TestGetArch(t *testing.T) {
	oldGOARCH := goarch
	t.Cleanup(func() { goarch = oldGOARCH })

	tests := []struct {
		override string
		want     string
	}{
		{"amd64", ArchAMD64},
		{"arm64", ArchARM64},
		{"386", ArchUnknown},
		{"mips", ArchUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.override, func(t *testing.T) {
			goarch = tt.override
			if got := GetArch(); got != tt.want {
				t.Errorf("GetArch() with override %q = %q, want %q", tt.override, got, tt.want)
			}
		})
	}
}

func TestDetectLibc_NonLinux(t *testing.T) {
	oldGOOS := goos
	t.Cleanup(func() { goos = oldGOOS })

	goos = "darwin"
	got := DetectLibc(func(string) bool { return true })
	if got != LibcUnknown {
		t.Errorf("DetectLibc() on non-Linux returned %q, want %q", got, LibcUnknown)
	}
}

func TestFileExists(t *testing.T) {
	// Path we know does not exist
	if FileExists("/this/file/does/not/exist/anywhere/1234") {
		t.Errorf("Expected FileExists to return false for non-existent file")
	}

	// Create a real temp file to test successful path
	tmpDir := t.TempDir()
	filePath := tmpDir + "/test_file.txt"
	if err := os.WriteFile(filePath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}

	if !FileExists(filePath) {
		t.Errorf("Expected FileExists to return true for existing file")
	}

	// Check directory returns false
	if FileExists(tmpDir) {
		t.Errorf("Expected FileExists to return false for a directory")
	}
}

func TestDetectLibc(t *testing.T) {
	// Only makes sense to test on Linux or fake the check if we want full branch coverage.
	// We can test DetectLibc behavior by overriding the input check.

	tests := []struct {
		name          string
		osVal         string // We'll bypass OS check if needed by structuring fake files
		existingFiles map[string]bool
		want          string
	}{
		{
			"glibc system",
			OSLinux,
			map[string]bool{"/lib64/ld-linux-x86-64.so.2": true},
			LibcGlibc,
		},
		{
			"musl system",
			OSLinux,
			map[string]bool{"/lib/ld-musl-x86_64.so.1": true},
			LibcMusl,
		},
		{
			"ambiguous system (both loaders present)",
			OSLinux,
			map[string]bool{
				"/lib64/ld-linux-x86-64.so.2": true,
				"/lib/ld-musl-x86_64.so.1":    true,
			},
			LibcUnknown,
		},
		{
			"no loaders",
			OSLinux,
			map[string]bool{},
			LibcUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			existsMock := func(path string) bool {
				return tt.existingFiles[path]
			}

			// If the current OS is not Linux, DetectLibc will return LibcUnknown immediately.
			// Let's check that contract, and then if we want to test Linux branches, we only assert on Linux.
			got := DetectLibc(existsMock)
			if runtime.GOOS != "linux" {
				if got != LibcUnknown {
					t.Errorf("DetectLibc() on non-Linux = %q, want %q", got, LibcUnknown)
				}
			} else {
				if got != tt.want {
					t.Errorf("DetectLibc() = %q, want %q", got, tt.want)
				}
			}
		})
	}
}
