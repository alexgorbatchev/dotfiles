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

// Extract detects format by filename extension and extracts src archive to dest directory.
func (e *Extractor) Extract(ctx context.Context, src string, dest string) error {
	lower := strings.ToLower(src)

	// Ensure destination directory exists before extracting
	if err := e.fsys.MkdirAll(dest, 0755); err != nil {
		return fmt.Errorf("creating destination directory: %w", err)
	}

	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") {
		return e.extractTar(ctx, src, dest, "tar.gz")
	}
	if strings.HasSuffix(lower, ".tar.bz2") || strings.HasSuffix(lower, ".tbz2") || strings.HasSuffix(lower, ".tbz") {
		return e.extractTar(ctx, src, dest, "tar.bz2")
	}
	if strings.HasSuffix(lower, ".zip") {
		return e.extractZip(ctx, src, dest)
	}
	if strings.HasSuffix(lower, ".dmg") {
		return e.extractDmg(ctx, src, dest)
	}
	if strings.HasSuffix(lower, ".pkg") {
		return e.extractPkg(ctx, src, dest)
	}

	return fmt.Errorf("unsupported or unrecognized archive format for %q", src)
}

// extractZip extracts standard zip files using Go's archive/zip library.
func (e *Extractor) extractZip(ctx context.Context, src string, dest string) error {
	data, err := e.fsys.ReadFile(src)
	if err != nil {
		return fmt.Errorf("reading zip archive: %w", err)
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

		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("opening zip file entry %q: %w", f.Name, err)
		}

		entryBytes, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return fmt.Errorf("reading zip file entry %q: %w", f.Name, err)
		}

		if err := e.fsys.WriteFile(cleanTarget, entryBytes, f.Mode()); err != nil {
			return fmt.Errorf("writing extracted file %q: %w", cleanTarget, err)
		}
	}

	return nil
}

// extractTar extracts .tar.gz and .tar.bz2 archives using archive/tar and native compression readers.
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

			entryBytes, err := io.ReadAll(tarReader)
			if err != nil {
				return fmt.Errorf("reading tar entry data: %w", err)
			}

			if err := e.fsys.WriteFile(cleanTarget, entryBytes, header.FileInfo().Mode()); err != nil {
				return fmt.Errorf("writing extracted file %q: %w", cleanTarget, err)
			}
		}
	}

	return nil
}

// extractDmg mounts a macOS DMG file and copies its contents to the destination folder using standard command tools.
func (e *Extractor) extractDmg(ctx context.Context, src string, dest string) error {
	mountPoint, err := os.MkdirTemp("", "dotfiles-dmg-mount-*")
	if err != nil {
		return fmt.Errorf("creating temporary mount point: %w", err)
	}

	// Mount the DMG silently in macos
	attachCmd := e.runner.CommandContext(ctx, "hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, src)
	err = attachCmd.Run()
	if err != nil {
		_ = os.RemoveAll(mountPoint)
		return fmt.Errorf("hdiutil attach failed: %w", err)
	}

	// Always detach DMG on return
	defer func() {
		detachCmd := e.runner.CommandContext(context.Background(), "hdiutil", "detach", mountPoint)
		_ = detachCmd.Run()
		_ = os.RemoveAll(mountPoint)
	}()

	// Copy all files from mount point to the destination
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

// copyDir recursively copies files from a physical source directory to the custom FS.
func (e *Extractor) copyDir(srcDir, destDir string) error {
	return filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
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

		// Use helper closure to ensure files are closed immediately after copying
		err = func() error {
			srcFile, err := os.Open(path)
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
