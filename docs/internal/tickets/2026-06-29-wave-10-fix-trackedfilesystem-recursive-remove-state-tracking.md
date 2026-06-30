---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Fix TrackedFileSystem Recursive Remove State Tracking

## Problem

When a directory is recursively deleted on disk using `fsys.RemoveAll`, Go's `TrackedFileSystem.RemoveAll` implementation only records a single `"rm"` operation in the SQLite registry database targeting the top-level parent folder.

In contrast, the original TypeScript implementation recursively walks the target folder first, recording distinct `"rm"` entries in the file registry for every single nested file and subdirectory deleted, before deleting the parent folder itself.

By omitting nested file records, Go's implementation leaves those deleted nested paths registered as "active" or "installed" inside the SQLite database, causing permanent database state drift and visual discrepancies on the dashboard client.

## Why this matters

If the SQLite registry database records files as active when they have been physically deleted, subsequent installer checks, uninstallation steps, and dashboard visualizations will read corrupt and obsolete state data.

## Observed context

- Codebase files affected:
  - `pkg/fs/tracked_fs.go` (implements `RemoveAll` and recursive file recording)
  - `packages/file-system/src/TrackedFileSystem.ts` (TypeScript predecessor implementing correct post-order recursive file recording)

## Desired outcome

`TrackedFileSystem.RemoveAll` is upgraded to recursively traverse the directory being deleted, recording a distinct `"rm"` database entry for every nested file and subfolder in post-order (child items first, parent folder last), matching TypeScript's behavior and guaranteeing database accuracy.

## Acceptance criteria

- [ ] Update `RemoveAll` inside `pkg/fs/tracked_fs.go` to scan directories recursively before deletion.
- [ ] Record a distinct database entry for all nested files and subdirectories.
- [ ] Order database registration in post-order (inner files first, outer folder last).
- [ ] Add a unit test in `pkg/fs/tracked_fs_test.go` asserting that recursively deleting a directory with nested files records distinct delete records for each file in the database.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
