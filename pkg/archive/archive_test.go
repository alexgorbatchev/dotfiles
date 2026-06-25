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
		"file1.txt":     "content1",
		"sub/file2.txt": "content2",
		"dir/":          "", // Directory entry
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

func TestExtractorSymlinksAndHeuristics(t *testing.T) {
	t.Run("Zip Symlink Extraction", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		// Create zip bytes with a file and a symlink
		var buf bytes.Buffer
		w := zip.NewWriter(&buf)

		// Regular file
		f1, err := w.Create("hello.txt")
		if err != nil {
			t.Fatalf("failed to create zip file: %v", err)
		}
		_, _ = f1.Write([]byte("hello content"))

		// Symlink file
		header := &zip.FileHeader{
			Name: "link.txt",
		}
		header.SetMode(os.ModeSymlink | 0777)
		f2, err := w.CreateHeader(header)
		if err != nil {
			t.Fatalf("failed to create zip header: %v", err)
		}
		_, _ = f2.Write([]byte("hello.txt")) // points to hello.txt

		_ = w.Close()

		err = memFS.WriteFile("/test.zip", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write zip file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.zip", "/dest")
		if err != nil {
			t.Fatalf("extract failed: %v", err)
		}

		// Read link target
		target, err := memFS.Readlink("/dest/link.txt")
		if err != nil {
			t.Fatalf("failed to read link: %v", err)
		}
		if target != "hello.txt" {
			t.Errorf("expected link target hello.txt, got %q", target)
		}
	})

	t.Run("Tar Symlink Extraction", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		tw := tar.NewWriter(gw)

		// Regular file
		_ = tw.WriteHeader(&tar.Header{
			Typeflag: tar.TypeReg,
			Name:     "hello.txt",
			Mode:     0644,
			Size:     5,
		})
		_, _ = tw.Write([]byte("hello"))

		// Symlink
		_ = tw.WriteHeader(&tar.Header{
			Typeflag: tar.TypeSymlink,
			Name:     "link.txt",
			Linkname: "hello.txt",
			Mode:     0777,
		})

		_ = tw.Close()
		_ = gw.Close()

		err := memFS.WriteFile("/test.tar.gz", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write tar file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.tar.gz", "/dest")
		if err != nil {
			t.Fatalf("extract failed: %v", err)
		}

		target, err := memFS.Readlink("/dest/link.txt")
		if err != nil {
			t.Fatalf("failed to read link: %v", err)
		}
		if target != "hello.txt" {
			t.Errorf("expected link target hello.txt, got %q", target)
		}
	})

	t.Run("Executable Heuristics Check", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		// Create a file with shebang
		_ = memFS.MkdirAll("/dest", 0755)
		err := memFS.WriteFile("/dest/script", []byte("#!/bin/sh\necho ok"), 0644)
		if err != nil {
			t.Fatalf("failed to write file: %v", err)
		}

		// Create ELF binary file
		err = memFS.WriteFile("/dest/binary", []byte{0x7f, 'E', 'L', 'F', 0, 0, 0, 0}, 0644)
		if err != nil {
			t.Fatalf("failed to write file: %v", err)
		}

		err = ext.detectAndSetExecutables("/dest")
		if err != nil {
			t.Fatalf("heuristics failed: %v", err)
		}

		info1, err := memFS.Stat("/dest/script")
		if err != nil {
			t.Fatalf("stat failed: %v", err)
		}
		if info1.Mode()&0111 == 0 {
			t.Error("expected script to have executable bit set")
		}

		info2, err := memFS.Stat("/dest/binary")
		if err != nil {
			t.Fatalf("stat failed: %v", err)
		}
		if info2.Mode()&0111 == 0 {
			t.Error("expected binary to have executable bit set")
		}
	})

	t.Run("Single Gzip Extraction", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		_, _ = gw.Write([]byte("uncompressed text"))
		_ = gw.Close()

		err := memFS.WriteFile("/text.gz", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write gz: %v", err)
		}

		err = ext.Extract(context.Background(), "/text.gz", "/dest")
		if err != nil {
			t.Fatalf("extract failed: %v", err)
		}

		data, err := memFS.ReadFile("/dest/text")
		if err != nil {
			t.Fatalf("failed to read decompressed file: %v", err)
		}
		if string(data) != "uncompressed text" {
			t.Errorf("expected 'uncompressed text', got %q", string(data))
		}
	})
}
