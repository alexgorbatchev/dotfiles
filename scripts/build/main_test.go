package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestCheckBinarySizeLimits(t *testing.T) {
	tests := []struct {
		name      string
		fileSize  int64
		expectErr bool
	}{
		{
			name:      "under size limit",
			fileSize:  10 * 1024 * 1024, // 10 MB
			expectErr: false,
		},
		{
			name:      "exceeds size limit",
			fileSize:  27 * 1024 * 1024, // 27 MB
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			distDir := filepath.Join(tmpDir, ".dist")
			if err := os.MkdirAll(distDir, 0755); err != nil {
				t.Fatalf("failed to create .dist dir: %v", err)
			}

			nativeBin := "dotfiles"
			if runtime.GOOS == "windows" {
				nativeBin = "dotfiles.exe"
			}
			nativePath := filepath.Join(distDir, nativeBin)

			f, err := os.Create(nativePath)
			if err != nil {
				t.Fatalf("failed to create native binary file: %v", err)
			}
			if err := f.Truncate(tt.fileSize); err != nil {
				_ = f.Close()
				t.Fatalf("failed to truncate binary file: %v", err)
			}
			_ = f.Close()

			targets := []string{
				"alexgorbatchev/dotfiles-darwin-x64",
				"alexgorbatchev/dotfiles-darwin-arm64",
				"alexgorbatchev/dotfiles-linux-x64",
				"alexgorbatchev/dotfiles-linux-arm64",
			}

			for _, target := range targets {
				binDir := filepath.Join(distDir, "packages", target, "bin")
				if err := os.MkdirAll(binDir, 0755); err != nil {
					t.Fatalf("failed to create target bin dir: %v", err)
				}
				binPath := filepath.Join(binDir, "dotfiles")
				tf, err := os.Create(binPath)
				if err != nil {
					t.Fatalf("failed to create target binary file: %v", err)
				}
				if err := tf.Truncate(tt.fileSize); err != nil {
					_ = tf.Close()
					t.Fatalf("failed to truncate target binary file: %v", err)
				}
				_ = tf.Close()
			}

			err = checkBinarySizeLimits(tmpDir)
			if (err != nil) != tt.expectErr {
				t.Fatalf("checkBinarySizeLimits() error = %v, expectErr %v", err, tt.expectErr)
			}
		})
	}
}

func TestCopyFile(t *testing.T) {
	tmpDir := t.TempDir()
	src := filepath.Join(tmpDir, "src.txt")
	dst := filepath.Join(tmpDir, "dst.txt")

	content := []byte("hello world test copy")
	if err := os.WriteFile(src, content, 0644); err != nil {
		t.Fatalf("failed to write src file: %v", err)
	}

	if err := copyFile(src, dst); err != nil {
		t.Fatalf("copyFile failed: %v", err)
	}

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("failed to read dst file: %v", err)
	}

	if string(got) != string(content) {
		t.Fatalf("copyFile output mismatch: got %s, want %s", string(got), string(content))
	}
}
