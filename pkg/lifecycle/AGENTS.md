# pkg/lifecycle

Installation lifecycle events and context-propagated hook emitters.

## Commands

- Test: `go test ./pkg/lifecycle/...`

## Local conventions

- Lifecycle events (`Event`):
  - `AfterDownload`: emitted once an asset has been downloaded to disk (`DownloadPath`).
  - `AfterExtract`: emitted once an archive has been unpacked into a directory (`DownloadPath`, `ExtractDir`, `ExtractedFiles`, `Executables`).
- Decoupled observer model: downloaders and archive extractors emit events via `lifecycle.Emit(ctx, event, details)` without depending directly on the orchestrator or requiring callbacks threaded through every installer function.
- Context injection: `WithEmitter(ctx, fn)` wraps the context with an `Emitter`. Calling `Emit` on a context without an emitter is a safe no-op.
- Fail-fast errors: an error returned by an `Emitter` aborts the installation immediately, preventing invalid or partially installed tools from being registered.

## Local gotchas

- Handlers should inspect pre-computed `ExtractedFiles` and `Executables` slices rather than walking directories or re-evaluating executable heuristics.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `lifecycle_test.go` for any lifecycle changes.
- Ask first: adding new lifecycle event types or altering `Details` struct fields.
- Never: swallow emitter errors during installation workflows.

## References

- `pkg/lifecycle/lifecycle.go`
- `pkg/lifecycle/lifecycle_test.go`
