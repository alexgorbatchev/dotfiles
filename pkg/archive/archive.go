package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/bzip2"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// Extractor handles the extraction of various archive formats using either Go's standard library or system tools.
type Extractor struct {
	fsys   fs.FS
	runner exec.CommandRunner
}

// NewExtractor instantiates an Extractor with filesystem and external command runner.
func NewExtractor(fsys fs.FS, runner exec.CommandRunner) *Extractor {
	return &Extractor{
		fsys:   fsys,
		runner: runner,
	}
}

func (e *Extractor) SetFS(fsys fs.FS) {
	if e != nil {
		e.fsys = fsys
	}
}

// Extract detects format by filename extension and extracts src archive to dest directory.
func (e *Extractor) Extract(ctx context.Context, src string, dest string) error {
	lower := strings.ToLower(src)

	// Ensure destination directory exists before extracting
	if err := e.fsys.MkdirAll(dest, 0755); err != nil {
		return fmt.Errorf("creating destination directory: %w", err)
	}

	var err error
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") {
		err = e.extractTar(ctx, src, dest, "tar.gz")
	} else if strings.HasSuffix(lower, ".tar.bz2") || strings.HasSuffix(lower, ".tbz2") || strings.HasSuffix(lower, ".tbz") {
		err = e.extractTar(ctx, src, dest, "tar.bz2")
	} else if strings.HasSuffix(lower, ".tar.xz") || strings.HasSuffix(lower, ".txz") {
		err = e.extractTarXz(ctx, src, dest)
	} else if strings.HasSuffix(lower, ".zip") {
		err = e.extractZip(ctx, src, dest)
	} else if strings.HasSuffix(lower, ".dmg") {
		err = e.extractDmg(ctx, src, dest)
	} else if strings.HasSuffix(lower, ".pkg") {
		err = e.extractPkg(ctx, src, dest)
	} else if strings.HasSuffix(lower, ".gz") {
		err = e.extractSingleGz(ctx, src, dest)
	} else {
		return fmt.Errorf("unsupported or unrecognized archive format for %q", src)
	}

	if err != nil {
		return err
	}

	// Apply executable heuristics
	return e.detectAndSetExecutables(dest)
}

// extractZip extracts standard zip files using Go's archive/zip library with stream buffering and symlink support.
func (e *Extractor) extractZip(ctx context.Context, src string, dest string) error {
	// Open the file through e.fsys
	rc, err := e.fsys.Open(src)
	if err != nil {
		return fmt.Errorf("opening zip archive: %w", err)
	}
	defer rc.Close()

	// Since archive/zip needs a ReaderAt, and the file might be virtual (MemFS) or OSFS,
	// let's read the full data into memory if we must, or if it's an os.File, use it directly.
	// But to avoid OOM for large zip files, let's read as bytes only.
	// Note: zip.NewReader requires ReaderAt which we get by reading the bytes. Since zip files are randomly accessed,
	// we do read all of it for the zip index, but we stream the file contents individually!
	data, err := io.ReadAll(rc)
	if err != nil {
		return fmt.Errorf("reading zip archive bytes: %w", err)
	}

	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("parsing zip archive header: %w", err)
	}

	for _, f := range reader.File {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		cleanDest := filepath.Clean(dest)
		cleanTarget := filepath.Clean(filepath.Join(dest, f.Name))

		// Guard against zip slip vulnerability
		rel, err := filepath.Rel(cleanDest, cleanTarget)
		if err != nil || strings.HasPrefix(rel, "..") {
			continue
		}

		if f.FileInfo().IsDir() {
			if err := e.fsys.MkdirAll(cleanTarget, f.Mode()); err != nil {
				return fmt.Errorf("creating zip directory %q: %w", cleanTarget, err)
			}
			continue
		}

		if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
			return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
		}

		// Handle symlinks inside zip files
		if f.Mode()&os.ModeSymlink != 0 {
			entryRc, err := f.Open()
			if err != nil {
				return fmt.Errorf("opening zip symlink entry %q: %w", f.Name, err)
			}
			linkBytes, err := io.ReadAll(entryRc)
			entryRc.Close()
			if err != nil {
				return fmt.Errorf("reading zip symlink destination %q: %w", f.Name, err)
			}
			targetPath := string(linkBytes)
			_ = e.fsys.Remove(cleanTarget)
			if err := e.fsys.Symlink(targetPath, cleanTarget); err != nil {
				return fmt.Errorf("creating zip symlink from %q to %q: %w", targetPath, cleanTarget, err)
			}
			continue
		}

		// Regular file: stream using chunked copy
		destFile, err := e.fsys.Create(cleanTarget)
		if err != nil {
			return fmt.Errorf("creating extracted zip file %q: %w", cleanTarget, err)
		}

		entryRc, err := f.Open()
		if err != nil {
			destFile.Close()
			return fmt.Errorf("opening zip file entry %q: %w", f.Name, err)
		}

		_, copyErr := io.Copy(destFile, entryRc)
		entryRc.Close()
		destFile.Close()
		if copyErr != nil {
			return fmt.Errorf("writing zip entry data to %q: %w", cleanTarget, copyErr)
		}

		if err := e.fsys.Chmod(cleanTarget, f.Mode()); err != nil {
			return fmt.Errorf("setting zip file permissions on %q: %w", cleanTarget, err)
		}
	}

	return nil
}

// extractTar extracts .tar.gz and .tar.bz2 archives using archive/tar, native compression readers, and stream buffering.
func (e *Extractor) extractTar(ctx context.Context, src string, dest string, format string) error {
	rc, err := e.fsys.Open(src)
	if err != nil {
		return fmt.Errorf("opening tar archive: %w", err)
	}
	defer rc.Close()

	var decompressed io.Reader = rc
	if format == "tar.gz" {
		gz, err := gzip.NewReader(rc)
		if err != nil {
			return fmt.Errorf("initializing gzip reader: %w", err)
		}
		defer gz.Close()
		decompressed = gz
	} else if format == "tar.bz2" {
		decompressed = bzip2.NewReader(rc)
	}

	tarReader := tar.NewReader(decompressed)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("reading next tar entry: %w", err)
		}

		cleanDest := filepath.Clean(dest)
		cleanTarget := filepath.Clean(filepath.Join(dest, header.Name))

		// Guard against zip slip vulnerability
		rel, err := filepath.Rel(cleanDest, cleanTarget)
		if err != nil || strings.HasPrefix(rel, "..") {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := e.fsys.MkdirAll(cleanTarget, header.FileInfo().Mode()); err != nil {
				return fmt.Errorf("creating directory %q: %w", cleanTarget, err)
			}

		case tar.TypeReg:
			if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
			}

			destFile, err := e.fsys.Create(cleanTarget)
			if err != nil {
				return fmt.Errorf("creating extracted file %q: %w", cleanTarget, err)
			}
			if _, err := io.Copy(destFile, tarReader); err != nil {
				destFile.Close()
				return fmt.Errorf("writing tar entry data to %q: %w", cleanTarget, err)
			}
			destFile.Close()
			if err := e.fsys.Chmod(cleanTarget, header.FileInfo().Mode()); err != nil {
				return fmt.Errorf("setting permissions on %q: %w", cleanTarget, err)
			}

		case tar.TypeSymlink, tar.TypeLink:
			if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
			}
			_ = e.fsys.Remove(cleanTarget)
			if err := e.fsys.Symlink(header.Linkname, cleanTarget); err != nil {
				return fmt.Errorf("creating tar symlink from %q to %q: %w", header.Linkname, cleanTarget, err)
			}
		}
	}

	return nil
}

// extractTarXz extracts .tar.xz and .txz archives using system xz command as a lightweight stream decompressor.
func (e *Extractor) extractTarXz(ctx context.Context, src string, dest string) error {
	fileReader, err := e.fsys.Open(src)
	if err != nil {
		return fmt.Errorf("opening xz archive: %w", err)
	}
	defer fileReader.Close()

	pr, pw := io.Pipe()
	cmd := e.runner.CommandContext(ctx, "xz", "-d", "-c")
	cmd.SetStdin(fileReader)
	cmd.SetStdout(pw)

	var stderr bytes.Buffer
	cmd.SetStderr(&stderr)

	go func() {
		err := cmd.Run()
		if err != nil {
			pw.CloseWithError(fmt.Errorf("xz process error: %v, stderr: %s", err, stderr.String()))
		} else {
			pw.Close()
		}
	}()

	tarReader := tar.NewReader(pr)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("reading next xz tar entry: %w", err)
		}

		cleanDest := filepath.Clean(dest)
		cleanTarget := filepath.Clean(filepath.Join(dest, header.Name))

		// Guard against zip slip vulnerability
		rel, err := filepath.Rel(cleanDest, cleanTarget)
		if err != nil || strings.HasPrefix(rel, "..") {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := e.fsys.MkdirAll(cleanTarget, header.FileInfo().Mode()); err != nil {
				return fmt.Errorf("creating directory %q: %w", cleanTarget, err)
			}

		case tar.TypeReg:
			if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
			}

			destFile, err := e.fsys.Create(cleanTarget)
			if err != nil {
				return fmt.Errorf("creating extracted file %q: %w", cleanTarget, err)
			}
			if _, err := io.Copy(destFile, tarReader); err != nil {
				destFile.Close()
				return fmt.Errorf("writing xz tar entry data to %q: %w", cleanTarget, err)
			}
			destFile.Close()
			if err := e.fsys.Chmod(cleanTarget, header.FileInfo().Mode()); err != nil {
				return fmt.Errorf("setting permissions on %q: %w", cleanTarget, err)
			}

		case tar.TypeSymlink, tar.TypeLink:
			if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
			}
			_ = e.fsys.Remove(cleanTarget)
			if err := e.fsys.Symlink(header.Linkname, cleanTarget); err != nil {
				return fmt.Errorf("creating tar symlink from %q to %q: %w", header.Linkname, cleanTarget, err)
			}
		}
	}

	return nil
}

// extractSingleGz extracts single-file .gz structures natively.
func (e *Extractor) extractSingleGz(ctx context.Context, src string, dest string) error {
	rc, err := e.fsys.Open(src)
	if err != nil {
		return fmt.Errorf("opening gz archive: %w", err)
	}
	defer rc.Close()

	gz, err := gzip.NewReader(rc)
	if err != nil {
		return fmt.Errorf("initializing gzip reader: %w", err)
	}
	defer gz.Close()

	base := filepath.Base(src)
	outName := strings.TrimSuffix(base, ".gz")
	cleanTarget := filepath.Clean(filepath.Join(dest, outName))

	if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
		return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
	}

	destFile, err := e.fsys.Create(cleanTarget)
	if err != nil {
		return fmt.Errorf("creating extracted file %q: %w", cleanTarget, err)
	}

	if _, err := io.Copy(destFile, gz); err != nil {
		destFile.Close()
		return fmt.Errorf("writing decompressed gz stream to %q: %w", cleanTarget, err)
	}
	destFile.Close()

	return e.fsys.Chmod(cleanTarget, 0755)
}

// detectAndSetExecutables walks the dest directory and applies heuristics to find executables.
func (e *Extractor) detectAndSetExecutables(dest string) error {
	files, err := e.walkFiles(dest)
	if err != nil {
		return err
	}

	for _, path := range files {
		info, err := e.fsys.Lstat(path)
		if err != nil {
			continue
		}
		if info.IsDir() || (info.Mode()&os.ModeSymlink != 0) {
			continue
		}

		shouldBeExec := false
		ext := strings.ToLower(filepath.Ext(path))
		if ext == "" || ext == ".sh" || ext == ".py" || ext == ".pl" || ext == ".rb" {
			shouldBeExec = true
		} else {
			f, err := e.fsys.Open(path)
			if err == nil {
				buf := make([]byte, 4)
				n, _ := f.Read(buf)
				f.Close()
				if n >= 2 && string(buf[:2]) == "#!" {
					shouldBeExec = true
				} else if n >= 4 {
					if bytes.Equal(buf[:4], []byte{0x7f, 'E', 'L', 'F'}) {
						shouldBeExec = true
					} else if bytes.Equal(buf[:2], []byte{'M', 'Z'}) {
						shouldBeExec = true
					} else if bytes.Equal(buf[:4], []byte{0xfe, 0xed, 0xfa, 0xce}) ||
						bytes.Equal(buf[:4], []byte{0xfe, 0xed, 0xfa, 0xcf}) ||
						bytes.Equal(buf[:4], []byte{0xce, 0xfa, 0xed, 0xfe}) ||
						bytes.Equal(buf[:4], []byte{0xcf, 0xfa, 0xed, 0xfe}) {
						shouldBeExec = true
					}
				}
			}
		}

		if shouldBeExec {
			_ = e.fsys.Chmod(path, info.Mode()|0111)
		}
	}
	return nil
}

// walkFiles is a helper to recursively find all files in a directory using e.fsys.
func (e *Extractor) walkFiles(dir string) ([]string, error) {
	var files []string
	entries, err := e.fsys.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entryName := range entries {
		path := filepath.Join(dir, entryName)
		info, err := e.fsys.Lstat(path)
		if err != nil {
			continue
		}
		if info.IsDir() {
			subFiles, err := e.walkFiles(path)
			if err == nil {
				files = append(files, subFiles...)
			}
		} else {
			files = append(files, path)
		}
	}
	return files, nil
}

// extractDmg mounts a macOS DMG file and copies its contents to the destination folder using standard command tools.
func (e *Extractor) extractDmg(ctx context.Context, src string, dest string) error {
	mountPoint, err := os.MkdirTemp("", "dotfiles-dmg-mount-*")
	if err != nil {
		return fmt.Errorf("creating temporary mount point: %w", err)
	}

	attachCmd := e.runner.CommandContext(ctx, "hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, src)
	err = attachCmd.Run()
	if err != nil {
		_ = os.RemoveAll(mountPoint)
		return fmt.Errorf("hdiutil attach failed: %w", err)
	}

	defer func() {
		detachCmd := e.runner.CommandContext(context.Background(), "hdiutil", "detach", mountPoint)
		_ = detachCmd.Run()
		_ = os.RemoveAll(mountPoint)
	}()

	if err := e.copyDir(mountPoint, dest); err != nil {
		return fmt.Errorf("copying DMG files: %w", err)
	}

	return nil
}

// extractPkg expands a macOS PKG installer package to destination using standard system utilities.
func (e *Extractor) extractPkg(ctx context.Context, src string, dest string) error {
	expandCmd := e.runner.CommandContext(ctx, "pkgutil", "--expand-full", src, dest)
	err := expandCmd.Run()
	if err != nil {
		return fmt.Errorf("pkgutil expand failed: %w", err)
	}
	return nil
}

// copyDir recursively copies files from a source directory (on e.fsys) to a destination directory (on e.fsys).
func (e *Extractor) copyDir(srcDir, destDir string) error {
	return walkFS(e.fsys, srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(destDir, rel)
		if info.IsDir() {
			return e.fsys.MkdirAll(destPath, info.Mode())
		}

		err = func() error {
			srcFile, err := e.fsys.Open(path)
			if err != nil {
				return err
			}
			defer srcFile.Close()

			destFile, err := e.fsys.Create(destPath)
			if err != nil {
				return err
			}
			defer destFile.Close()

			if _, err := io.Copy(destFile, srcFile); err != nil {
				return err
			}
			return nil
		}()
		if err != nil {
			return err
		}

		return nil
	})
}

func walkFS(fsys fs.FS, path string, walkFn func(path string, info os.FileInfo, err error) error) error {
	info, err := fsys.Lstat(path)
	if err != nil {
		return walkFn(path, nil, err)
	}

	err = walkFn(path, info, nil)
	if err != nil {
		if info.IsDir() && err == filepath.SkipDir {
			return nil
		}
		return err
	}

	if !info.IsDir() {
		return nil
	}

	entries, err := fsys.ReadDir(path)
	if err != nil {
		return walkFn(path, info, err)
	}

	for _, entry := range entries {
		subPath := filepath.Join(path, entry)
		err = walkFS(fsys, subPath, walkFn)
		if err != nil {
			return err
		}
	}

	return nil
}
