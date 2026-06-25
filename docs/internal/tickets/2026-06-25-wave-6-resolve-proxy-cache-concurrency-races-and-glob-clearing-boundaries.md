---
created_on: 2026-06-25 12:10
last_modified: 2026-06-25 12:10
status: current
ticket_status: open
---

# Wave 6: Resolve Proxy Cache Concurrency Races and Glob Clearing Boundaries

## Problem

The HTTP Proxy Cache server (`pkg/proxy/`) implemented in Go has two severe correctness and safety bugs:

1. **Dangerous Concurrency Lock Violation in `CacheStore.Get()`**:
   Go's HTTP proxy manages cached responses using a file-backed storage directory. Since requests are processed concurrently across multiple goroutines, cache access is protected using a read-write mutex (`sync.RWMutex`).
   - **The Bug**: Inside `Get()`, Go acquires a Read Lock (`RLock()`), but attempts to actively **delete files on disk** when it detects expired entries:
     ```go
     // pkg/proxy/proxy.go
     func (s *CacheStore) Get(method, targetURL string) (*CacheEntry, []byte, error) {
         s.mu.RLock()
         defer s.mu.RUnlock() // READ LOCK!
         ...
         if nowMs > expiresAt {
             s.deleteByKey(key) // MUTATION UNDER READ LOCK!
             return nil, nil, fmt.Errorf("cache entry expired")
         }
     }
     ```
     Calling `deleteByKey(key)` mutates state and deletes files on disk. Performing mutations under an `RLock()` is a severe lock violation. If multiple threads concurrently request an expired entry, they will concurrently delete files under a read lock. If a writer is updating the cache simultaneously, this will bypass lock constraints, causing data races, file corruption, or immediate runtime crashes.

2. **Lacking Word Boundary Safety in Glob Invalidation**:
   In TS, clearing the cache for `github.com` compiles into a safe boundary-aware regex matching `github.com` exactly as a subdomain/domain, preventing accidental matches on similar strings (like `notgithub.com`).
   - **The Bug**: Go uses a naive glob-to-regex replacement:
     ```go
     regPat := pattern
     regPat = regexp.QuoteMeta(regPat)
     regPat = strings.ReplaceAll(regPat, "\\*", ".*")
     ```
     This matches sub-strings anywhere in the URL. A clear request for `github.com` translates directly to `.*github\.com.*`, which clears `notgithub.com` or `mygithub.com` indiscriminately, leading to broad, accidental cache wipes.

## Why this matters

Under high-parallel execution (like running test suites in parallel), data races inside locking mechanisms can lead to fatal Go runtime crashes (SIGSEGV). Inaccurate glob boundary regexes clear correct caches, leading to unexpected cache-misses and slow operations.

## Observed context

- Codebase files affected:
  - `pkg/proxy/proxy.go` (contains lock violations and broad glob compilations)
  - `pkg/proxy/proxy_test.go` (tests proxy behavior)

## Desired outcome

The HTTP Proxy Cache operates as a 100% thread-safe and deterministic local cache server. Locks are strictly respected, and glob clearing targets specific domains without affecting neighboring hostnames.

## Acceptance criteria

- [ ] Fix the concurrency bug inside `Get()` in `pkg/proxy/proxy.go`. Do not mutate the filesystem or call `deleteByKey(key)` inside the read lock. Instead:
  - Retrieve and check metadata under a Read Lock.
  - If the item is expired, release the Read Lock.
  - Acquire a full Write Lock (`Lock()`), re-verify expiration, delete the entry safely via `deleteByKey(key)`, and release the Write Lock.
- [ ] Upgrade the glob matching compiler `matchGlob` in `pkg/proxy/proxy.go` to enforce word boundaries matching TS:
  ```go
  // Compile glob into regex that ensures word boundaries:
  // (^|://|\.|/)[escapedPart]($|\.|/|:||\?)
  ```
- [ ] Write a parallelized, high-load concurrency unit test inside `pkg/proxy/proxy_test.go` that spans dozens of parallel goroutines simultaneously requesting expired keys, asserting that the proxy operates correctly without triggering panic states or deadlocks.
- [ ] Write unit tests verifying that clearing a glob for `github.com` does not wipe cache records for `notgithub.com`.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
