---
created_on: 2026-06-25 14:30
last_modified: 2026-06-25 14:30
status: current
ticket_status: open
---

# Wave 6: Optimize SQLite Connection Concurrency and Pragma Settings

## Problem

The Go implementation stores local state data inside an SQLite database (`registry.db`). Since installations and tool operations run concurrently under Go goroutines, proper connection pooling and transaction safety are enforced inside `pkg/db/db.go`.

However, the Go database client lacks critical SQLite performance optimizations compared to the legacy TypeScript implementation:
- **Missing Synchronous Pragma**: The legacy TypeScript client configures the database connection with `PRAGMA synchronous = NORMAL` and `PRAGMA busy_timeout = 5000`. The Go database initialization completely omits the `PRAGMA synchronous = NORMAL` command.
- **The Bug**: Without `PRAGMA synchronous = NORMAL`, SQLite defaults to `PRAGMA synchronous = FULL`. In `FULL` mode, SQLite must pause execution and wait for data to be physically, safely written to the storage drive platters on *every single* state transaction or insert. On slow host systems (such as older mechanical hard drives, network drives, or un-optimized virtual instances), this causes a massive performance bottleneck, slowing down tool installations and status inquiries significantly.

## Why this matters

A compiled Go application must meet elite performance standards. Failing to configure optimal SQLite connection pragmas leads to sluggish CLI execution, highly blocking disk transactions, and potential lock-up delays in high-concurrency loops on low-resource machines. Applying optimal sqlite settings brings Go into absolute parity with TypeScript's writing speeds.

## Observed context

- Go database connection pool setup:
  - `pkg/db/db.go` (opens database connections and executes initialization PRAGMAs)
- TypeScript database client setup:
  - `packages/registry-database/`

## Desired outcome

Go's SQLite database client is updated to apply optimized database configurations on connection, achieving maximum write throughput and concurrent safety without risking transaction integrity.

## Acceptance criteria

- [ ] **Configure Synchronous Pragma**: Update `pkg/db/db.go`'s connection initialization to execute `PRAGMA synchronous = NORMAL;` immediately after establishing the raw connection pool.
- [ ] **Configure Busy Timeout**: Ensure `PRAGMA busy_timeout = 5000;` is executed on every database handle initialization.
- [ ] **Pool Limits Verification**: Confirm that the maximum open connection pool limits (`MaxOpenConns = 10` and `MaxIdleConns = 5`) are set correctly on the `sql.DB` instance to prevent database-locked errors under high-concurrency writes.
- [ ] **Unit testing**: Write a unit test inside `pkg/db/db_test.go` checking:
  - Querying the active connection's synchronous settings (`PRAGMA synchronous;`) returns the integer `1` (which matches `NORMAL` mode).
  - Verify concurrent writes run successfully without lock-up crashes.
- [ ] Ensure that running the command `go test ./pkg/db/...` passes with zero errors.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
