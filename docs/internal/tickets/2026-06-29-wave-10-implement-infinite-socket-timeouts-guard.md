---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Implement Infinite Socket Timeouts Guard

## Problem

Go's default `NewDownloader` initialization leaves the underlying `http.Client` without any timeout:

```go
if client == nil {
    client = &http.Client{}
}
```

In Go's net/http standard library, an empty `http.Client` has an infinite timeout. If a remote server hangs, drops a socket, or experiences congestion during a tool package download, the entire Go CLI process will block and hang indefinitely, which is particularly dangerous in headless CI/CD environments.

## Why this matters

Uncapped socket timeouts threaten application reliability and can silently exhaust build resources or block CI queues indefinitely. Incorporating standard default timeouts ensures that failed connections are aborted and retried gracefully.

## Observed context

- Codebase files affected:
  - `pkg/downloader/downloader.go` (initializes HTTP downloader clients)

## Desired outcome

`NewDownloader` is updated to configure a default HTTP request timeout (such as 30 seconds) on the client, unless a custom timeout is explicitly provided.

## Acceptance criteria

- [ ] Update `NewDownloader` in `pkg/downloader/downloader.go` to enforce a default connection/read timeout (e.g. 30 or 60 seconds) on the `http.Client`.
- [ ] Support overriding this timeout via the global downloader config.
- [ ] Add a unit test in `pkg/downloader/downloader_test.go` verifying that request timeouts abort connections cleanly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
