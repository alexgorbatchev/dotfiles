package downloader

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// The download cache keeps each download as an entry, named after its cache key,
// and a record beside it (cacheRecordPath) naming the SHA-256 and size the entry
// had when it was stored. An entry is served only while its content still matches
// its record, whether or not the caller expects a particular hash, so an entry
// damaged after it was stored (a truncated sync or restore, file system
// corruption, a hand edit) is evicted and downloaded again instead of being
// installed until it expires. An entry without a readable record is never served.

// cacheRecordSuffix names the record kept beside each cache entry.
const cacheRecordSuffix = ".json"

// cacheRecord describes the content of a cache entry as it was stored.
type cacheRecord struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
	URL    string `json:"url"`
}

// cacheRecordPath is where the record of the cache entry at entryPath is kept.
func cacheRecordPath(entryPath string) string {
	return entryPath + cacheRecordSuffix
}

// serveFromCache copies the cache entry at entryPath to destPath when the entry is
// younger than ttl and has a valid record, and keeps the copy when its content matches
// that record and, when expectedSHA256 is set, that hash as well. The copy is what is
// checked, not the entry, so the bytes vouched for are the bytes installed even when
// another run replaces the entry in the meantime. It reports whether it served the
// entry, and the size it copied. An entry that fails a check is evicted and its copy
// removed; the error is a copy that could not be removed, which a download would
// otherwise resume onto.
func (d *Downloader) serveFromCache(entryPath, url, destPath, expectedSHA256 string, ttl time.Duration) (int64, bool, error) {
	info, err := d.fsys.Stat(entryPath)
	if err != nil || time.Since(info.ModTime()) >= ttl {
		return 0, false, nil
	}
	record, err := d.readCacheRecord(cacheRecordPath(entryPath))
	if err != nil {
		d.evictCacheEntry(entryPath, url, err)
		return 0, false, nil
	}
	if err := d.fsys.CopyFile(entryPath, destPath); err != nil {
		// A copy can fail after it wrote destPath (a TrackedFileSystem copies and
		// then records), and the download would resume onto those unverified bytes.
		d.warn(logger.Message(fmt.Sprintf("Could not copy cached download of %s to %s: %v", url, destPath, err)))
		return 0, false, d.removeRejectedCopy(destPath, "could not be copied completely")
	}
	if err := d.checkCachedCopy(destPath, record, expectedSHA256); err != nil {
		d.evictCacheEntry(entryPath, url, err)
		return 0, false, d.removeRejectedCopy(destPath, "failed verification")
	}
	return record.Size, true, nil
}

// removeRejectedCopy removes the copy of a cache entry at destPath, which why says is
// not to be kept, so the download that follows does not resume onto it. Whether the
// copy is gone decides it, not what Remove returned: a TrackedFileSystem deletes the
// file and may then fail to record that, which leaves nothing to resume onto.
func (d *Downloader) removeRejectedCopy(destPath, why string) error {
	errRemove := d.fsys.Remove(destPath)
	if errRemove == nil || errors.Is(errRemove, os.ErrNotExist) {
		return nil
	}
	if exists, err := d.fsys.Exists(destPath); err == nil && !exists {
		d.warn(logger.Message(fmt.Sprintf("Removed %s, copied from a cache entry that %s, but: %v", destPath, why, errRemove)))
		return nil
	}
	return fmt.Errorf("removing %s, copied from a cache entry that %s (delete it before downloading again): %w", destPath, why, errRemove)
}

// checkCachedCopy reports why the copy of a cache entry at copyPath must not be kept,
// or nil when its content matches record and, when set, expectedSHA256.
func (d *Downloader) checkCachedCopy(copyPath string, record cacheRecord, expectedSHA256 string) error {
	sum, size, err := d.fileDigest(copyPath)
	if err != nil {
		return fmt.Errorf("reading its content: %w", err)
	}
	if sum != record.SHA256 || size != record.Size {
		return fmt.Errorf("its content (sha256 %s, %d bytes) no longer matches its record (sha256 %s, %d bytes)", sum, size, record.SHA256, record.Size)
	}
	if expectedSHA256 != "" && !strings.EqualFold(sum, strings.TrimSpace(expectedSHA256)) {
		return fmt.Errorf("its content (sha256 %s) is not the expected sha256 %s", sum, expectedSHA256)
	}
	return nil
}

// readCacheRecord reads and validates the record at recordPath.
func (d *Downloader) readCacheRecord(recordPath string) (cacheRecord, error) {
	var record cacheRecord
	data, err := d.fsys.ReadFile(recordPath)
	if errors.Is(err, os.ErrNotExist) {
		return record, errors.New("it has no record of its content")
	}
	if err != nil {
		return record, fmt.Errorf("reading its record: %w", err)
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return record, fmt.Errorf("its record is not valid: %w", err)
	}
	if sum, err := hex.DecodeString(record.SHA256); err != nil || len(sum) != sha256.Size || record.SHA256 != strings.ToLower(record.SHA256) || record.Size < 0 {
		return record, fmt.Errorf("its record is not valid: sha256 %q, size %d", record.SHA256, record.Size)
	}
	return record, nil
}

// evictCacheEntry removes the cache entry at entryPath and its record, logging why.
func (d *Downloader) evictCacheEntry(entryPath, url string, reason error) {
	d.warn(logger.Message(fmt.Sprintf("Evicting cached download of %s (%s): %v", url, entryPath, reason)))
	if err := d.removeCacheEntry(entryPath); err != nil {
		d.warn(logger.Message(fmt.Sprintf("Could not remove cached download %s: %v", entryPath, err)))
	}
}

// removeCacheEntry removes the cache entry at entryPath and its record. Either one
// already missing is not an error.
func (d *Downloader) removeCacheEntry(entryPath string) error {
	var errs []error
	for _, path := range []string{entryPath, cacheRecordPath(entryPath)} {
		if err := d.fsys.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// storeInCache stores the download at srcPath as the cache entry at entryPath in
// cacheDir. The previous record goes first and the new one is written last, so an
// entry is never paired with a record of other content: whichever step fails, what
// is left has no record and is never served. A failed store removes what it wrote.
func (d *Downloader) storeInCache(cacheDir, entryPath, url, srcPath string) error {
	if err := d.fsys.MkdirAll(cacheDir, 0o755); err != nil {
		return fmt.Errorf("creating the cache directory: %w", err)
	}
	recordPath := cacheRecordPath(entryPath)
	if err := d.fsys.Remove(recordPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("removing the previous record: %w", err)
	}
	if err := d.writeCacheEntry(entryPath, recordPath, url, srcPath); err != nil {
		if errRemove := d.removeCacheEntry(entryPath); errRemove != nil {
			return errors.Join(err, fmt.Errorf("removing the incomplete entry: %w", errRemove))
		}
		return err
	}
	return nil
}

// writeCacheEntry copies srcPath to entryPath and then records the SHA-256 and size
// of the copy, so the record describes the bytes the cache holds.
func (d *Downloader) writeCacheEntry(entryPath, recordPath, url, srcPath string) error {
	if err := d.fsys.CopyFile(srcPath, entryPath); err != nil {
		return fmt.Errorf("copying the download: %w", err)
	}
	sum, size, err := d.fileDigest(entryPath)
	if err != nil {
		return fmt.Errorf("hashing the entry: %w", err)
	}
	data, err := json.Marshal(cacheRecord{SHA256: sum, Size: size, URL: url})
	if err != nil {
		return fmt.Errorf("encoding the record: %w", err)
	}
	if err := d.fsys.WriteFile(recordPath, data, 0o644); err != nil {
		return fmt.Errorf("writing the record: %w", err)
	}
	return nil
}

// fileDigest reads the file at path in one streaming pass and returns its SHA-256,
// in lowercase hex, and its size.
func (d *Downloader) fileDigest(path string) (string, int64, error) {
	rc, err := d.fsys.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer rc.Close() // opened read-only, so closing it cannot lose data

	hasher := sha256.New()
	size, err := io.Copy(hasher, rc)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(hasher.Sum(nil)), size, nil
}

// warn logs msg when the downloader has a logger.
func (d *Downloader) warn(msg logger.Message) {
	if d.log != nil {
		d.log.Warn(msg)
	}
}
