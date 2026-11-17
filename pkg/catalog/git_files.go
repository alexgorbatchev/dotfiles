package catalog

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type gitFile struct {
	path, object string
	size         int64
	mode         os.FileMode
}

func parseGitFiles(data []byte, source string) ([]gitFile, error) {
	files := []gitFile{}
	seen := make(map[string]bool)
	directories := make(map[string]string)
	var total int64
	mainFound := false
	for _, entry := range bytes.Split(data, []byte{0}) {
		if len(entry) == 0 {
			continue
		}
		header, name, ok := strings.Cut(string(entry), "\t")
		fields := strings.Fields(header)
		if !ok || len(fields) != 4 || fields[1] != "blob" || (fields[0] != "100644" && fields[0] != "100755") {
			return nil, fmt.Errorf("Git entry must be a regular file: %q", name)
		}
		relative, ok := strings.CutPrefix(name, source+"/")
		if !ok {
			return nil, fmt.Errorf("Git entry leaves selected tool directory: %q", name)
		}
		if err := validatePath(relative); err != nil {
			return nil, err
		}
		if !utf8.ValidString(relative) {
			return nil, fmt.Errorf("Git path must be valid UTF-8")
		}
		for _, part := range strings.Split(relative, "/") {
			if strings.EqualFold(part, ".git") || strings.ContainsAny(part, "<>\"|?*") || strings.IndexFunc(part, unicode.IsControl) >= 0 {
				return nil, fmt.Errorf("unsafe Git path %q", relative)
			}
		}
		key := strings.ToLower(relative)
		if seen[key] || directories[key] != "" || strings.HasSuffix(key, ".tool.ts") {
			return nil, fmt.Errorf("colliding or additional tool definition %q", relative)
		}
		seen[key] = true
		for parent := filepath.ToSlash(filepath.Dir(relative)); parent != "."; parent = filepath.ToSlash(filepath.Dir(parent)) {
			parentKey := strings.ToLower(parent)
			if seen[parentKey] || (directories[parentKey] != "" && directories[parentKey] != parent) {
				return nil, fmt.Errorf("file/directory or directory casing collision %q", relative)
			}
			directories[parentKey] = parent
		}
		limit := int64(maxAssetBytes)
		if relative == "tool.ts" {
			mainFound = true
			limit = maxTypeScriptBytes
		}
		size, err := strconv.ParseInt(fields[3], 10, 64)
		if err != nil || size < 0 || size > limit {
			return nil, fmt.Errorf("invalid or oversized Git file %q", relative)
		}
		total += size
		if total > maxDefinitionBytes || len(files) >= maxBundleFiles {
			return nil, fmt.Errorf("tool directory exceeds file/byte limits")
		}
		mode := os.FileMode(0644)
		if fields[0] == "100755" {
			mode = 0755
		}
		files = append(files, gitFile{path: relative, object: fields[2], size: size, mode: mode})
	}
	if len(files) > 0 && !mainFound {
		return nil, fmt.Errorf("tool directory requires tool.ts")
	}
	return files, nil
}

func writeGitFile(fsys fs.FS, directory string, file gitFile, data []byte) error {
	name := filepath.Join(directory, filepath.FromSlash(file.path))
	if err := fsys.MkdirAll(filepath.Dir(name), 0700); err != nil {
		return fmt.Errorf("create tool file parent: %w", err)
	}
	w, err := fsys.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, file.mode)
	if err != nil {
		return fmt.Errorf("create tool file: %w", err)
	}
	if err := fs.WriteAndClose(w, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("write tool file: %w", err)
	}
	return fsys.Chmod(name, file.mode)
}

func absentGitDestination(fsys fs.FS, name string) error {
	_, err := fsys.Lstat(name)
	if err == nil {
		return failure("destination-exists", "", fmt.Errorf("destination %q already exists; local files were left unchanged", name))
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect tool destination: %w", err)
	}
	return nil
}

func safeGitDirectory(fsys fs.FS, name string) error {
	for current := name; ; current = filepath.Dir(current) {
		info, err := fsys.Lstat(current)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect directory %q: %w", current, err)
		}
		if err == nil && !info.IsDir() {
			return fmt.Errorf("directory ancestor %q is not a real directory", current)
		}
		if parent := filepath.Dir(current); parent == current {
			break
		}
	}
	return fsys.MkdirAll(name, 0700)
}

func publishGitFiles(fsys *fs.OSFS, payload string, result FetchResult) (err error) {
	if err := safeGitDirectory(fsys, filepath.Dir(result.Destination)); err != nil {
		return err
	}
	// Mkdir, rather than MkdirAll, atomically refuses an existing destination.
	if err := fsys.Mkdir(result.Destination, 0700); err != nil {
		return fmt.Errorf("reserve tool destination: %w", err)
	}
	defer func() {
		if err != nil {
			err = errors.Join(err, fsys.RemoveAll(result.Destination))
		}
	}()
	if err := fs.CopyTree(fsys, payload, result.Destination); err != nil {
		return fmt.Errorf("copy fetched tool files: %w", err)
	}
	// Keep source undiscoverable until every helper and asset has been copied.
	if err := fsys.Rename(filepath.Join(result.Destination, "tool.ts"), filepath.Join(result.Destination, result.ID+".tool.ts")); err != nil {
		return fmt.Errorf("publish tool definition: %w", err)
	}
	return nil
}
