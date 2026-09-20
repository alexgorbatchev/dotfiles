# pkg/usagelog

Shim execution usage logging, atomic log rotation, and SQLite registry usage aggregation.

## Commands

- Test: `go test ./pkg/usagelog/...`

## Local conventions

- Append-only shim format: shims record invocations as tab-delimited lines: `v1\t<unix seconds>\t<tool>\t<binary>` in `.generated/usage/shim-usage.log`.
- Non-blocking log rotation (`rotateActiveLog`): renames active log to `<fileName>.<unix_ms>.<pid>[.<suffix>]` before processing, allowing running shims to write to a fresh log file without contention or event loss.
- Batch import transaction (`Import`): folds rotated logs oldest-first by timestamp into `tool_usage` database records within a single transaction (`reg.WithTx`), incrementing invocation counts and updating `last_used_at`.
- Transaction safety: rotated files are deleted from the filesystem only after database transactions commit successfully; failed imports leave logs in place for subsequent runs.

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
