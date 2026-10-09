package downloader

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// PruneResult reports removed archives and entries preserved without ownership.
type PruneResult struct {
	Entries   int
	Bytes     int64
	Untracked int
}

// Prune removes downloads owned exclusively by versions absent from installed.
// Untracked entries are preserved: their URL alone does not establish which
// installed version, if any, needs them. CacheEnabled does not affect pruning.
func (d *Downloader) Prune(ctx context.Context, installed map[string]string) (PruneResult, error) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	var result PruneResult
	names, err := d.fsys.ReadDir(d.CacheDir)
	if errors.Is(err, os.ErrNotExist) {
		return result, nil
	}
	if err != nil {
		return result, fmt.Errorf("listing download cache: %w", err)
	}
	for _, name := range names {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		key, err := hex.DecodeString(name)
		if err != nil || len(key) != sha256.Size {
			continue
		}
		path := filepath.Join(d.CacheDir, name)
		info, err := d.fsys.Lstat(path)
		if err != nil {
			return result, fmt.Errorf("inspecting cached download %s: %w", name, err)
		}
		if !info.Mode().IsRegular() {
			result.Untracked++
			continue
		}
		record, err := d.readCacheRecord(cacheRecordPath(path))
		if err != nil || len(record.Owners) == 0 {
			result.Untracked++
			continue
		}
		if hasInstalledOwner(record.Owners, installed) {
			continue
		}
		if err := d.removePrunedEntry(path); err != nil {
			return result, fmt.Errorf("removing cached download %s: %w", name, err)
		}
		result.Entries++
		result.Bytes += info.Size()
	}
	return result, nil
}

// Keep ownership when removing the archive fails, so cleanup can be retried.
// Corruption eviction removes both regardless (removeCacheEntry) to prevent hits;
// pruning works on valid entries and must not discard their metadata first.
func (d *Downloader) removePrunedEntry(path string) error {
	if err := d.fsys.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := d.fsys.Remove(cacheRecordPath(path)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func hasInstalledOwner(owners, installed map[string]string) bool {
	for tool, version := range owners {
		if current, ok := installed[tool]; ok && current == version {
			return true
		}
	}
	return false
}
