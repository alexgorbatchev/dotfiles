# pkg/downloader

File downloader with retry, caching, and progress reporting.

## Commands

- Test: `go test ./pkg/downloader/...`

## Local conventions

- Support download resumption, SHA256 integrity verification, HTTP retry logic, and persistent download caching under `.generated/cache/downloads/`.
- A response status that carries no file is returned as `*StatusError` (wrapped by the retry loop), so callers branch on `StatusCode` with `errors.As` instead of parsing the message.

## Local gotchas

- Unlogged downloads cause user-perceived freezes -> log download URLs and progress events.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `downloader_test.go`.
- Ask first: changing download caching or retry policy defaults.
- Never: download files without integrity checks when hashes are provided.

## References

- `pkg/downloader/downloader.go`
