package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func createZipBytes(files map[string]string) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for name, content := range files {
		f, err := w.Create(name)
		if err != nil {
			return nil, err
		}
		_, err = f.Write([]byte(content))
		if err != nil {
			return nil, err
		}
	}
	err := w.Close()
	return buf.Bytes(), err
}

func createTarGzBytes(files map[string]string) ([]byte, error) {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	for name, content := range files {
		hdr := &tar.Header{
			Name: name,
			Mode: 0644,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return nil, err
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			return nil, err
		}
	}

	_ = tw.Close()
	_ = gw.Close()
	return buf.Bytes(), nil
}

func TestExtractorZip(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	files := map[string]string{
		"file1.txt":      "content1",
		"sub/file2.txt":  "content2",
		"dir/":           "", // Directory entry
	}

	zipBytes, err := createZipBytes(files)
	if err != nil {
		t.Fatalf("failed to create zip bytes: %v", err)
	}

	err = memFS.WriteFile("/test.zip", zipBytes, 0644)
	if err != nil {
		t.Fatalf("failed to write zip file: %v", err)
	}

	err = ext.Extract(context.Background(), "/test.zip", "/dest")
	if err != nil {
		t.Fatalf("extract failed: %v", err)
	}

	data1, err := memFS.ReadFile("/dest/file1.txt")
	if err != nil {
		t.Fatalf("file1.txt not found: %v", err)
	}
	if string(data1) != "content1" {
		t.Errorf("expected content1, got %q", string(data1))
	}

	data2, err := memFS.ReadFile("/dest/sub/file2.txt")
	if err != nil {
		t.Fatalf("file2.txt not found: %v", err)
	}
	if string(data2) != "content2" {
		t.Errorf("expected content2, got %q", string(data2))
	}
}

func TestExtractorTarGz(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	files := map[string]string{
		"file1.txt":     "content1",
		"sub/file2.txt": "content2",
	}

	tarGzBytes, err := createTarGzBytes(files)
	if err != nil {
		t.Fatalf("failed to create tar.gz bytes: %v", err)
	}

	err = memFS.WriteFile("/test.tar.gz", tarGzBytes, 0644)
	if err != nil {
		t.Fatalf("failed to write tar.gz file: %v", err)
	}

	err = ext.Extract(context.Background(), "/test.tar.gz", "/dest")
	if err != nil {
		t.Fatalf("extract failed: %v", err)
	}

	data1, err := memFS.ReadFile("/dest/file1.txt")
	if err != nil {
		t.Fatalf("file1.txt not found: %v", err)
	}
	if string(data1) != "content1" {
		t.Errorf("expected content1, got %q", string(data1))
	}
}

func TestExtractorTarBz2(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	// Valid tar.bz2 containing hello.txt with content "hello" (hex generated dynamically)
	tarBz2Hex := "425a6839314159265359aba8c46a000078fb84c100004240017f80008062449e400000800820007221000000009213523d10d34f50d94f5319c5621083990123c48ddf78a1d99240ec3ddfa44922b4a7199797eb0574f5a59e3782969968ad1c75c71c9733f2e60a03e77eef940e8088807c5dc914e14242aea311a8"
	tarBz2Bytes, err := hex.DecodeString(tarBz2Hex)
	if err != nil {
		t.Fatalf("failed to decode tar.bz2 hex: %v", err)
	}

	err = memFS.WriteFile("/test.tar.bz2", tarBz2Bytes, 0644)
	if err != nil {
		t.Fatalf("failed to write tar.bz2 file: %v", err)
	}

	err = ext.Extract(context.Background(), "/test.tar.bz2", "/dest")
	if err != nil {
		t.Fatalf("extract failed: %v", err)
	}

	data, err := memFS.ReadFile("/dest/hello.txt")
	if err != nil {
		t.Fatalf("hello.txt not found: %v", err)
	}
	if string(data) != "hello" {
		t.Errorf("expected hello, got %q", string(data))
	}
}

func TestExtractorDmg(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	// Intercept the mountpoint argument dynamically to write mock files
	runner.RegisterFunc("hdiutil", func(c *exec.MockCmd) error {
		if len(c.Args) > 4 && c.Args[0] == "attach" {
			mountPoint := c.Args[4]
			err := os.WriteFile(filepath.Join(mountPoint, "hello-dmg.txt"), []byte("hello from dmg"), 0644)
			return err
		}
		return nil
	})

	err := memFS.WriteFile("/test.dmg", []byte("dmg header"), 0644)
	if err != nil {
		t.Fatalf("failed to write dmg: %v", err)
	}

	err = ext.Extract(context.Background(), "/test.dmg", "/dest")
	if err != nil {
		t.Fatalf("extract dmg failed: %v", err)
	}

	data, err := memFS.ReadFile("/dest/hello-dmg.txt")
	if err != nil {
		t.Fatalf("hello-dmg.txt not found in dest: %v", err)
	}
	if string(data) != "hello from dmg" {
		t.Errorf("expected hello from dmg, got %q", string(data))
	}
}

func TestExtractorPkg(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	runner.Register("pkgutil", []byte("pkgutil output"), nil)

	err := memFS.WriteFile("/test.pkg", []byte("pkg bytes"), 0644)
	if err != nil {
		t.Fatalf("failed to write pkg: %v", err)
	}

	err = ext.Extract(context.Background(), "/test.pkg", "/dest")
	if err != nil {
		t.Fatalf("extract pkg failed: %v", err)
	}

	// Verify that pkgutil command was run in runner history
	found := false
	for _, cmd := range runner.History {
		if cmd.Name == "pkgutil" {
			found = true
			if cmd.Args[0] != "--expand-full" {
				t.Errorf("unexpected pkgutil arg: %v", cmd.Args[0])
			}
		}
	}
	if !found {
		t.Error("expected pkgutil command to be run")
	}
}

func TestUnsupportedFormat(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	err := ext.Extract(context.Background(), "/test.unsupported", "/dest")
	if err == nil {
		t.Fatal("expected error for unsupported format, got nil")
	}
}
