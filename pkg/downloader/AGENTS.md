# pkg/downloader

File downloader with retry, caching, and progress reporting.

## Commands

- Test: `go test ./pkg/downloader/...`

## Local conventions

- Support download resumption, SHA256 integrity verification, HTTP retry logic, and persistent download caching under `.generated/cache/downloads/`.
- A response status that carries no file is returned as `*StatusError` (wrapped by the retry loop), so callers branch on `StatusCode` with `errors.As` instead of parsing the message.
- A download authenticated for one host sets `HostScopedHeaders`, and a direct request carrying such a token goes through `HostScopedClient`: net/http keeps `Authorization` on redirects to the same domain or a subdomain (and to another port of the same address), so only an explicit host check keeps the token on the host it was configured for.

## Local gotchas

- Unlogged downloads cause user-perceived freezes -> log download URLs and progress events.
- A resumed download takes its offset from `fs.FS.Stat` and streams onto the partial file through `OpenFile(O_APPEND)`; when that open fails, the wrapped error is returned. Every production `fs.FS` implements both, so a test simulates a failure with the `errorFS` wrapper in `downloader_test.go` rather than a production branch that buffers the file for a fake.
- Every write path (the `200` download, the `206` resume and the clean retry after a `416`) streams through `writeDownload`, which uses `fs.WriteAndClose`: a failed close fails the attempt, so the file is neither cached nor reported by `after-download`. A stream cut off part way keeps its bytes for the next attempt to resume after, but a file whose close failed (`fs.ErrClose`) is removed so the retry starts over instead of appending to contents nobody can vouch for; when the file is still there after that removal (what `Remove` returned does not decide it, since a `TrackedFileSystem` deletes and then may fail to record), the attempt is an `unresumableError`, names the file to delete, and is not retried. Tests simulate the failure with the `closeFailFS` wrapper in `downloader_test.go`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `downloader_test.go`.
- Ask first: changing download caching or retry policy defaults.
- Never: download files without integrity checks when hashes are provided.

## References

- `pkg/downloader/downloader.go`
