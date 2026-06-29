---
created_on: 2026-06-27 12:00
last_modified: 2026-06-28 12:00
status: current
ticket_status: closed
---

# Wave 9: Resolve TrackedFileSystem Recursive Remove State Bug

## Problem

In `TrackedFileSystem.RemoveAll` (`pkg/fs/tracked_fs.go`), when a directory is deleted recursively on the host, the system only writes a single database operation for the parent directory itself:

```go
err = t.fs.RemoveAll(path)
if err != nil {
    return err
}
return t.recordOperation("removeAll", path, nil, nil, nil)
```

In contrast, the legacy TypeScript implementation scanned the directory recursively and recorded distinct `rm` database operation records for all nested files individually. Because Go's database tracker fails to record these nested deletions, they are never marked as purged/inactive in the SQLite `registry.db`. This causes `GetFileStatesForTool` to falsely report deleted nested files as active, resulting in permanent database state drift and broken uninstallation behaviors.

## Why this matters

Database state integrity is paramount for dependency tracking and clean system-wide uninstallation. If the SQLite database contains active records for files that have physically been deleted, the orchestrator will try to clean up non-existent files during updates or uninstallations, generating false failures, warning spam, or leaving orphaned files on disk.

## Observed context

- Go files:
  - `pkg/fs/tracked_fs.go` (contains `RemoveAll`)
- TS reference:
  - `.workspaces/main/packages/registry/src/file/TrackedFileSystem.ts`

## Desired outcome

When `TrackedFileSystem.RemoveAll(path)` is executed, the tracker recursively scans the target directory under `fsys` (if it exists) to collect all child file paths, deletes them from the physical filesystem, and records an individual `rm` operation for every nested file and folder inside SQLite before removing the parent directory itself, matching the legacy TypeScript behavior.

## Acceptance criteria

- [x] **Recursive Directory Walking**: Before deleting a directory via `fs.RemoveAll`, use `fs.ReadDir` or a recursive walker on `t.fs` to compile a full list of all nested files, directories, symlinks, and shims under the target path.
- [x] **Individual DB Records**: Write separate `rm`/`delete` operations for each resolved child file path into the SQLite registry via `t.recordOperation`, ensuring transaction safety.
- [x] **Graceful Non-Existent Handlers**: If the directory does not exist or is empty, bypass recursive scanning and return nil safely.
- [x] **Deterministic DB State**: Ensure the final state of the database after `RemoveAll` has exactly zero active records for any of the deleted nested files.
- [x] **Unit Testing**: Add a unit test `TestTrackedFSRecursiveRemoveAll` in `pkg/fs/tracked_fs_test.go` asserting that creating a nested folder structure with multiple files, running `RemoveAll` on the parent, and inspecting the database results in database `rm` entries recorded for each nested file path.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
