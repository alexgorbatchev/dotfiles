---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Fix Downloader Cache Key Header Collision

## Problem

In the original TypeScript implementation, cache keys are calculated by taking both the remote URL and the **request headers** (such as authorization tokens or custom accept headers) into account. It hashes a stringified representation of the combined payload: `JSON.stringify({ url, options: { headers } })` to produce a unique, isolated cache key.

In Go's downloader (`pkg/downloader/downloader.go`), the cache key is generated strictly using the SHA-256 hash of the URL string:

```go
cacheKey := sha256.Sum256([]byte(url))
```

**The Core Security Risk:** If a single URL is requested with different headers (such as varying OAuth/GitHub tokens or environments), Go's downloader will match the same cache key. This causes cache collisions where unauthorized files are served from cache, or sensitive binaries are leaked across installer boundaries.

## Why this matters

Security and credential isolation are critical for secure package installation. Ignoring headers in the cache key allows a user to access cached GitHub assets retrieved using another developer's token or environment settings, creating a serious security boundary leak.

## Observed context

- Go files:
  - `pkg/downloader/downloader.go` (contains cache key computation)
- TS files:
  - `packages/downloader/cache/helpers.ts` (computes cache key using both URL and headers)

## Desired outcome

The Go downloader computes cache keys based on a deterministic combination of the remote URL and any relevant request headers (such as `Authorization` or `Accept` headers), preventing cross-credentials cache pollution.

## Acceptance criteria

- [ ] **Hash URL and Headers**: Refactor `GetCacheKey` in `pkg/downloader/downloader.go` to compute the SHA-256 hash from a concatenated or structured string representing both the URL and any relevant request headers (e.g., matching the original TS `JSON.stringify` logic or serializing the headers map sorted alphabetically by key).
- [ ] **Exclude Volatile Headers**: Expose a way to exclude highly volatile or irrelevant headers (e.g. `User-Agent`, `Connection`) from the hash if necessary, but guarantee that authentication and content headers are strictly preserved.
- [ ] **Unit testing**: Add a test inside `pkg/downloader/downloader_test.go` that:
  - Requests the same URL with Header A (`Authorization: TokenA`).
  - Requests the same URL with Header B (`Authorization: TokenB`).
  - Asserts that two distinct cache keys are generated, and they are saved to separate cache files.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
