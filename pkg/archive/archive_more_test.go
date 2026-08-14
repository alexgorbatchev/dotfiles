package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestExtractorSetFS(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(nil, runner)

	ext.SetFS(memFS)
	if ext.fsys != memFS {
		t.Errorf("SetFS failed to update fsys")
	}

	var nilExt *Extractor
	nilExt.SetFS(memFS)
}

func TestExtractTarXzSuccess(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)

	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeDir,
		Name:     "sub_xz_dir/",
		Mode:     0755,
	})
	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeReg,
		Name:     "sub_xz_dir/file_xz.txt",
		Mode:     0644,
		Size:     14,
	})
	_, _ = tw.Write([]byte("xz tar content"))

	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeSymlink,
		Name:     "sub_xz_dir/link_xz.txt",
		Linkname: "file_xz.txt",
		Mode:     0777,
	})
	_ = tw.Close()

	tarBytes := buf.Bytes()

	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout != nil {
			_, err := stdout.Write(tarBytes)
			return err
		}
		return nil
	})

	_ = memFS.WriteFile("/archive.tar.xz", []byte("xz data"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/archive.tar.xz", "/dest-xz")
	if err != nil {
		t.Fatalf("extract tar.xz failed: %v", err)
	}

	data, err := memFS.ReadFile("/dest-xz/sub_xz_dir/file_xz.txt")
	if err != nil {
		t.Fatalf("file_xz.txt not found: %v", err)
	}
	if string(data) != "xz tar content" {
		t.Errorf("expected 'xz tar content', got %q", string(data))
	}

	linkTarget, err := memFS.Readlink("/dest-xz/sub_xz_dir/link_xz.txt")
	if err != nil || linkTarget != "file_xz.txt" {
		t.Errorf("expected link target 'file_xz.txt', got %q, err=%v", linkTarget, err)
	}
}

func TestExtractTarXzRunnerError(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		return fmt.Errorf("xz command failed")
	})

	_ = memFS.WriteFile("/archive.tar.xz", []byte("xz data"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/archive.tar.xz", "/dest-xz-err")
	if err == nil {
		t.Fatal("expected error on xz command failure, got nil")
	}
}

func TestExtractSingleGzErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	_ = memFS.WriteFile("/invalid.gz", []byte("not-gzip-data"), 0644)
	err := ext.Extract(context.Background(), "/invalid.gz", "/dest")
	if err == nil {
		t.Fatal("expected error extracting invalid gzip file")
	}
}

func TestExtractPkgError(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	runner.RegisterFunc("pkgutil", func(c *exec.MockCmd) error {
		return fmt.Errorf("pkgutil failed")
	})

	_ = memFS.WriteFile("/test.pkg", []byte("pkg bytes"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/test.pkg", "/dest-pkg-err")
	if err == nil {
		t.Fatal("expected error on pkgutil failure, got nil")
	}
}

func TestExtractDmgErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	runner.RegisterFunc("hdiutil", func(c *exec.MockCmd) error {
		if len(c.Args) > 0 && c.Args[0] == "attach" {
			return fmt.Errorf("hdiutil attach failed")
		}
		return nil
	})

	_ = memFS.WriteFile("/test.dmg", []byte("dmg bytes"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/test.dmg", "/dest-dmg-err")
	if err == nil {
		t.Fatal("expected error on hdiutil attach failure, got nil")
	}
}

func TestCopyDirAndWalkFS(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	_ = memFS.MkdirAll("/src/dir1/dir2", 0755)
	_ = memFS.WriteFile("/src/file1.txt", []byte("f1"), 0644)
	_ = memFS.WriteFile("/src/dir1/file2.txt", []byte("f2"), 0644)

	err := ext.copyDir("/src", "/dest-copy")
	if err != nil {
		t.Fatalf("copyDir failed: %v", err)
	}

	data1, err := memFS.ReadFile("/dest-copy/file1.txt")
	if err != nil || string(data1) != "f1" {
		t.Errorf("expected 'f1', got %q, err=%v", string(data1), err)
	}

	data2, err := memFS.ReadFile("/dest-copy/dir1/file2.txt")
	if err != nil || string(data2) != "f2" {
		t.Errorf("expected 'f2', got %q, err=%v", string(data2), err)
	}
}

func TestExtractDmgAppBundle(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	runner.RegisterFunc("hdiutil", func(c *exec.MockCmd) error {
		if len(c.Args) > 4 && c.Args[0] == "attach" {
			mountPoint := c.Args[4]
			_ = memFS.MkdirAll(filepath.Join(mountPoint, "TestApp.app", "Contents"), 0755)
			_ = memFS.WriteFile(filepath.Join(mountPoint, "TestApp.app", "Contents", "Info.plist"), []byte("plist"), 0644)
			return nil
		}
		return nil
	})

	_ = memFS.WriteFile("/app.dmg", []byte("dmg"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/app.dmg", "/dest-app")
	if err != nil {
		t.Fatalf("extract app.dmg failed: %v", err)
	}

	data, err := memFS.ReadFile("/dest-app/TestApp.app/Contents/Info.plist")
	if err != nil || string(data) != "plist" {
		t.Errorf("expected 'plist', got %q, err=%v", string(data), err)
	}
}

func TestWalkFSSkipDir(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/src/skipped/sub", 0755)
	_ = memFS.WriteFile("/src/file.txt", []byte("a"), 0644)
	_ = memFS.WriteFile("/src/skipped/sub/file2.txt", []byte("b"), 0644)

	var visited []string
	err := walkFS(memFS, "/src", func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() && filepath.Base(path) == "skipped" {
			return filepath.SkipDir
		}
		visited = append(visited, path)
		return nil
	})
	if err != nil {
		t.Fatalf("walkFS failed: %v", err)
	}

	for _, v := range visited {
		if strings.Contains(v, "skipped/sub") {
			t.Errorf("expected skipped directory contents not to be visited, got %q", v)
		}
	}
}

func TestDetectAndSetExecutablesMachO(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	_ = memFS.MkdirAll("/dest-macho", 0755)

	_ = memFS.WriteFile("/dest-macho/app.exe", []byte{'M', 'Z', 0, 0}, 0644)
	_ = memFS.WriteFile("/dest-macho/script.sh", []byte("echo sh"), 0644)
	_ = memFS.WriteFile("/dest-macho/script.py", []byte("print('py')"), 0644)
	_ = memFS.WriteFile("/dest-macho/script.pl", []byte("print 'pl'"), 0644)
	_ = memFS.WriteFile("/dest-macho/script.rb", []byte("puts 'rb'"), 0644)
	_ = memFS.WriteFile("/dest-macho/app_bin", []byte{0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0}, 0644)
	_ = memFS.WriteFile("/dest-macho/app_bin_32", []byte{0xce, 0xfa, 0xed, 0xfe, 0, 0, 0, 0}, 0644)

	err := ext.detectAndSetExecutables("/dest-macho")
	if err != nil {
		t.Fatalf("detectAndSetExecutables failed: %v", err)
	}

	info1, _ := memFS.Stat("/dest-macho/app_bin")
	if info1.Mode()&0111 == 0 {
		t.Error("expected 64-bit Mach-O binary to have executable mode set")
	}
}

func TestExtractZipOSFSAndDir(t *testing.T) {
	tmpDir := t.TempDir()
	osFS := fs.NewOSFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(osFS, runner)

	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	hdrDir := &zip.FileHeader{Name: "mydir/"}
	hdrDir.SetMode(os.ModeDir | 0755)
	_, _ = w.CreateHeader(hdrDir)

	hdrFile := &zip.FileHeader{Name: "mydir/file1.txt"}
	hdrFile.SetMode(0644)
	f, _ := w.CreateHeader(hdrFile)
	_, _ = f.Write([]byte("content1"))

	_ = w.Close()

	zipPath := filepath.Join(tmpDir, "test_osfs.zip")
	_ = os.WriteFile(zipPath, buf.Bytes(), 0644)

	destDir := filepath.Join(tmpDir, "dest_osfs")
	err := ext.Extract(context.Background(), zipPath, destDir)
	if err != nil {
		t.Fatalf("OSFS zip extract failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(destDir, "mydir", "file1.txt"))
	if err != nil || string(data) != "content1" {
		t.Errorf("expected 'content1', got %q, err=%v", string(data), err)
	}
}

func TestExtractTarDirAndGzError(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeDir,
		Name:     "sub_dir/",
		Mode:     0755,
	})
	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeReg,
		Name:     "sub_dir/file.txt",
		Mode:     0644,
		Size:     4,
	})
	_, _ = tw.Write([]byte("data"))
	_ = tw.Close()

	_ = memFS.WriteFile("/test.tar", buf.Bytes(), 0644)
	err := ext.Extract(context.Background(), "/test.tar", "/dest-tar-dir")
	if err != nil {
		t.Fatalf("tar with dir extract failed: %v", err)
	}

	_ = memFS.WriteFile("/invalid.tar.gz", []byte("invalid gzip"), 0644)
	err = ext.Extract(context.Background(), "/invalid.tar.gz", "/dest-inv-gz")
	if err == nil {
		t.Fatal("expected error extracting invalid tar.gz")
	}
}

func TestExtractorNonExistentArchives(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)
	ctx := context.Background()

	if err := ext.Extract(ctx, "/missing.zip", "/dest"); err == nil {
		t.Error("expected error for missing .zip archive")
	}

	if err := ext.Extract(ctx, "/missing.tar", "/dest"); err == nil {
		t.Error("expected error for missing .tar archive")
	}

	if err := ext.Extract(ctx, "/missing.tar.gz", "/dest"); err == nil {
		t.Error("expected error for missing .tar.gz archive")
	}

	if err := ext.Extract(ctx, "/missing.gz", "/dest"); err == nil {
		t.Error("expected error for missing .gz archive")
	}

	if err := ext.Extract(ctx, "/missing.tar.xz", "/dest"); err == nil {
		t.Error("expected error for missing .tar.xz archive")
	}

	if err := ext.Extract(ctx, "/missing.dmg", "/dest"); err == nil {
		t.Error("expected error for missing .dmg archive")
	}

	if err := ext.Extract(ctx, "/missing.pkg", "/dest"); err == nil {
		t.Error("expected error for missing .pkg archive")
	}
}

func TestExtractSingleGzZipSlip(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write([]byte("evil"))
	_ = gw.Close()

	_ = memFS.WriteFile("/.gz", buf.Bytes(), 0644)

	err := ext.Extract(context.Background(), "/.gz", "/dest")
	if err == nil {
		t.Error("expected error for empty outName in single gz file")
	}
}

func TestZipSymlinkTraversalValidation(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	hdr := &zip.FileHeader{Name: "bad_link.txt"}
	hdr.CreatorVersion = 3 << 8
	hdr.SetMode(os.ModeSymlink | 0777)
	f, _ := w.CreateHeader(hdr)
	_, _ = f.Write([]byte("../../../etc/passwd"))
	_ = w.Close()

	_ = memFS.WriteFile("/bad_symlink.zip", buf.Bytes(), 0644)
	err := ext.Extract(context.Background(), "/bad_symlink.zip", "/dest")
	if err == nil || !errors.Is(err, ErrSymlinkTraversalDetected) {
		t.Fatalf("expected ErrSymlinkTraversalDetected, got %v", err)
	}
}

type errorFS struct {
	fs.FS
	errOnCreate    bool
	errOnMkdirAll  bool
	errOnWriteFile bool
	errOnChmod     bool
	errOnSymlink   bool
}

func (e *errorFS) Create(path string) (io.WriteCloser, error) {
	if e.errOnCreate {
		return nil, fmt.Errorf("mock create error")
	}
	return e.FS.Create(path)
}

func (e *errorFS) MkdirAll(path string, perm os.FileMode) error {
	if e.errOnMkdirAll {
		return fmt.Errorf("mock mkdirall error")
	}
	return e.FS.MkdirAll(path, perm)
}

func (e *errorFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	if e.errOnWriteFile {
		return fmt.Errorf("mock writefile error")
	}
	return e.FS.WriteFile(path, data, perm)
}

func (e *errorFS) Chmod(path string, perm os.FileMode) error {
	if e.errOnChmod {
		return fmt.Errorf("mock chmod error")
	}
	return e.FS.Chmod(path, perm)
}

func (e *errorFS) Symlink(oldname, newname string) error {
	if e.errOnSymlink {
		return fmt.Errorf("mock symlink error")
	}
	return e.FS.Symlink(oldname, newname)
}

func TestExtractorFSErrors(t *testing.T) {
	runner := exec.NewMockRunner()
	ctx := context.Background()

	mem1 := fs.NewMemFS()
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write([]byte("content"))
	_ = gw.Close()
	_ = mem1.WriteFile("/test.gz", buf.Bytes(), 0644)

	errFSCreate := &errorFS{FS: mem1, errOnCreate: true}
	extCreate := NewExtractor(errFSCreate, runner)
	if err := extCreate.Extract(ctx, "/test.gz", "/dest"); err == nil {
		t.Error("expected error on gz Create failure")
	}

	errFSChmod := &errorFS{FS: mem1, errOnChmod: true}
	extChmod := NewExtractor(errFSChmod, runner)
	if err := extChmod.Extract(ctx, "/test.gz", "/dest"); err == nil {
		t.Error("expected error on gz Chmod failure")
	}

	mem2 := fs.NewMemFS()
	zipBytes, _ := createZipBytes(map[string]string{"sub/file.txt": "data", "dir/": ""})
	_ = mem2.WriteFile("/test.zip", zipBytes, 0644)

	errZipMkdir := &errorFS{FS: mem2, errOnMkdirAll: true}
	extZipMkdir := NewExtractor(errZipMkdir, runner)
	if err := extZipMkdir.Extract(ctx, "/test.zip", "/dest"); err == nil {
		t.Error("expected error on zip MkdirAll failure")
	}

	errZipCreate := &errorFS{FS: mem2, errOnCreate: true}
	extZipCreate := NewExtractor(errZipCreate, runner)
	if err := extZipCreate.Extract(ctx, "/test.zip", "/dest"); err == nil {
		t.Error("expected error on zip Create failure")
	}

	errZipChmod := &errorFS{FS: mem2, errOnChmod: true}
	extZipChmod := NewExtractor(errZipChmod, runner)
	if err := extZipChmod.Extract(ctx, "/test.zip", "/dest"); err == nil {
		t.Error("expected error on zip Chmod failure")
	}

	mem3 := fs.NewMemFS()
	tarBytes, _ := createTarBytes(map[string]string{"sub/file.txt": "data"})
	_ = mem3.WriteFile("/test.tar", tarBytes, 0644)

	errTarCreate := &errorFS{FS: mem3, errOnCreate: true}
	extTarCreate := NewExtractor(errTarCreate, runner)
	if err := extTarCreate.Extract(ctx, "/test.tar", "/dest"); err == nil {
		t.Error("expected error on tar Create failure")
	}

	errTarMkdir := &errorFS{FS: mem3, errOnMkdirAll: true}
	extTarMkdir := NewExtractor(errTarMkdir, runner)
	if err := extTarMkdir.Extract(ctx, "/test.tar", "/dest"); err == nil {
		t.Error("expected error on tar MkdirAll failure")
	}

	errTarChmod := &errorFS{FS: mem3, errOnChmod: true}
	extTarChmod := NewExtractor(errTarChmod, runner)
	if err := extTarChmod.Extract(ctx, "/test.tar", "/dest"); err == nil {
		t.Error("expected error on tar Chmod failure")
	}

	mem4 := fs.NewMemFS()
	_ = mem4.WriteFile("/test.tar.xz", []byte("xz data"), 0644)

	runnerXz := exec.NewMockRunner()
	runnerXz.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout != nil {
			_, err := stdout.Write(tarBytes)
			return err
		}
		return nil
	})

	errTarXzMkdir := &errorFS{FS: mem4, errOnMkdirAll: true}
	extTarXzMkdir := NewExtractor(errTarXzMkdir, runnerXz)
	if err := extTarXzMkdir.Extract(ctx, "/test.tar.xz", "/dest"); err == nil {
		t.Error("expected error on tar.xz MkdirAll failure")
	}

	errTarXzCreate := &errorFS{FS: mem4, errOnCreate: true}
	extTarXzCreate := NewExtractor(errTarXzCreate, runnerXz)
	if err := extTarXzCreate.Extract(ctx, "/test.tar.xz", "/dest"); err == nil {
		t.Error("expected error on tar.xz Create failure")
	}

	mem5 := fs.NewMemFS()
	var bufTarSym bytes.Buffer
	twSym := tar.NewWriter(&bufTarSym)
	_ = twSym.WriteHeader(&tar.Header{
		Typeflag: tar.TypeSymlink,
		Name:     "link.txt",
		Linkname: "target.txt",
		Mode:     0777,
	})
	_ = twSym.Close()

	_ = mem5.WriteFile("/test_sym.tar", bufTarSym.Bytes(), 0644)
	errTarSym := &errorFS{FS: mem5, errOnSymlink: true}
	extTarSym := NewExtractor(errTarSym, runner)
	if err := extTarSym.Extract(ctx, "/test_sym.tar", "/dest"); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected error on tar Symlink failure, got %v", err)
	}

	mem6 := fs.NewMemFS()
	var bufZipSym bytes.Buffer
	wZipSym := zip.NewWriter(&bufZipSym)
	hdrZipSym := &zip.FileHeader{Name: "link_zip.txt"}
	hdrZipSym.SetMode(os.ModeSymlink | 0777)
	fZipSym, _ := wZipSym.CreateHeader(hdrZipSym)
	_, _ = fZipSym.Write([]byte("target.txt"))
	_ = wZipSym.Close()

	_ = mem6.WriteFile("/test_sym.zip", bufZipSym.Bytes(), 0644)
	errZipSym := &errorFS{FS: mem6, errOnSymlink: true}
	extZipSym := NewExtractor(errZipSym, runner)
	if err := extZipSym.Extract(ctx, "/test_sym.zip", "/dest"); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected error on zip Symlink failure, got %v", err)
	}

	mem7 := fs.NewMemFS()
	var bufTarXzSym bytes.Buffer
	twXzSym := tar.NewWriter(&bufTarXzSym)
	_ = twXzSym.WriteHeader(&tar.Header{
		Typeflag: tar.TypeSymlink,
		Name:     "link_xz.txt",
		Linkname: "target.txt",
		Mode:     0777,
	})
	_ = twXzSym.Close()

	runnerXzSym := exec.NewMockRunner()
	runnerXzSym.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout != nil {
			_, err := stdout.Write(bufTarXzSym.Bytes())
			return err
		}
		return nil
	})

	_ = mem7.WriteFile("/test_sym.tar.xz", []byte("xz data"), 0644)
	errTarXzSym := &errorFS{FS: mem7, errOnSymlink: true}
	extTarXzSym := NewExtractor(errTarXzSym, runnerXzSym)
	if err := extTarXzSym.Extract(ctx, "/test_sym.tar.xz", "/dest"); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected error on tar.xz Symlink failure, got %v", err)
	}
}

func TestExtractTarXzSymlinkTraversalAndChmodErr(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeSymlink,
		Name:     "bad_xz_link.txt",
		Linkname: "/tmp/escaped_xz",
		Mode:     0777,
	})
	_ = tw.Close()

	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout != nil {
			_, err := stdout.Write(buf.Bytes())
			return err
		}
		return nil
	})

	_ = memFS.WriteFile("/bad_xz.tar.xz", []byte("xz data"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/bad_xz.tar.xz", "/dest")
	if err == nil || !errors.Is(err, ErrSymlinkTraversalDetected) {
		t.Fatalf("expected ErrSymlinkTraversalDetected for tar.xz, got %v", err)
	}

	memFS2 := fs.NewMemFS()
	var buf2 bytes.Buffer
	tw2 := tar.NewWriter(&buf2)
	_ = tw2.WriteHeader(&tar.Header{
		Typeflag: tar.TypeReg,
		Name:     "file.txt",
		Mode:     0644,
		Size:     4,
	})
	_, _ = tw2.Write([]byte("data"))
	_ = tw2.Close()

	runner2 := exec.NewMockRunner()
	runner2.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout != nil {
			_, err := stdout.Write(buf2.Bytes())
			return err
		}
		return nil
	})

	_ = memFS2.WriteFile("/chmod_xz.tar.xz", []byte("xz data"), 0644)
	errFS := &errorFS{FS: memFS2, errOnChmod: true}
	extChmod := NewExtractor(errFS, runner2)

	err = extChmod.Extract(context.Background(), "/chmod_xz.tar.xz", "/dest")
	if err == nil || !strings.Contains(err.Error(), "setting permissions") {
		t.Fatalf("expected setting permissions error for tar.xz, got %v", err)
	}
}

type dummyReadCloser struct {
	io.Reader
}

func (dummyReadCloser) Close() error { return nil }

type nonReaderAtFS struct {
	fs.FS
	zipBytes []byte
}

func (n nonReaderAtFS) Open(path string) (io.ReadCloser, error) {
	if path == "/non_readerat.zip" {
		return dummyReadCloser{Reader: bytes.NewReader(n.zipBytes)}, nil
	}
	return n.FS.Open(path)
}

func TestExtractZipNonReaderAt(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	zipBytes, _ := createZipBytes(map[string]string{"non_ra.txt": "data"})
	_ = memFS.WriteFile("/non_readerat.zip", zipBytes, 0644)

	nFS := nonReaderAtFS{FS: memFS, zipBytes: zipBytes}
	ext := NewExtractor(nFS, runner)

	err := ext.Extract(context.Background(), "/non_readerat.zip", "/dest-non-ra")
	if err != nil {
		t.Fatalf("extract zip with non-ReaderAt reader failed: %v", err)
	}

	data, err := memFS.ReadFile("/dest-non-ra/non_ra.txt")
	if err != nil || string(data) != "data" {
		t.Errorf("expected 'data', got %q, err=%v", string(data), err)
	}
}

func TestExtractTarBz2Invalid(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	_ = memFS.WriteFile("/invalid.tar.bz2", []byte("invalid bzip2 content"), 0644)
	err := ext.Extract(context.Background(), "/invalid.tar.bz2", "/dest")
	if err == nil || !strings.Contains(err.Error(), "reading next tar entry") {
		t.Fatalf("expected reading next tar entry error for invalid tar.bz2, got %v", err)
	}
}

func TestCopyDirAndWalkFSErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	err := ext.copyDir("/nonexistent_src", "/dest")
	if err == nil {
		t.Error("expected error for non-existent srcDir in copyDir")
	}

	_ = memFS.MkdirAll("/src_err", 0755)
	_ = memFS.WriteFile("/src_err/file.txt", []byte("data"), 0644)

	errFS := &errorFS{FS: memFS, errOnCreate: true}
	extErr := NewExtractor(errFS, runner)
	err = extErr.copyDir("/src_err", "/dest_err")
	if err == nil {
		t.Error("expected create error in copyDir")
	}
}

type failingWriter struct{}

func (failingWriter) Write(p []byte) (int, error) {
	return 0, fmt.Errorf("disk write failure")
}

func (failingWriter) Close() error { return nil }

type failingWriteFS struct {
	fs.FS
}

func (f failingWriteFS) Create(path string) (io.WriteCloser, error) {
	return failingWriter{}, nil
}

func TestExtractorTarWriteError(t *testing.T) {
	runner := exec.NewMockRunner()
	ctx := context.Background()

	memTarCopy := fs.NewMemFS()
	tarBytesCopy, _ := createTarBytes(map[string]string{"file.txt": "data"})
	_ = memTarCopy.WriteFile("/test.tar", tarBytesCopy, 0644)
	fwTarFS := failingWriteFS{FS: memTarCopy}
	extTarCopy := NewExtractor(fwTarFS, runner)

	err := extTarCopy.Extract(ctx, "/test.tar", "/dest")
	if err == nil || !strings.Contains(err.Error(), "writing tar entry data") {
		t.Fatalf("expected error on tar write failure, got %v", err)
	}
}

type errorFSWithOpenErr struct {
	fs.FS
}

func (e *errorFSWithOpenErr) Open(path string) (io.ReadCloser, error) {
	if filepath.Base(path) == "file.txt" {
		return nil, fmt.Errorf("mock open error")
	}
	return e.FS.Open(path)
}

func TestArchiveTruncatedAndReadErrors(t *testing.T) {
	runner := exec.NewMockRunner()
	ctx := context.Background()

	memGz := fs.NewMemFS()
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write([]byte("header-data"))
	_ = memGz.WriteFile("/truncated.gz", buf.Bytes(), 0644)

	extGz := NewExtractor(memGz, runner)
	if err := extGz.Extract(ctx, "/truncated.gz", "/dest"); err == nil {
		t.Error("expected error extracting truncated gz file")
	}

	memTar := fs.NewMemFS()
	_ = memTar.WriteFile("/truncated.tar", []byte("invalid tar header truncated bytes"), 0644)

	extTar := NewExtractor(memTar, runner)
	if err := extTar.Extract(ctx, "/truncated.tar", "/dest"); err == nil {
		t.Error("expected error extracting truncated tar file")
	}

	memCopy := fs.NewMemFS()
	_ = memCopy.MkdirAll("/src_open", 0755)
	_ = memCopy.WriteFile("/src_open/file.txt", []byte("data"), 0644)

	openErrFS := &errorFSWithOpenErr{FS: memCopy}
	extCopyOpen := NewExtractor(openErrFS, runner)
	if err := extCopyOpen.copyDir("/src_open", "/dest_open"); err == nil {
		t.Error("expected open error in copyDir")
	}
}

func TestDetectAndSetExecutablesMagicBytes(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ext := NewExtractor(memFS, runner)

	dir := "/magic_test"
	_ = memFS.MkdirAll(dir, 0755)

	_ = memFS.WriteFile(filepath.Join(dir, "shebang.bin"), []byte("#!/bin/sh\necho hi"), 0644)
	_ = memFS.WriteFile(filepath.Join(dir, "elf.bin"), []byte{0x7f, 'E', 'L', 'F', 0}, 0644)
	_ = memFS.WriteFile(filepath.Join(dir, "macho32.bin"), []byte{0xfe, 0xed, 0xfa, 0xce}, 0644)
	_ = memFS.WriteFile(filepath.Join(dir, "macho64.bin"), []byte{0xfe, 0xed, 0xfa, 0xcf}, 0644)
	_ = memFS.WriteFile(filepath.Join(dir, "plain.txt"), []byte("plain text content"), 0644)

	err := ext.detectAndSetExecutables(dir)
	if err != nil {
		t.Fatalf("detectAndSetExecutables failed: %v", err)
	}

	for _, name := range []string{"shebang.bin", "elf.bin", "macho32.bin", "macho64.bin"} {
		info, _ := memFS.Stat(filepath.Join(dir, name))
		if info.Mode()&0111 == 0 {
			t.Errorf("expected %s to have executable bit set", name)
		}
	}

	infoPlain, _ := memFS.Stat(filepath.Join(dir, "plain.txt"))
	if infoPlain.Mode()&0111 != 0 {
		t.Errorf("expected plain.txt NOT to have executable bit set")
	}

	// walkFiles error on missing directory
	_, err = ext.walkFiles("/nonexistent_dir_12345")
	if err == nil {
		t.Error("expected error from walkFiles on non-existent directory")
	}
}

func TestExtractDmg7zError(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	runner.RegisterFunc("7z", func(c *exec.MockCmd) error {
		return fmt.Errorf("7z extract failed")
	})

	_ = memFS.WriteFile("/archive.dmg", []byte("dmg"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.extractDmg(context.Background(), "/archive.dmg", "/dest")
	if err == nil {
		t.Error("expected error when 7z fails on extractDmg")
	}
}

func TestExtractZipDirectory(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	hdr := &zip.FileHeader{Name: "dir1/dir2/"}
	hdr.SetMode(os.ModeDir | 0755)
	_, _ = w.CreateHeader(hdr)
	_ = w.Close()

	_ = memFS.WriteFile("/dir.zip", buf.Bytes(), 0644)
	ext := NewExtractor(memFS, runner)

	err := ext.Extract(context.Background(), "/dir.zip", "/dest-zip-dir")
	if err != nil {
		t.Fatalf("extract zip with dir failed: %v", err)
	}

	var buf2 bytes.Buffer
	w2 := zip.NewWriter(&buf2)
	f, _ := w2.Create("standalone.txt")
	_, _ = f.Write([]byte("standalone"))
	_ = w2.Close()

	_ = memFS.WriteFile("/standalone.zip", buf2.Bytes(), 0644)
	err = ext.Extract(context.Background(), "/standalone.zip", "/dest-standalone")
	if err != nil {
		t.Fatalf("extract standalone zip failed: %v", err)
	}
}

func TestExtractTarXzZipSlip(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	_ = tw.WriteHeader(&tar.Header{
		Typeflag: tar.TypeReg,
		Name:     "../../evil.txt",
		Mode:     0644,
		Size:     4,
	})
	_, _ = tw.Write([]byte("evil"))
	_ = tw.Close()

	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		stdout := c.Stdout()
		if stdout != nil {
			_, err := stdout.Write(buf.Bytes())
			return err
		}
		return nil
	})

	_ = memFS.WriteFile("/evil.tar.xz", []byte("xz data"), 0644)

	ext := NewExtractor(memFS, runner)
	err := ext.Extract(context.Background(), "/evil.tar.xz", "/dest")
	if err == nil || !errors.Is(err, ErrZipSlipDetected) {
		t.Fatalf("expected ErrZipSlipDetected for tar.xz, got %v", err)
	}
}
