# pkg/usagelog

Shim execution usage logging, atomic log rotation, and SQLite registry usage aggregation.

## Commands

- Test: `go test ./pkg/usagelog/...`

## Local conventions

- Append-only shim format: shims record invocations as tab-delimited lines: `v1\t<unix seconds>\t<tool>\t<binary>` in `.generated/usage/shim-usage.log`.
- Current log rotation (`rotateActiveLog`) renames the active log to `<fileName>.<unix_ms>.<pid>[.<suffix>]` before processing. A writer that already opened the old file can still append to it; rename alone does not establish safe deletion or prevent event loss.
- Batch import (`Import`) processes rotated logs oldest-first by filename. Each file is aggregated into `tool_usage` in its own transaction (`reg.WithTx`), incrementing invocation counts and retaining the maximum `last_used_at`.
- Rotated files are deleted only after database transactions commit successfully. The current importer has no persistent consumed-byte receipts: a failed deletion or concurrent import can count records again. Preserve the commit-before-delete ordering when repairing retry accounting and writer coordination.

## Local gotchas

- Concurrent imports and rapid rotations use PID and millisecond timestamp suffixes to prevent collision across instances.
- Invalid or unrecognized format version strings in log lines are counted and skipped without crashing log processing.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `usagelog_test.go`.
- Ask first: modifying the tab-delimited log line protocol or version prefix.
- Never: delete rotated log files before database transactions commit.

## References

- `pkg/usagelog/usagelog.go`
- `pkg/usagelog/usagelog_test.go`
