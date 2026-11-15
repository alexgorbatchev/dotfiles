# pkg/usagelog

Best-effort tool activity for identifying forgotten tools by their last recorded use.

## Commands

- Test: `go test ./pkg/usagelog/...`

## Local conventions

- The product signal is whether a tool has recorded activity and how recently, not invocation counts. Occasional missed observations are acceptable; do not introduce exact-count receipts, synchronous logging helpers, or locking protocols to turn this into an audit ledger.
- Each shim updates a zero-byte marker under `usage/last-used/` with a shell builtin. The filesystem modification time supplies the observation timestamp. Generate the stable tool/binary marker path ahead of time; never create a marker during generation or installation, which would falsely record use.
- Refresh configured markers without deleting them, and merge timestamps into the existing registry with zero count increments and `MAX(last_used_at)`. Historical counts remain unchanged for compatibility and are not the current usage signal.
- Legacy `v1\t<unix seconds>\t<tool>\t<binary>` logs are read only for their latest timestamps. Commit those observations before removing consumed logs. Repeated or concurrent imports must not increase counts or move timestamps backward. Late legacy writes can be missed under the best-effort contract.
- “No usage recorded” does not prove a tool was never used: direct binary calls, disabled tracking, and tools without shims are not observed. Usage evidence informs human cleanup decisions; it never authorizes automatic removal.

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
