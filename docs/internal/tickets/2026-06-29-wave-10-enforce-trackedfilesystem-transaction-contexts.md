---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Enforce TrackedFileSystem Transaction Contexts

## Problem

In Go's `TrackedFileSystem` (`pkg/fs/tracked_fs.go`), all file mutations (such as `WriteFile`, `Remove`, `RemoveAll`, `Symlink`, etc.) execute on disk but only write metadata to the SQLite registry database if a transaction context is active:

```go
if t.tx != nil {
    // Record operation in SQLite
}
```

If `TrackedFileSystem` is initialized without an active transaction context (i.e., `t.tx` is `nil`), the database recording block is completely skipped. As a result, the filesystem operations succeed on the user's physical disk but are **silently omitted** from the registry database. This leaves the database in a stale state and prevents clean, automated uninstalls or historical tracking.

## Why this matters

The single source of truth for all system state changes is the SQLite registry. If file creations, modifications, and symlinks are written to disk without transaction logging, they cannot be tracked, updated, cleaned up, or reversed during tool uninstalls, resulting in dirty states and progressive host pollution.

## Observed context

- Codebase files affected:
  - `pkg/fs/tracked_fs.go` (contains file mutation and state tracking functions)
  - `pkg/registry/registry.go` (orchestrates sqlite database transactions)

## Desired outcome

`TrackedFileSystem` is updated to strictly enforce transaction safety. Any attempt to invoke file mutation methods (`WriteFile`, `Remove`, `RemoveAll`, `Symlink`, etc.) on a `TrackedFileSystem` instance that lacks an active transaction context must immediately halt and return a descriptive compile-time or runtime error (e.g. `ErrTransactionRequired`), instead of silently omitting the database record.

## Acceptance criteria

- [ ] Refactor `pkg/fs/tracked_fs.go` to check `t.tx == nil` on all write and delete operations.
- [ ] Return a standard `ErrTransactionRequired` error if `t.tx` is `nil` during mutations.
- [ ] Ensure that existing read-only methods (like `ReadFile`, `Exists`, `ReadDir`) can still execute successfully without a transaction context.
- [ ] Write a unit test in `pkg/fs/tracked_fs_test.go` verifying that calling `WriteFile` without a transaction fails with the expected transaction error.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
