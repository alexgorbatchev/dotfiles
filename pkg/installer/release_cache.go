package installer

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// defaultReleaseCacheTTL is how long release metadata is reused when the installer
// was not given a TTL.
const defaultReleaseCacheTTL = time.Hour

// cachedReleaseMetadata is a release description a releaseCache can hold. A release
// whose tag is empty is never treated as a cache hit, and clone returns a copy that
// shares no memory with the original, so neither the cache nor a caller can change
// what the other holds.
type cachedReleaseMetadata[R any] interface {
	tag() string
	clone() R
}

type releaseCacheEntry[R cachedReleaseMetadata[R]] struct {
	release   R
	fetchedAt time.Time
}

// releaseCacheStore says where a release cache keeps its entries on disk and how
// long any entry, in memory or on disk, may be reused. An empty dir or a nil fsys
// keeps entries in memory only.
type releaseCacheStore struct {
	fsys fs.FS
	dir  string
	ttl  time.Duration
}

func (s releaseCacheStore) maxAge() time.Duration {
	if s.ttl <= 0 {
		return defaultReleaseCacheTTL
	}
	return s.ttl
}

func (s releaseCacheStore) path(key string) string {
	h := md5.Sum([]byte(key))
	return filepath.Join(s.dir, fmt.Sprintf("%x.json", h))
}

func (s releaseCacheStore) onDisk() bool {
	return s.fsys != nil && s.dir != ""
}

// releaseCache keeps fetched release descriptions in memory in front of a directory
// of JSON entries. Every entry records when it was fetched, and neither layer
// answers with an entry older than the store's TTL: the installers live as long as
// the process, and a long-running one (the dashboard) must still see releases
// published after it started. The zero value is ready to use.
type releaseCache[R cachedReleaseMetadata[R]] struct {
	mu      sync.Mutex
	entries map[string]releaseCacheEntry[R]
	// now reads the clock; nil selects time.Now.
	now func() time.Time
}

func (c *releaseCache[R]) clock() time.Time {
	if c.now == nil {
		return time.Now()
	}
	return c.now()
}

// get returns a deep copy of the release cached under key, from memory or else from
// disk, when it was fetched less than the store's TTL ago.
func (c *releaseCache[R]) get(store releaseCacheStore, key string) (*R, bool) {
	now := c.clock()
	maxAge := store.maxAge()

	c.mu.Lock()
	entry, ok := c.entries[key]
	if ok && now.Sub(entry.fetchedAt) >= maxAge {
		delete(c.entries, key)
		ok = false
	}
	c.mu.Unlock()
	if ok {
		rel := entry.release.clone()
		return &rel, true
	}

	if !store.onDisk() {
		return nil, false
	}
	cacheFile := store.path(key)
	info, err := store.fsys.Stat(cacheFile)
	if err != nil || now.Sub(info.ModTime()) >= maxAge {
		return nil, false
	}
	data, err := store.fsys.ReadFile(cacheFile)
	if err != nil {
		return nil, false
	}
	var rel R
	if err := json.Unmarshal(data, &rel); err != nil || rel.tag() == "" {
		return nil, false
	}
	// The entry keeps the time it was written, so promoting it into memory does not
	// extend its life.
	c.promote(key, releaseCacheEntry[R]{release: rel.clone(), fetchedAt: info.ModTime()})
	return &rel, true
}

// set records rel under key as fetched now, in memory and, when the store has a
// directory, on disk. Writing the disk copy is best effort: a cache that cannot be
// written only costs a later request.
func (c *releaseCache[R]) set(store releaseCacheStore, key string, rel *R) {
	if rel == nil {
		return
	}
	c.store(key, releaseCacheEntry[R]{release: (*rel).clone(), fetchedAt: c.clock()})

	if !store.onDisk() {
		return
	}
	data, err := json.Marshal(rel)
	if err != nil {
		return
	}
	_ = store.fsys.MkdirAll(store.dir, 0755)
	_ = store.fsys.WriteFile(store.path(key), data, 0644)
}

func (c *releaseCache[R]) store(key string, entry releaseCacheEntry[R]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil {
		c.entries = make(map[string]releaseCacheEntry[R])
	}
	c.entries[key] = entry
}

// promote records an entry read from disk unless memory already holds one fetched
// at the same time or later, which a concurrent set may have stored after get
// looked in memory.
func (c *releaseCache[R]) promote(key string, entry releaseCacheEntry[R]) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if existing, ok := c.entries[key]; ok && !existing.fetchedAt.Before(entry.fetchedAt) {
		return
	}
	if c.entries == nil {
		c.entries = make(map[string]releaseCacheEntry[R])
	}
	c.entries[key] = entry
}

// releaseCacheKey names the cache entry for version of repo as served by the API at
// apiBase to a client holding token. "latest" is a different release once
// prereleases are allowed, so the two are kept apart; a tag names the same release
// either way. The token is represented by its SHA-256 digest, as v1 keyed its GitHub
// API cache, because what a repository shows depends on who asks.
func releaseCacheKey(apiBase, repo, version string, prerelease bool, token string) string {
	key := apiBase + "/" + repo + "@" + version
	if version == "latest" && prerelease {
		key += "?prerelease"
	}
	if token != "" {
		digest := sha256.Sum256([]byte(token))
		key += "#" + hex.EncodeToString(digest[:])
	}
	return key
}
