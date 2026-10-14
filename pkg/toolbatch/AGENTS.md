# pkg/toolbatch

Per-tool batch failure accumulator for CLI commands and orchestrator pipelines.

## Commands

- Test: `go test ./pkg/toolbatch/...`

## Local conventions

- Call `Failures.Record(log, toolName, err)` when a tool in a batch fails: if `err` is already `ErrFailed` (for example, propagated from an inner batch), it marks the outer batch as failed without logging a duplicate summary; otherwise it logs `err` under `log.WithContext(toolName)` and increments the failure count.
- Return `Failures.Err()` at the end of a batch so callers receive `ErrFailed` (`Command completed with tool failures; see errors above`) when one or more tools failed.
- `cmd/dotfiles/main.go` suppresses top-level duplicate error logging when `errors.Is(err, toolbatch.ErrFailed)` because per-tool errors were already logged at the point of failure.

## Local gotchas

- Never abort a multi-tool loop on the first `Record` call; continue processing remaining tools and return `failures.Err()` after the batch finishes.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `failures_test.go`.
- Ask first: changing `ErrFailed` sentinel message or batch failure reporting behavior.
- Never: pass raw `error` values as variadic logger arguments instead of formatting into `logger.Message`.

## References

- `pkg/toolbatch/failures.go`
- `pkg/toolbatch/failures_test.go`
