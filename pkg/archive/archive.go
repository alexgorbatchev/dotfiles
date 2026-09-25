package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/bzip2"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
)

// ErrSymlinkTraversalDetected is returned when a symbolic link target escapes the destination directory.
var ErrSymlinkTraversalDetected = errors.New("symbolic link traversal detected")

// ErrZipSlipDetected is returned when an archive entry path escapes the destination directory.
var ErrZipSlipDetected = errors.New("zip slip traversal detected")

// ErrUnsupportedFormat is returned by Extract when the file name carries no suffix it can dispatch on.
var ErrUnsupportedFormat = errors.New("unsupported or unrecognized archive format")

// supportedExtensions lists every filename suffix Extract dispatches on. It is the single
// definition of "an archive this package can unpack": installers decide whether to extract
// a download by consulting it through IsSupported, so an entry here without a matching
// case in Extract, or the reverse, is a bug that TestSupportedExtensionsDispatch catches.
//
// Compound suffixes come before the bare compression suffix they end with (".tar.gz"
// before ".gz") so that Extension reports the most specific one.
var supportedExtensions = []string{
	".tar.gz", ".tgz",
	".tar.bz2", ".tbz2", ".tbz",
	".tar.xz", ".txz",
	".tar",
	".zip",
	".dmg",
	".pkg",
	".gz",
}

// unsupportedExtensions lists archive and compression suffixes Extract recognises but
// cannot unpack. A file carrying one of these is an archive that needs a tool this package
// does not drive; it is never a raw executable, and callers rely on Extension naming it so
// they can refuse it instead of marking a compressed stream executable.
var unsupportedExtensions = []string{
	".tar.zst", ".tar.lz4", ".tar.lzma", ".tar.z", ".tzst",
	".zst", ".lz4", ".lzma", ".xz", ".bz2", ".z", ".lz",
	".rar", ".7z",
}

// SupportedExtensions returns the suffixes Extract can unpack, most specific first.
func SupportedExtensions() []string {
	return append([]string(nil), supportedExtensions...)
}

// Extension returns the archive or compression suffix of name, lower-cased, or "" when
// name has none. The suffix may be one Extract cannot unpack; IsSupported tells the two
// apart.
func Extension(name string) string {
	lower := strings.ToLower(name)
	for _, suffix := range supportedExtensions {
		if strings.HasSuffix(lower, suffix) {
			return suffix
		}
	}
	for _, suffix := range unsupportedExtensions {
		if strings.HasSuffix(lower, suffix) {
			return suffix
		}
	}
	return ""
}

// IsSupported reports whether Extract can unpack a file called name.
func IsSupported(name string) bool {
	ext := Extension(name)
	return ext != "" && slices.Contains(supportedExtensions, ext)
}

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

// isSafeTargetPath checks whether joining dest and entry name remains within dest directory boundaries.
func isSafeTargetPath(dest, name string) (string, error) {
	cleanDest := filepath.Clean(dest)
	if name == "" {
		return "", ErrZipSlipDetected
	}

	normalized := strings.ReplaceAll(name, "\\", "/")
	if strings.HasPrefix(normalized, "/") || (len(normalized) >= 2 && normalized[1] == ':') || filepath.IsAbs(name) {
		return "", ErrZipSlipDetected
	}

	cleanName := filepath.FromSlash(normalized)
	cleanTarget := filepath.Clean(filepath.Join(cleanDest, cleanName))

	rel, err := filepath.Rel(cleanDest, cleanTarget)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || strings.HasPrefix(rel, "../") || strings.HasPrefix(rel, "..\\") {
		return "", ErrZipSlipDetected
	}

	return cleanTarget, nil
}

// Extract detects the format from the suffix of src (see supportedExtensions) and extracts
// the archive into dest. A src that IsSupported rejects fails with ErrUnsupportedFormat.
func (e *Extractor) Extract(ctx context.Context, src string, dest string) error {
	// Ensure destination directory exists before extracting
	if err := e.fsys.MkdirAll(dest, 0755); err != nil {
		return fmt.Errorf("creating destination directory: %w", err)
	}

	var err error
	switch Extension(src) {
	case ".tar.gz", ".tgz":
		err = e.extractTar(ctx, src, dest, "tar.gz")
	case ".tar.bz2", ".tbz2", ".tbz":
		err = e.extractTar(ctx, src, dest, "tar.bz2")
	case ".tar.xz", ".txz":
		err = e.extractTarXz(ctx, src, dest)
	case ".tar":
		err = e.extractTar(ctx, src, dest, "tar")
	case ".zip":
		err = e.extractZip(ctx, src, dest)
	case ".dmg":
		err = e.extractDmg(ctx, src, dest)
	case ".pkg":
		err = e.extractPkg(ctx, src, dest)
	case ".gz":
		err = e.extractSingleGz(ctx, src, dest)
	default:
		return fmt.Errorf("%w for %q", ErrUnsupportedFormat, src)
	}

	if err != nil {
		return err
	}

	// Apply executable heuristics
	extracted, executables, err := e.detectAndSetExecutables(dest)
	if err != nil {
		return err
	}

	// The tree is now complete, which is the point an after-extract hook expects to
	// see. Reporting before the executable bits are set would hand the hook a tree it
	// could not run anything from.
	return lifecycle.Emit(ctx, lifecycle.AfterExtract, lifecycle.Details{
		DownloadPath:   src,
		ExtractDir:     dest,
		ExtractedFiles: extracted,
		Executables:    executables,
	})
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
	// check if the file reader supports ReaderAt natively to stream it without memory buffering.
	info, err := e.fsys.Stat(src)
	if err != nil {
		return fmt.Errorf("stat zip archive: %w", err)
	}

	var reader *zip.Reader
	if ra, ok := rc.(io.ReaderAt); ok {
		reader, err = zip.NewReader(ra, info.Size())
		if err != nil {
			return fmt.Errorf("parsing zip archive from ReaderAt: %w", err)
		}
	} else {
		// Fallback to memory buffering only if fsys is not a real disk (e.g. MemFS in tests)
		data, err := io.ReadAll(rc)
		if err != nil {
			return fmt.Errorf("reading zip archive bytes: %w", err)
		}
		reader, err = zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return fmt.Errorf("parsing zip archive header: %w", err)
		}
	}

	for _, f := range reader.File {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		cleanTarget, err := isSafeTargetPath(dest, f.Name)
		if err != nil {
			return fmt.Errorf("extracting %q: %w", f.Name, err)
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
			if err := validateSymlink(dest, cleanTarget, targetPath); err != nil {
				return err
			}
			_ = e.fsys.Remove(cleanTarget)
			if err := e.fsys.Symlink(targetPath, cleanTarget); err != nil {
				return fmt.Errorf("creating zip symlink from %q to %q: %w", targetPath, cleanTarget, err)
			}
			continue
		}

		entryRc, err := f.Open()
		if err != nil {
			return fmt.Errorf("opening zip file entry %q: %w", f.Name, err)
		}
		writeErr := e.writeFile(cleanTarget, entryRc)
		entryRc.Close()
		if writeErr != nil {
			return writeErr
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

		cleanTarget, err := isSafeTargetPath(dest, header.Name)
		if err != nil {
			return fmt.Errorf("extracting %q: %w", header.Name, err)
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

			if err := e.writeFile(cleanTarget, tarReader); err != nil {
				return err
			}
			if err := e.fsys.Chmod(cleanTarget, header.FileInfo().Mode()); err != nil {
				return fmt.Errorf("setting permissions on %q: %w", cleanTarget, err)
			}

		case tar.TypeSymlink, tar.TypeLink:
			if err := validateSymlink(dest, cleanTarget, header.Linkname); err != nil {
				return err
			}
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

// extractTarXz extracts .tar.xz and .txz archives using system xz command in its own process group with proper cleanup.
func (e *Extractor) extractTarXz(ctx context.Context, src string, dest string) error {
	fileReader, err := e.fsys.Open(src)
	if err != nil {
		return fmt.Errorf("opening xz archive: %w", err)
	}
	defer fileReader.Close()

	pr, pw := io.Pipe()
	cmd := e.runner.CommandContext(ctx, "xz", "-d", "-c")
	cmd.SetProcessGroup(true)
	cmd.SetStdin(fileReader)
	cmd.SetStdout(pw)

	var stderr bytes.Buffer
	cmd.SetStderr(&stderr)

	if err := cmd.Start(); err != nil {
		_ = pr.Close()
		_ = pw.Close()
		return fmt.Errorf("starting xz process: %w", err)
	}

	cmdErrCh := make(chan error, 1)
	go func() {
		err := cmd.Wait()
		if err != nil {
			_ = pw.CloseWithError(fmt.Errorf("xz process error: %w, stderr: %s", err, stderr.String()))
		} else {
			_ = pw.Close()
		}
		cmdErrCh <- err
	}()

	var extractErr error
	defer func() {
		if extractErr != nil {
			_ = cmd.Kill()
			_ = pr.Close()
			_ = pw.CloseWithError(extractErr)
		} else {
			_ = pr.Close()
		}
		<-cmdErrCh
	}()

	tarReader := tar.NewReader(pr)
	for {
		select {
		case <-ctx.Done():
			extractErr = ctx.Err()
			return extractErr
		default:
		}

		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			extractErr = fmt.Errorf("reading next xz tar entry: %w", err)
			return extractErr
		}

		cleanTarget, err := isSafeTargetPath(dest, header.Name)
		if err != nil {
			extractErr = fmt.Errorf("extracting %q: %w", header.Name, err)
			return extractErr
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := e.fsys.MkdirAll(cleanTarget, header.FileInfo().Mode()); err != nil {
				extractErr = fmt.Errorf("creating directory %q: %w", cleanTarget, err)
				return extractErr
			}

		case tar.TypeReg:
			if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				extractErr = fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
				return extractErr
			}

			if err := e.writeFile(cleanTarget, tarReader); err != nil {
				extractErr = err
				return extractErr
			}
			if err := e.fsys.Chmod(cleanTarget, header.FileInfo().Mode()); err != nil {
				extractErr = fmt.Errorf("setting permissions on %q: %w", cleanTarget, err)
				return extractErr
			}

		case tar.TypeSymlink, tar.TypeLink:
			if err := validateSymlink(dest, cleanTarget, header.Linkname); err != nil {
				extractErr = err
				return extractErr
			}
			if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				extractErr = fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
				return extractErr
			}
			_ = e.fsys.Remove(cleanTarget)
			if err := e.fsys.Symlink(header.Linkname, cleanTarget); err != nil {
				extractErr = fmt.Errorf("creating tar symlink from %q to %q: %w", header.Linkname, cleanTarget, err)
				return extractErr
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
	cleanTarget, err := isSafeTargetPath(dest, outName)
	if err != nil {
		return fmt.Errorf("extracting gz %q: %w", outName, err)
	}

	if err := e.fsys.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
		return fmt.Errorf("creating parent directory for %q: %w", cleanTarget, err)
	}

	if err := e.writeFile(cleanTarget, gz); err != nil {
		return err
	}

	return e.fsys.Chmod(cleanTarget, 0755)
}

// writeFile creates path and streams r into it. The close result is part of the write:
// some write failures surface only when the file is closed, and on a tracked file
// system the close is where the file is recorded. A failed close therefore fails the
// extraction instead of passing off a possibly incomplete file as extracted.
func (e *Extractor) writeFile(path string, r io.Reader) error {
	w, err := e.fsys.Create(path)
	if err != nil {
		return fmt.Errorf("creating extracted file %q: %w", path, err)
	}
	if err := fs.WriteAndClose(w, r); err != nil {
		return fmt.Errorf("writing extracted file %q: %w", path, err)
	}
	return nil
}

// detectAndSetExecutables walks the dest directory and applies heuristics to find
// executables. It reports every file it found and the ones it marked executable, which
// is what an after-extract hook is told about the tree.
func (e *Extractor) detectAndSetExecutables(dest string) ([]string, []string, error) {
	files, err := e.walkFiles(dest)
	if err != nil {
		return nil, nil, err
	}
	executables := []string{}

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
			executables = append(executables, path)
		}
	}
	return files, executables, nil
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

// extractDmg mounts a macOS DMG file with MountDmg, at dmgMountPoint(dest), and
// copies the volume's contents into dest. An image that cannot be detached fails the
// extraction.
func (e *Extractor) extractDmg(ctx context.Context, src string, dest string) (err error) {
	exists, err := e.fsys.Exists(src)
	if err != nil || !exists {
		return fmt.Errorf("dmg file does not exist: %s", src)
	}

	mountPoint := dmgMountPoint(dest)
	detach, err := MountDmg(ctx, e.runner, e.fsys, src, mountPoint)
	if err != nil {
		return fmt.Errorf("mounting DMG: %w", err)
	}
	defer func() {
		err = errors.Join(err, detach())
	}()

	if err := e.copyVolume(mountPoint, dest); err != nil {
		return fmt.Errorf("copying DMG files: %w", err)
	}
	return nil
}

// copyVolume copies the entries of a mounted volume into dest, symlinks included (see
// fs.CopyTree). The volume root itself is not copied, so dest keeps the mode its caller
// created it with instead of taking the root's, which may deny writing. Whatever dest
// already holds at a volume entry's path is removed first and replaced wholesale,
// directories included (tar and zip merge into an existing directory instead), so a
// symlink never collides with an earlier extraction.
func (e *Extractor) copyVolume(volume, dest string) error {
	names, err := e.fsys.ReadDir(volume)
	if err != nil {
		return err
	}
	for _, name := range names {
		if err := e.fsys.RemoveAll(filepath.Join(dest, name)); err != nil {
			return err
		}
		if err := fs.CopyTree(e.fsys, filepath.Join(volume, name), filepath.Join(dest, name)); err != nil {
			return err
		}
	}
	return nil
}

// extractPkg expands a macOS PKG installer package to destination using standard system utilities.
func (e *Extractor) extractPkg(ctx context.Context, src string, dest string) error {
	exists, err := e.fsys.Exists(src)
	if err != nil || !exists {
		return fmt.Errorf("pkg file does not exist: %s", src)
	}

	expandCmd := e.runner.CommandContext(ctx, "pkgutil", "--expand-full", src, dest)
	err = expandCmd.Run()
	if err != nil {
		return fmt.Errorf("pkgutil expand failed: %w", err)
	}
	return nil
}

func validateSymlink(dest, cleanTarget, target string) error {
	// Normalize backslashes to forward slashes for cross-platform safety
	normalizedTarget := strings.ReplaceAll(target, "\\", "/")

	if filepath.IsAbs(target) || filepath.IsAbs(normalizedTarget) || strings.HasPrefix(normalizedTarget, "/") {
		return ErrSymlinkTraversalDetected
	}

	cleanDest := filepath.Clean(dest)
	linkDir := filepath.Dir(cleanTarget)
	resolvedTarget := filepath.Join(linkDir, filepath.FromSlash(normalizedTarget))

	rel, err := filepath.Rel(cleanDest, filepath.Clean(resolvedTarget))
	if err != nil || strings.HasPrefix(rel, "..") || rel == ".." {
		return ErrSymlinkTraversalDetected
	}

	return nil
}
