---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Implement Downloader Caching and Proxy Locking

## Problem

There are two major performance and safety gaps in the HTTP networking and caching proxy layers:

1. **No Downloader Caching Layer in Go**: In TS, the downloader initializes with a strategy-decorator pattern (`CachedDownloadStrategy.ts`) that intercepts HTTP downloads. If the content-hashed metadata cache key is found inside the file cache, it returns the cached binary directly, avoiding network calls. Go has no caching layer whatsoever in `pkg/downloader/`, executing duplicate upstream network requests on every run and risking rate limit exhaustion.
2. **Data Race in HTTP Cache Proxy**: Inside `Get()` in `pkg/proxy/proxy.go`, the proxy's `CacheStore` acquires a Read Lock (`RLock()`), but attempts to delete expired cache files on disk. This concurrency violation can cause data corruption or runtime panics under concurrent requests.

## Why this matters

Avoiding upstream API rate-limiting is essential for dotfiles installations, which may run multiple times in a single session. Additionally, concurrency safety inside the local development HTTP cache proxy is required to prevent race conditions and panics during parallel E2E test runs.

## Observed context

- Go files:
  - `pkg/downloader/downloader.go` (lacks caching checks)
  - `pkg/proxy/proxy.go` (lacks write-lock safety on file deletion in `Get`)
- TS files:
  - `.workspaces/main/packages/downloader/src/CachedDownloadStrategy.ts`

## Desired outcome

Go's downloader includes a high-fidelity local content-caching layer to avoid duplicate remote network requests, and the proxy server is fully synchronized with secure read-write locks for expired cache purging.

## Acceptance criteria

- [x] **Downloader Cache Decorator**: Implement local download caching in `pkg/downloader/` that stores downloaded artifacts based on content-hashed cache keys, matching TS `CachedDownloadStrategy`.
- [x] **Thread-Safe Proxy Purging**: Fix the concurrency data race in `pkg/proxy/proxy.go`. Acquire a secure Write Lock (`Lock()`) before deleting expired files on disk within `Get()`.
- [x] **Unit Testing**: Add tests in `pkg/downloader/downloader_test.go` and `pkg/proxy/proxy_test.go` asserting caching behavior and concurrent safety during request streams.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
