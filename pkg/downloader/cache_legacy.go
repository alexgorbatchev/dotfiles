package downloader

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// The TypeScript downloader stored URL-keyed metadata separately from blobs
// keyed by content hash. Several URLs can reference the same blob.
type legacyCacheRecord struct {
	Type           string `json:"type"`
	BinaryFileName string `json:"binaryFileName"`
	ContentHash    string `json:"contentHash"`
	URL            string `json:"url"`
}

func cacheName(name, suffix string, bytes int) bool {
	if !strings.HasSuffix(name, suffix) {
		return false
	}
	key, err := hex.DecodeString(strings.TrimSuffix(name, suffix))
	return err == nil && len(key) == bytes
}

func (d *Downloader) cacheDirectory(path string) ([]string, error) {
	info, err := d.fsys.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("cache directory %s is not a regular directory", path)
	}
	return d.fsys.ReadDir(path)
}

func (d *Downloader) pruneLegacyCache(ctx context.Context, keepURL func(string) bool, result *PruneResult) error {
	metadataDir := filepath.Join(d.CacheDir, "metadata")
	binariesDir := filepath.Join(d.CacheDir, "binaries")
	metadata, err := d.cacheDirectory(metadataDir)
	if err != nil {
		return fmt.Errorf("listing old cache metadata: %w", err)
	}
	binaries, err := d.cacheDirectory(binariesDir)
	if err != nil {
		return fmt.Errorf("listing old cache downloads: %w", err)
	}
	keep := make(map[string]bool)
	stale := make(map[string][]string)
	removed := make(map[string]bool)
	for _, name := range metadata {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !cacheName(name, ".json", 16) {
			continue
		}
		path := filepath.Join(metadataDir, name)
		info, err := d.fsys.Lstat(path)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			result.Untracked++
			continue
		}
		data, err := d.fsys.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading old cache metadata: %w", err)
		}
		var record legacyCacheRecord
		if err := json.Unmarshal(data, &record); err != nil {
			return fmt.Errorf("decoding old cache metadata %s: %w", name, err)
		}
		if record.Type != "binary" || !cacheName(record.BinaryFileName, ".bin", 32) || record.BinaryFileName != record.ContentHash+".bin" {
			result.Untracked++
			continue
		}
		if keepURL != nil && keepURL(record.URL) {
			keep[record.BinaryFileName] = true
		} else {
			stale[record.BinaryFileName] = append(stale[record.BinaryFileName], path)
		}
	}
	for _, name := range binaries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !cacheName(name, ".bin", 32) || keep[name] {
			continue
		}
		path := filepath.Join(binariesDir, name)
		info, err := d.fsys.Lstat(path)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			result.Untracked++
			continue
		}
		if err := d.fsys.Remove(path); err != nil {
			return fmt.Errorf("removing old cached download: %w", err)
		}
		result.Entries++
		result.Bytes += info.Size()
		removed[name] = true
	}
	for name, paths := range stale {
		if !keep[name] && !removed[name] {
			continue
		}
		for _, path := range paths {
			if err := d.fsys.Remove(path); err != nil {
				return fmt.Errorf("removing old cache metadata: %w", err)
			}
		}
	}
	return nil
}
