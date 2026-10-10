package downloader

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// CacheSession collects the cached archives used by an installation. Ownership is
// committed only after the installed version has been recorded successfully.
type CacheSession struct {
	mu      sync.Mutex
	entries map[string]struct{}
	leases  map[string]struct{}
}

// cacheLeases, protected by cacheMu, prevent cleanup during an installation.
var cacheLeases = make(map[string]int)

type cacheSessionKey struct{}

type pruningKey struct{}

// WithPruning controls automatic cleanup after installation. It does not affect
// explicit Prune calls or the recording of cache ownership.
func WithPruning(ctx context.Context, enabled bool) context.Context {
	return context.WithValue(ctx, pruningKey{}, enabled)
}

// PruningEnabled returns the explicit context policy, or the configured default.
func PruningEnabled(ctx context.Context, configured bool) bool {
	enabled, ok := ctx.Value(pruningKey{}).(bool)
	if ok {
		return enabled
	}
	return configured
}

// TrackCache returns a context recording cache hits and successful cache stores.
func TrackCache(ctx context.Context) (context.Context, *CacheSession) {
	s := &CacheSession{entries: make(map[string]struct{}), leases: make(map[string]struct{})}
	return context.WithValue(ctx, cacheSessionKey{}, s), s
}

func recordCacheUse(ctx context.Context, path string) {
	s, ok := ctx.Value(cacheSessionKey{}).(*CacheSession)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[path] = struct{}{}
}

func protectCacheUse(ctx context.Context, path string) {
	s, ok := ctx.Value(cacheSessionKey{}).(*CacheSession)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if _, ok := s.leases[path]; !ok {
		s.leases[path] = struct{}{}
		cacheLeases[path]++
	}
}

// Close releases protection for downloads from a failed or abandoned install.
// Commit releases it after successfully recording installed ownership.
func (s *CacheSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	cacheMu.Lock()
	defer cacheMu.Unlock()
	s.releaseLeases()
}

func (s *CacheSession) releaseLeases() {
	for path := range s.leases {
		cacheLeases[path]--
		if cacheLeases[path] == 0 {
			delete(cacheLeases, path)
		}
	}
	clear(s.leases)
}

// Commit associates the session's downloads with the successfully installed
// tool/version. Other tools sharing a download retain their ownership.
func (s *CacheSession) Commit(fsys fs.FS, tool, version string) error {
	if tool == "" || version == "" {
		return errors.New("cache ownership requires a tool and installed version")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cacheMu.Lock()
	defer cacheMu.Unlock()
	d := &Downloader{fsys: fsys}
	for path := range s.entries {
		// A store may have been evicted since this session used it.
		if _, err := fsys.Lstat(path); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return fmt.Errorf("inspecting cached download: %w", err)
		}
		record, err := d.readCacheRecord(cacheRecordPath(path))
		if err != nil {
			return fmt.Errorf("recording cache ownership: %w", err)
		}
		if record.Owners == nil {
			record.Owners = make(map[string]string)
		}
		record.Owners[tool] = version
		data, err := json.Marshal(record)
		if err != nil {
			return fmt.Errorf("encoding cache ownership: %w", err)
		}
		if err := replaceCacheRecord(fsys, cacheRecordPath(path), data); err != nil {
			return fmt.Errorf("writing cache ownership: %w", err)
		}
	}
	s.releaseLeases()
	return nil
}

// Replace the record only after the new one closes successfully. Besides keeping
// the previous ownership on a failed write, Rename replaces a destination symlink
// rather than following it into an unrelated file.
func replaceCacheRecord(fsys fs.FS, path string, data []byte) (err error) {
	tmp := path + ".ownership-" + rand.Text()
	w, err := fsys.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("creating ownership record: %w", err)
	}
	defer func() {
		if removeErr := fsys.Remove(tmp); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			err = errors.Join(err, fmt.Errorf("removing temporary ownership record: %w", removeErr))
		}
	}()
	if err := fs.WriteAndClose(w, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("writing ownership record: %w", err)
	}
	if err := fsys.Rename(tmp, path); err != nil {
		return fmt.Errorf("replacing ownership record: %w", err)
	}
	return nil
}
