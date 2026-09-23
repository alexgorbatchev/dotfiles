package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
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

// An after-extract hook is told what came out of the archive, so it can place a binary
// without walking the tree and repeating the executable heuristic.
func TestExtract_ReportsExtractedFilesAndExecutables(t *testing.T) {
	memFS := fs.NewMemFS()
	data, err := createZipBytes(map[string]string{
		"bin/tool":  "#!/bin/sh\necho hi",
		"README.md": "docs",
	})
	if err != nil {
		t.Fatalf("building the archive: %v", err)
	}
	if err := memFS.WriteFile("/src.zip", data, 0644); err != nil {
		t.Fatalf("writing the archive: %v", err)
	}

	var got lifecycle.Details
	ctx := lifecycle.WithEmitter(context.Background(), func(_ context.Context, event lifecycle.Event, details lifecycle.Details) error {
		if event == lifecycle.AfterExtract {
			got = details
		}
		return nil
	})

	ext := NewExtractor(memFS, exec.NewMockRunner())
	if err := ext.Extract(ctx, "/src.zip", "/dest"); err != nil {
		t.Fatalf("Extract failed: %v", err)
	}

	if len(got.ExtractedFiles) != 2 {
		t.Errorf("ExtractedFiles = %v, want both archive members", got.ExtractedFiles)
	}
	if len(got.Executables) != 1 || filepath.Base(got.Executables[0]) != "tool" {
		t.Errorf("Executables = %v, want only the shebang script", got.Executables)
	}
}

func createTarBytes(files map[string]string) ([]byte, error) {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)

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
	return buf.Bytes(), nil
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

func TestExtractorTar(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	files := map[string]string{
		"uncompressed.txt": "plain tar content",
	}

	tarBytes, err := createTarBytes(files)
	if err != nil {
		t.Fatalf("failed to create tar bytes: %v", err)
	}

	err = memFS.WriteFile("/test.tar", tarBytes, 0644)
	if err != nil {
		t.Fatalf("failed to write tar file: %v", err)
	}

	err = ext.Extract(context.Background(), "/test.tar", "/dest")
	if err != nil {
		t.Fatalf("extract failed: %v", err)
	}

	data, err := memFS.ReadFile("/dest/uncompressed.txt")
	if err != nil {
		t.Fatalf("uncompressed.txt not found: %v", err)
	}
	if string(data) != "plain tar content" {
		t.Errorf("expected plain tar content, got %q", string(data))
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

	archivetest.Hdiutil{FS: memFS, Volume: func(mountPoint string) error {
		return memFS.WriteFile(filepath.Join(mountPoint, "hello-dmg.txt"), []byte("hello from dmg"), 0644)
	}}.Register(runner)

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
	if !errors.Is(err, ErrUnsupportedFormat) {
		t.Fatalf("expected ErrUnsupportedFormat, got %v", err)
	}
}

func TestExtension(t *testing.T) {
	tests := []struct {
		name          string
		wantExtension string
		wantSupported bool
	}{
		{"tool-v1.0.0.tar.gz", ".tar.gz", true},
		{"tool-v1.0.0.tgz", ".tgz", true},
		{"tool-v1.0.0.tar.bz2", ".tar.bz2", true},
		{"tool-v1.0.0.tbz2", ".tbz2", true},
		{"tool-v1.0.0.tbz", ".tbz", true},
		{"tool-v1.0.0.tar.xz", ".tar.xz", true},
		{"tool-v1.0.0.txz", ".txz", true},
		{"tool-v1.0.0.tar", ".tar", true},
		{"tool-v1.0.0.zip", ".zip", true},
		{"hermit-darwin-arm64.gz", ".gz", true},
		{"tool.dmg", ".dmg", true},
		{"tool.pkg", ".pkg", true},
		{"tool-v1.0.0.TAR.GZ", ".tar.gz", true},
		{"tool-v1.0.0.TBz2", ".tbz2", true},
		{"/downloads/tool-v1.0.0.tar.xz", ".tar.xz", true},
		// Recognised as archives so callers can refuse them, but not extractable.
		{"tool-v1.0.0.rar", ".rar", false},
		{"tool-v1.0.0.7z", ".7z", false},
		{"tool-v1.0.0.tar.zst", ".tar.zst", false},
		{"tool-v1.0.0.tar.lzma", ".tar.lzma", false},
		{"tool-linux-amd64.xz", ".xz", false},
		{"tool-linux-amd64.bz2", ".bz2", false},
		// Not archives at all.
		{"tool.exe", "", false},
		{"tool-linux-amd64", "", false},
		{"tool-1.2.3-linux-amd64", "", false},
		{"README.txt", "", false},
		{"", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Extension(tt.name); got != tt.wantExtension {
				t.Errorf("Extension(%q) = %q, want %q", tt.name, got, tt.wantExtension)
			}
			if got := IsSupported(tt.name); got != tt.wantSupported {
				t.Errorf("IsSupported(%q) = %v, want %v", tt.name, got, tt.wantSupported)
			}
		})
	}
}

// TestSupportedExtensionsDispatch ties the advertised list to Extract itself: every
// listed suffix must reach a format handler (and so fail on the missing file, not on
// format detection), and a suffix outside the list must be refused as unsupported.
func TestSupportedExtensionsDispatch(t *testing.T) {
	memFS := fs.NewMemFS()
	ext := NewExtractor(memFS, exec.NewMockRunner())

	supported := SupportedExtensions()
	if len(supported) == 0 {
		t.Fatal("SupportedExtensions() is empty")
	}
	for _, suffix := range supported {
		t.Run(suffix, func(t *testing.T) {
			err := ext.Extract(context.Background(), "/missing"+suffix, "/dest")
			if err == nil {
				t.Fatalf("Extract of a missing %s file succeeded", suffix)
			}
			if errors.Is(err, ErrUnsupportedFormat) {
				t.Errorf("%s is listed as supported but Extract refused it: %v", suffix, err)
			}
		})
	}

	for _, suffix := range []string{".rar", ".7z", ".xz", ".tar.zst", ".exe", ""} {
		t.Run("unsupported"+suffix, func(t *testing.T) {
			err := ext.Extract(context.Background(), "/missing"+suffix, "/dest")
			if !errors.Is(err, ErrUnsupportedFormat) {
				t.Errorf("Extract(/missing%s) = %v, want ErrUnsupportedFormat", suffix, err)
			}
		})
	}

	supported[0] = "mutated"
	if SupportedExtensions()[0] == "mutated" {
		t.Error("SupportedExtensions() must return a copy")
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

		_, _, err = ext.detectAndSetExecutables("/dest")
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

func TestExtractorSymlinkTraversalPrevention(t *testing.T) {
	t.Run("Zip Absolute Symlink Traversal Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		w := zip.NewWriter(&buf)

		header := &zip.FileHeader{
			Name: "escaped_abs_link.txt",
		}
		header.SetMode(os.ModeSymlink | 0777)
		f, err := w.CreateHeader(header)
		if err != nil {
			t.Fatalf("failed to create zip header: %v", err)
		}
		_, _ = f.Write([]byte("/tmp/escaped_test"))

		_ = w.Close()

		err = memFS.WriteFile("/test.zip", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write zip file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.zip", "/dest")
		if err == nil {
			t.Error("expected error for absolute zip symlink traversal, got nil")
		} else if err != ErrSymlinkTraversalDetected {
			t.Errorf("expected error ErrSymlinkTraversalDetected, got %v", err)
		}

		// Ensure nothing is written outside the destination directory
		_, err = memFS.Stat("/tmp/escaped_test")
		if err == nil {
			t.Error("expected no file to be created at /tmp/escaped_test")
		}
	})

	t.Run("Zip Relative Symlink Traversal Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		w := zip.NewWriter(&buf)

		header := &zip.FileHeader{
			Name: "escaped_rel_link.txt",
		}
		header.SetMode(os.ModeSymlink | 0777)
		f, err := w.CreateHeader(header)
		if err != nil {
			t.Fatalf("failed to create zip header: %v", err)
		}
		_, _ = f.Write([]byte("../../escaped_relative"))

		_ = w.Close()

		err = memFS.WriteFile("/test.zip", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write zip file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.zip", "/dest")
		if err == nil {
			t.Error("expected error for relative zip symlink traversal, got nil")
		} else if err != ErrSymlinkTraversalDetected {
			t.Errorf("expected error ErrSymlinkTraversalDetected, got %v", err)
		}

		// Ensure nothing is written outside the destination directory
		_, err = memFS.Stat("/escaped_relative")
		if err == nil {
			t.Error("expected no file to be created at /escaped_relative")
		}
	})

	t.Run("Tar Absolute Symlink Traversal Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		tw := tar.NewWriter(gw)

		_ = tw.WriteHeader(&tar.Header{
			Typeflag: tar.TypeSymlink,
			Name:     "escaped_abs_link.txt",
			Linkname: "/tmp/escaped_test",
			Mode:     0777,
		})

		_ = tw.Close()
		_ = gw.Close()

		err := memFS.WriteFile("/test.tar.gz", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write tar file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.tar.gz", "/dest")
		if err == nil {
			t.Error("expected error for absolute tar symlink traversal, got nil")
		} else if err != ErrSymlinkTraversalDetected {
			t.Errorf("expected error ErrSymlinkTraversalDetected, got %v", err)
		}

		_, err = memFS.Stat("/tmp/escaped_test")
		if err == nil {
			t.Error("expected no file to be created at /tmp/escaped_test")
		}
	})

	t.Run("Tar Relative Symlink Traversal Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		tw := tar.NewWriter(gw)

		_ = tw.WriteHeader(&tar.Header{
			Typeflag: tar.TypeSymlink,
			Name:     "escaped_rel_link.txt",
			Linkname: "../../escaped_relative",
			Mode:     0777,
		})

		_ = tw.Close()
		_ = gw.Close()

		err := memFS.WriteFile("/test.tar.gz", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write tar file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.tar.gz", "/dest")
		if err == nil {
			t.Error("expected error for relative tar symlink traversal, got nil")
		} else if err != ErrSymlinkTraversalDetected {
			t.Errorf("expected error ErrSymlinkTraversalDetected, got %v", err)
		}

		_, err = memFS.Stat("/escaped_relative")
		if err == nil {
			t.Error("expected no file to be created at /escaped_relative")
		}
	})

	t.Run("Zip Backslash Symlink Traversal Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		w := zip.NewWriter(&buf)

		header := &zip.FileHeader{
			Name: "escaped_backslash_link.txt",
		}
		header.SetMode(os.ModeSymlink | 0777)
		f, err := w.CreateHeader(header)
		if err != nil {
			t.Fatalf("failed to create zip header: %v", err)
		}
		_, _ = f.Write([]byte("subdir\\..\\..\\escaped_backslash"))

		_ = w.Close()

		err = memFS.WriteFile("/test.zip", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write zip file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.zip", "/dest")
		if err == nil {
			t.Error("expected error for backslash zip symlink traversal, got nil")
		} else if err != ErrSymlinkTraversalDetected {
			t.Errorf("expected error ErrSymlinkTraversalDetected, got %v", err)
		}

		// Ensure nothing is written outside the destination directory
		_, err = memFS.Stat("/escaped_backslash")
		if err == nil {
			t.Error("expected no file to be created at /escaped_backslash")
		}
	})

	t.Run("Tar Backslash Symlink Traversal Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		tw := tar.NewWriter(gw)

		_ = tw.WriteHeader(&tar.Header{
			Typeflag: tar.TypeSymlink,
			Name:     "escaped_backslash_link.txt",
			Linkname: "subdir\\..\\..\\escaped_backslash",
			Mode:     0777,
		})

		_ = tw.Close()
		_ = gw.Close()

		err := memFS.WriteFile("/test.tar.gz", buf.Bytes(), 0644)
		if err != nil {
			t.Fatalf("failed to write tar file: %v", err)
		}

		err = ext.Extract(context.Background(), "/test.tar.gz", "/dest")
		if err == nil {
			t.Error("expected error for backslash tar symlink traversal, got nil")
		} else if err != ErrSymlinkTraversalDetected {
			t.Errorf("expected error ErrSymlinkTraversalDetected, got %v", err)
		}

		_, err = memFS.Stat("/escaped_backslash")
		if err == nil {
			t.Error("expected no file to be created at /escaped_backslash")
		}
	})
}

func TestExtractTarXzPipeCleanupOnEarlyError(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	writeErrCh := make(chan error, 1)

	// Mock xz command to write bogus data to stdout (pw) repeatedly
	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout == nil {
			return nil
		}
		// Write invalid tar header data so tar.NewReader(pr) returns a tar reading error
		for i := 0; i < 100; i++ {
			_, err := stdout.Write([]byte("invalid tar header payload content data that triggers tar error\n"))
			if err != nil {
				writeErrCh <- err
				return err
			}
		}
		return nil
	})

	err := memFS.WriteFile("/test.txz", []byte("xz data"), 0644)
	if err != nil {
		t.Fatalf("failed to write txz file: %v", err)
	}

	ext := NewExtractor(memFS, runner)
	err = ext.Extract(context.Background(), "/test.txz", "/dest")
	if err == nil {
		t.Fatal("expected error extracting invalid xz tar stream, got nil")
	}

	// Verify process group was set on the mock command
	if len(runner.History) == 0 {
		t.Fatal("expected xz command in history")
	}
	xzCmd := runner.History[0]
	if !xzCmd.ProcessGroup() {
		t.Error("expected xz command to have ProcessGroup enabled")
	}
	if !xzCmd.Killed() {
		t.Error("expected xz command to be Killed on early extraction error")
	}

	// Verify that the pipe reader was closed, causing stdout.Write to receive io.ErrClosedPipe
	select {
	case err := <-writeErrCh:
		if err == nil {
			t.Error("expected non-nil error on write to closed pipe")
		}
	default:
		// If writeErrCh didn't receive, either run finished or error occurred
	}
}

func TestExtractTarXzProcessGroupAndCleanupOnCancel(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	// Mock xz command to write bogus data endlessly unless killed
	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout == nil {
			return nil
		}
		for {
			if c.Killed() {
				return errors.New("killed")
			}
			_, err := stdout.Write([]byte("data block\n"))
			if err != nil {
				return err
			}
		}
	})

	err := memFS.WriteFile("/test.txz", []byte("xz data"), 0644)
	if err != nil {
		t.Fatalf("failed to write txz file: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Pre-cancelled context

	ext := NewExtractor(memFS, runner)
	err = ext.Extract(ctx, "/test.txz", "/dest")
	if err == nil {
		t.Fatal("expected error extracting with cancelled context, got nil")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled error, got %v", err)
	}

	if len(runner.History) == 0 {
		t.Fatal("expected xz command in history")
	}
	xzCmd := runner.History[0]
	if !xzCmd.ProcessGroup() {
		t.Error("expected xz command to have ProcessGroup enabled")
	}
	if !xzCmd.Killed() {
		t.Error("expected xz command to be Killed on cancelled context")
	}
}

func TestZipSlipPrevention(t *testing.T) {
	t.Run("IsSafeTargetPath Unit Verification", func(t *testing.T) {
		tests := []struct {
			name    string
			dest    string
			target  string
			wantErr bool
		}{
			{"valid relative file", "/dest", "foo/bar.txt", false},
			{"valid single file", "/dest", "file.txt", false},
			{"traversal relative", "/dest", "../../etc/passwd", true},
			{"absolute unix path", "/dest", "/etc/passwd", true},
			{"absolute windows path", "/dest", "C:\\Windows\\System32", true},
			{"empty target", "/dest", "", true},
			{"nested traversal", "/dest", "sub/dir/../../../../etc/passwd", true},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				got, err := isSafeTargetPath(tt.dest, tt.target)
				if (err != nil) != tt.wantErr {
					t.Fatalf("isSafeTargetPath(%q, %q) error = %v, wantErr %v", tt.dest, tt.target, err, tt.wantErr)
				}
				if !tt.wantErr && got == "" {
					t.Fatalf("isSafeTargetPath(%q, %q) returned empty path", tt.dest, tt.target)
				}
			})
		}
	})

	t.Run("Zip File Zip-Slip Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		files := map[string]string{
			"../../escaped_file.txt": "evil content",
		}
		zipBytes, err := createZipBytes(files)
		if err != nil {
			t.Fatalf("failed to create zip: %v", err)
		}

		_ = memFS.WriteFile("/evil.zip", zipBytes, 0644)
		err = ext.Extract(context.Background(), "/evil.zip", "/dest")
		if err == nil {
			t.Error("expected error for zip slip in zip file, got nil")
		} else if !errors.Is(err, ErrZipSlipDetected) {
			t.Errorf("expected ErrZipSlipDetected, got %v", err)
		}

		_, err = memFS.Stat("/escaped_file.txt")
		if err == nil {
			t.Error("file was extracted outside dest dir")
		}
	})

	t.Run("Tar File Zip-Slip Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		files := map[string]string{
			"../../escaped_file.txt": "evil content",
		}
		tarGzBytes, err := createTarGzBytes(files)
		if err != nil {
			t.Fatalf("failed to create tar.gz: %v", err)
		}

		_ = memFS.WriteFile("/evil.tar.gz", tarGzBytes, 0644)
		err = ext.Extract(context.Background(), "/evil.tar.gz", "/dest")
		if err == nil {
			t.Error("expected error for zip slip in tar.gz file, got nil")
		} else if !errors.Is(err, ErrZipSlipDetected) {
			t.Errorf("expected ErrZipSlipDetected, got %v", err)
		}

		_, err = memFS.Stat("/escaped_file.txt")
		if err == nil {
			t.Error("file was extracted outside dest dir")
		}
	})

	t.Run("Absolute Path Zip-Slip Detection", func(t *testing.T) {
		memFS := fs.NewMemFS()
		runner := exec.NewMockRunner()
		ext := NewExtractor(memFS, runner)

		files := map[string]string{
			"/etc/passwd": "evil content",
		}
		zipBytes, err := createZipBytes(files)
		if err != nil {
			t.Fatalf("failed to create zip: %v", err)
		}

		_ = memFS.WriteFile("/evil_abs.zip", zipBytes, 0644)
		err = ext.Extract(context.Background(), "/evil_abs.zip", "/dest")
		if err == nil {
			t.Error("expected error for absolute path in zip file, got nil")
		} else if !errors.Is(err, ErrZipSlipDetected) {
			t.Errorf("expected ErrZipSlipDetected, got %v", err)
		}
	})
}

// closeFailingFS stands in for a file system that reports a deferred write failure,
// such as a full disk, an exceeded quota or an NFS home directory, only when a written
// file is closed. Every file it creates keeps the bytes written to it, but its Close
// returns EIO. It records the paths it was asked to chmod.
type closeFailingFS struct {
	fs.FS
	chmodded []string
}

type closeFailingWriter struct {
	io.WriteCloser
}

func (w closeFailingWriter) Close() error {
	if err := w.WriteCloser.Close(); err != nil {
		return err
	}
	return syscall.EIO
}

func (c *closeFailingFS) Create(path string) (io.WriteCloser, error) {
	w, err := c.FS.Create(path)
	if err != nil {
		return nil, err
	}
	return closeFailingWriter{w}, nil
}

func (c *closeFailingFS) Chmod(path string, perm os.FileMode) error {
	c.chmodded = append(c.chmodded, path)
	return c.FS.Chmod(path, perm)
}

// A write that fails only when the extracted file is closed leaves an incomplete file,
// so Extract must fail, name that file, and neither set its permissions nor report the
// tree to an after-extract hook. A .dmg is not among the formats: its volume is copied
// with fs.CopyTree, whose files go through FS.CopyFile, and OSFS.CopyFile reports its
// own close failure (TestOSFSCopyFileReportsACloseFailure in pkg/fs).
func TestExtract_ReportsAFailureToCloseAnExtractedFile(t *testing.T) {
	const content = "#!/bin/sh\necho tool"
	const wantPath = "/dest/tool"

	tarBytes, err := createTarBytes(map[string]string{"tool": content})
	if err != nil {
		t.Fatalf("building the tar archive: %v", err)
	}
	tarGzBytes, err := createTarGzBytes(map[string]string{"tool": content})
	if err != nil {
		t.Fatalf("building the tar.gz archive: %v", err)
	}
	zipBytes, err := createZipBytes(map[string]string{"tool": content})
	if err != nil {
		t.Fatalf("building the zip archive: %v", err)
	}
	var gzBuf bytes.Buffer
	gw := gzip.NewWriter(&gzBuf)
	if _, err := gw.Write([]byte(content)); err != nil {
		t.Fatalf("building the gz stream: %v", err)
	}
	if err := gw.Close(); err != nil {
		t.Fatalf("building the gz stream: %v", err)
	}

	tests := []struct {
		name  string
		src   string
		data  []byte
		setup func(memFS *fs.MemFS, runner *exec.MockRunner)
	}{
		{name: "zip", src: "/tool.zip", data: zipBytes},
		{name: "tar", src: "/tool.tar", data: tarBytes},
		{name: "tar.gz", src: "/tool.tar.gz", data: tarGzBytes},
		{
			name: "tar.xz",
			src:  "/tool.tar.xz",
			data: []byte("xz data"),
			setup: func(_ *fs.MemFS, runner *exec.MockRunner) {
				runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
					_, err := c.Stdout().Write(tarBytes)
					return err
				})
			},
		},
		{name: "gz", src: "/tool.gz", data: gzBuf.Bytes()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := fs.NewMemFS()
			runner := exec.NewMockRunner()
			if tt.setup != nil {
				tt.setup(memFS, runner)
			}
			if err := memFS.WriteFile(tt.src, tt.data, 0644); err != nil {
				t.Fatalf("writing the archive: %v", err)
			}
			failing := &closeFailingFS{FS: memFS}

			emitted := false
			ctx := lifecycle.WithEmitter(context.Background(), func(_ context.Context, event lifecycle.Event, _ lifecycle.Details) error {
				if event == lifecycle.AfterExtract {
					emitted = true
				}
				return nil
			})

			err := NewExtractor(failing, runner).Extract(ctx, tt.src, "/dest")
			if !errors.Is(err, syscall.EIO) {
				t.Errorf("Extract(%q) error = %v, want one wrapping EIO", tt.src, err)
			}
			if err != nil && !strings.Contains(err.Error(), wantPath) {
				t.Errorf("Extract(%q) error = %q, want it to name %s", tt.src, err, wantPath)
			}
			if slices.Contains(failing.chmodded, wantPath) {
				t.Errorf("Extract(%q) set permissions on %s after its close failed", tt.src, wantPath)
			}
			if emitted {
				t.Errorf("Extract(%q) emitted after-extract for a tree with an incompletely written file", tt.src)
			}
		})
	}
}

// TestExtractDmgReproducesSymlinks covers the tree a mounted .dmg volume holds: the
// drag-to-install link to /Applications and a framework's links to a directory, to
// a file and to nothing are recreated as symlinks with their targets, and regular files
// keep their permission bits. It runs on the host filesystem, where following a link to
// a directory fails; the mocked hdiutil attach lays the volume out at the mount point.
func TestExtractDmgReproducesSymlinks(t *testing.T) {
	osFS := fs.NewOSFS()
	dir := t.TempDir()
	dmg := filepath.Join(dir, "app.dmg")
	if err := osFS.WriteFile(dmg, []byte("dmg"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	dest := filepath.Join(dir, "extracted")
	links := map[string]string{
		"Applications": "/Applications",
		"App.app/Contents/Frameworks/Sparkle.framework/Versions/Current": "A",
		"App.app/Contents/Frameworks/Sparkle.framework/Sparkle":          "Versions/Current/Sparkle",
		"App.app/Contents/Frameworks/Sparkle.framework/Dangling":         "Versions/B/Missing",
	}
	runner := exec.NewMockRunner()
	archivetest.Hdiutil{FS: osFS, Volume: func(mountPoint string) error {
		writeDmgVolume(t, osFS, mountPoint, links)
		// A volume root can deny writing; the extraction directory must not take
		// its mode.
		return osFS.Chmod(mountPoint, 0o555)
	}}.Register(runner)

	if err := NewExtractor(osFS, runner).Extract(context.Background(), dmg, dest); err != nil {
		t.Fatalf("Extract(%s) = %v, want nil", dmg, err)
	}
	// Extracting into a dest that already holds the volume replaces each of its entries
	// wholesale rather than failing at the first link that already exists.
	if err := NewExtractor(osFS, runner).Extract(context.Background(), dmg, dest); err != nil {
		t.Fatalf("second Extract(%s) = %v, want nil", dmg, err)
	}
	t.Cleanup(func() { _ = osFS.Chmod(dest, 0o755) })
	if info, err := osFS.Stat(dest); err != nil {
		t.Fatalf("Stat(%s): %v", dest, err)
	} else if info.Mode().Perm()&0o200 == 0 {
		t.Errorf("%s mode = %v, want a directory its owner can write to", dest, info.Mode())
	}

	for rel, want := range links {
		path := filepath.Join(dest, rel)
		info, err := osFS.Lstat(path)
		if err != nil {
			t.Fatalf("Lstat(%s): %v", path, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			t.Errorf("%s mode = %v, want a symlink", rel, info.Mode())
			continue
		}
		if got, err := osFS.Readlink(path); err != nil || got != want {
			t.Errorf("%s links to %q (err %v), want %q", rel, got, err, want)
		}
	}
	copied := filepath.Join(dest, dmgVolumeNotice)
	info, err := osFS.Lstat(copied)
	if err != nil {
		t.Fatalf("Lstat(%s): %v", copied, err)
	}
	if got := info.Mode().Perm(); got != dmgVolumeNoticePerm {
		t.Errorf("%s mode = %v, want %v", copied, got, dmgVolumeNoticePerm)
	}
}

// dmgVolumeNotice is a file of the volume whose permission bits the extraction
// heuristics leave alone, since it has an extension and no executable signature.
const (
	dmgVolumeNotice     = "App.app/Contents/Resources/notice.txt"
	dmgVolumeNoticePerm = os.FileMode(0o640)
)

// writeDmgVolume lays out a volume holding an app bundle with a framework binary, a
// notice file with dmgVolumeNoticePerm, and the given links.
func writeDmgVolume(t *testing.T, osFS fs.FS, volume string, links map[string]string) {
	t.Helper()
	notice := filepath.Join(volume, dmgVolumeNotice)
	if err := osFS.MkdirAll(filepath.Dir(notice), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := osFS.WriteFile(notice, []byte("notice"), dmgVolumeNoticePerm); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := osFS.Chmod(notice, dmgVolumeNoticePerm); err != nil {
		t.Fatalf("Chmod: %v", err)
	}
	framework := filepath.Join(volume, "App.app", "Contents", "Frameworks", "Sparkle.framework")
	binary := filepath.Join(framework, "Versions", "A", "Sparkle")
	if err := osFS.MkdirAll(filepath.Dir(binary), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := osFS.WriteFile(binary, []byte("sparkle"), 0o755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	for rel, target := range links {
		if err := osFS.Symlink(target, filepath.Join(volume, rel)); err != nil {
			t.Fatalf("Symlink(%s): %v", rel, err)
		}
	}
}

// volumeFaultFS fails ReadDir of the volume, RemoveAll of the entry replaced in dest,
// or copying the volume's one file, whichever op names.
type volumeFaultFS struct {
	fs.FS
	op string
}

var errVolumeFault = errors.New("injected fault")

func (v volumeFaultFS) ReadDir(path string) ([]string, error) {
	if v.op == "readdir" && path == "/volume" {
		return nil, errVolumeFault
	}
	return v.FS.ReadDir(path)
}

func (v volumeFaultFS) RemoveAll(path string) error {
	if v.op == "removeall" && path == "/dest/tool" {
		return errVolumeFault
	}
	return v.FS.RemoveAll(path)
}

func (v volumeFaultFS) CopyFile(src, dest string) error {
	if v.op == "copy" {
		return errVolumeFault
	}
	return v.FS.CopyFile(src, dest)
}

func TestCopyVolumeReportsEachFailure(t *testing.T) {
	for _, op := range []string{"readdir", "removeall", "copy"} {
		t.Run(op, func(t *testing.T) {
			memFS := fs.NewMemFS()
			if err := memFS.MkdirAll("/volume", 0o755); err != nil {
				t.Fatalf("MkdirAll: %v", err)
			}
			if err := memFS.WriteFile("/volume/tool", []byte("tool"), 0o755); err != nil {
				t.Fatalf("WriteFile: %v", err)
			}
			ext := NewExtractor(volumeFaultFS{FS: memFS, op: op}, exec.NewMockRunner())
			if err := ext.copyVolume("/volume", "/dest"); !errors.Is(err, errVolumeFault) {
				t.Errorf("copyVolume = %v, want %v", err, errVolumeFault)
			}
		})
	}
}

// TestExtractDmgMountLifecycle is the regression test for issue #173: the image is
// attached read-only at a mount point created through fs.FS next to dest, a failed
// detach is retried with -force and otherwise fails the extraction, and the mount point
// is removed only once it is empty, never recursively.
func TestExtractDmgMountLifecycle(t *testing.T) {
	const (
		image      = "/stage/app.dmg"
		dest       = "/stage/out"
		mountPoint = "/stage/.out.dmg-mount"
		volumeFile = mountPoint + "/App.app/Contents/Info.plist"
	)
	attach := []string{"attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint, image}
	detach := []string{"detach", mountPoint}
	forceDetach := []string{"detach", mountPoint, "-force"}

	tests := []struct {
		name  string
		fake  archivetest.Hdiutil
		calls [][]string
		// wantErr is a substring of the error Extract must return, or "" for success.
		wantErr string
		// keepsVolume reports whether the volume's files must still be at the mount point.
		keepsVolume bool
	}{
		{
			name:  "a detach that succeeds removes the empty mount point",
			calls: [][]string{attach, detach},
		},
		{
			name:  "a mount point the unmount already removed needs no removing",
			fake:  archivetest.Hdiutil{RemoveMountPoint: true},
			calls: [][]string{attach, detach},
		},
		{
			name:  "a failed detach is retried with -force",
			fake:  archivetest.Hdiutil{Detach: archivetest.RefuseUnlessForced},
			calls: [][]string{attach, detach, forceDetach},
		},
		{
			name:        "a detach that fails even with -force fails the extraction and leaves the volume",
			fake:        archivetest.Hdiutil{Detach: func(bool) error { return archivetest.ErrResourceBusy }},
			calls:       [][]string{attach, detach, forceDetach},
			wantErr:     mountPoint,
			keepsVolume: true,
		},
		{
			name:        "a mount point that still holds files after a detach is not removed recursively",
			fake:        archivetest.Hdiutil{StayMounted: true},
			calls:       [][]string{attach, detach},
			wantErr:     mountPoint,
			keepsVolume: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := newDmgStage(t)
			runner := exec.NewMockRunner()
			fake := tt.fake
			fake.FS = memFS
			fake.Volume = func(mountPoint string) error {
				if err := memFS.MkdirAll(filepath.Dir(volumeFile), 0o755); err != nil {
					return err
				}
				return memFS.WriteFile(volumeFile, []byte("plist"), 0o644)
			}
			fake.Register(runner)

			err := NewExtractor(memFS, runner).Extract(context.Background(), image, dest)
			if tt.wantErr == "" && err != nil {
				t.Fatalf("Extract = %v, want nil", err)
			}
			if tt.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tt.wantErr)) {
				t.Fatalf("Extract = %v, want an error naming %q", err, tt.wantErr)
			}
			if got := archivetest.Calls(runner); !slices.EqualFunc(got, tt.calls, slices.Equal) {
				t.Errorf("hdiutil calls = %q, want %q", got, tt.calls)
			}
			if data, err := memFS.ReadFile(filepath.Join(dest, "App.app/Contents/Info.plist")); err != nil || string(data) != "plist" {
				t.Errorf("dest holds %q (err %v), want the volume's copied file", data, err)
			}
			volumeExists, _ := memFS.Exists(volumeFile)
			if volumeExists != tt.keepsVolume {
				t.Errorf("volume file present after Extract = %v, want %v", volumeExists, tt.keepsVolume)
			}
			mountPointExists, _ := memFS.Exists(mountPoint)
			if mountPointExists != tt.keepsVolume {
				t.Errorf("mount point present after Extract = %v, want %v", mountPointExists, tt.keepsVolume)
			}
		})
	}
}

// mountFaultFS fails the one operation op names on the mount point /stage/mnt.
type mountFaultFS struct {
	fs.FS
	op string
}

func (m mountFaultFS) fault(op, path string) error {
	if m.op == op && path == "/stage/mnt" {
		return errVolumeFault
	}
	return nil
}

func (m mountFaultFS) Lstat(path string) (os.FileInfo, error) {
	if err := m.fault("lstat", path); err != nil {
		return nil, err
	}
	return m.FS.Lstat(path)
}

func (m mountFaultFS) MkdirAll(path string, perm os.FileMode) error {
	if err := m.fault("mkdir", path); err != nil {
		return err
	}
	return m.FS.MkdirAll(path, perm)
}

func (m mountFaultFS) ReadDir(path string) ([]string, error) {
	if err := m.fault("readdir", path); err != nil {
		return nil, err
	}
	return m.FS.ReadDir(path)
}

func (m mountFaultFS) Remove(path string) error {
	if err := m.fault("remove", path); err != nil {
		return err
	}
	return m.FS.Remove(path)
}

// TestMountDmgReportsEachFailure covers the file system and hdiutil failures MountDmg
// reports: each fails the mount, names the mount point, and carries its cause,
// including what hdiutil printed.
func TestMountDmgReportsEachFailure(t *testing.T) {
	const mountPoint = "/stage/mnt"
	errAttach := errors.New("exit status 1")
	tests := []struct {
		name string
		op   string
		// existing creates the mount point before MountDmg runs.
		existing bool
		// attachErr fails hdiutil attach, which prints attachOutput.
		attachErr    error
		attachOutput string
		want         []error
		wantText     string
	}{
		{name: "inspecting the mount point", op: "lstat", want: []error{errVolumeFault}},
		{name: "creating the mount point", op: "mkdir", want: []error{errVolumeFault}},
		{name: "listing an existing mount point", op: "readdir", existing: true, want: []error{errVolumeFault}},
		{
			name: "an attach that fails with a mount point that cannot be removed", op: "remove",
			attachErr: errAttach, want: []error{errAttach, errVolumeFault},
		},
		{
			name: "an attach that fails printing why", attachErr: errAttach,
			attachOutput: "hdiutil: attach failed - no mountable file systems\n",
			want:         []error{errAttach}, wantText: "no mountable file systems",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := newDmgStage(t)
			if tt.existing {
				if err := memFS.MkdirAll(mountPoint, 0o755); err != nil {
					t.Fatalf("MkdirAll: %v", err)
				}
			}
			runner := exec.NewMockRunner()
			archivetest.Hdiutil{
				FS:           memFS,
				Volume:       func(string) error { return tt.attachErr },
				AttachOutput: tt.attachOutput,
			}.Register(runner)

			detach, err := MountDmg(context.Background(), runner, mountFaultFS{FS: memFS, op: tt.op}, "/stage/app.dmg", mountPoint)
			if detach != nil {
				t.Errorf("MountDmg returned a detach function along with error %v", err)
			}
			if err == nil || !strings.Contains(err.Error(), mountPoint) || !strings.Contains(err.Error(), tt.wantText) {
				t.Fatalf("MountDmg = %v, want an error naming %s and %q", err, mountPoint, tt.wantText)
			}
			for _, want := range tt.want {
				if !errors.Is(err, want) {
					t.Errorf("MountDmg = %v, want it to wrap %v", err, want)
				}
			}
		})
	}
}

// newDmgStage returns a MemFS whose staging directory /stage holds the image app.dmg.
func newDmgStage(t *testing.T) fs.FS {
	t.Helper()
	memFS := fs.NewMemFS()
	if err := memFS.MkdirAll("/stage", 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := memFS.WriteFile("/stage/app.dmg", []byte("dmg"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	return memFS
}

// TestExtractDmgRefusesOccupiedMountPoint covers a mount point that is not an empty
// directory, such as one a previous image is still attached at: the image is never
// attached over it, and what it holds is left alone.
func TestExtractDmgRefusesOccupiedMountPoint(t *testing.T) {
	const (
		image      = "/stage/app.dmg"
		dest       = "/stage/out"
		mountPoint = "/stage/.out.dmg-mount"
	)
	tests := []struct {
		name   string
		occupy func(fsys fs.FS) error
		// left is the path that must still exist afterwards.
		left string
	}{
		{
			name: "a directory holding files",
			occupy: func(fsys fs.FS) error {
				if err := fsys.MkdirAll(mountPoint, 0o755); err != nil {
					return err
				}
				return fsys.WriteFile(mountPoint+"/Stale.app", []byte("stale"), 0o644)
			},
			left: mountPoint + "/Stale.app",
		},
		{
			name:   "a file",
			occupy: func(fsys fs.FS) error { return fsys.WriteFile(mountPoint, []byte("file"), 0o644) },
			left:   mountPoint,
		},
		{
			name:   "a symlink",
			occupy: func(fsys fs.FS) error { return fsys.Symlink("/elsewhere", mountPoint) },
			left:   mountPoint,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := newDmgStage(t)
			if err := tt.occupy(memFS); err != nil {
				t.Fatalf("occupying %s: %v", mountPoint, err)
			}
			runner := exec.NewMockRunner()
			archivetest.Hdiutil{FS: memFS}.Register(runner)

			err := NewExtractor(memFS, runner).Extract(context.Background(), image, dest)
			if err == nil || !strings.Contains(err.Error(), mountPoint) {
				t.Fatalf("Extract = %v, want an error naming %s", err, mountPoint)
			}
			if calls := archivetest.Calls(runner); len(calls) != 0 {
				t.Errorf("hdiutil calls = %q, want none", calls)
			}
			if _, err := memFS.Lstat(tt.left); err != nil {
				t.Errorf("Lstat(%s) = %v, want it left in place", tt.left, err)
			}
		})
	}
}

// TestExtractDmgAttachFailureRemovesMountPoint covers an image hdiutil cannot attach:
// the extraction fails and the empty mount point it created is removed.
func TestExtractDmgAttachFailureRemovesMountPoint(t *testing.T) {
	const mountPoint = "/stage/.out.dmg-mount"
	memFS := newDmgStage(t)
	runner := exec.NewMockRunner()
	archivetest.Hdiutil{FS: memFS, Volume: func(string) error { return errors.New("hdiutil: attach failed - image not recognized") }}.Register(runner)

	err := NewExtractor(memFS, runner).Extract(context.Background(), "/stage/app.dmg", "/stage/out")
	if err == nil || !strings.Contains(err.Error(), "image not recognized") {
		t.Fatalf("Extract = %v, want the attach failure", err)
	}
	if exists, _ := memFS.Exists(mountPoint); exists {
		t.Errorf("mount point %s left behind after a failed attach", mountPoint)
	}
}
