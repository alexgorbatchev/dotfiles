---
created_on: 2026-06-26 17:00
last_modified: 2026-06-26 17:00
status: current
ticket_status: open
---

# Wave 7: Resolve TrackedFileSystem Recursive Remove State Bug

## Problem

When a directory is recursively deleted on disk using a custom file system removal command or tool uninstallations, `TrackedFileSystem.RemoveAll` in `pkg/fs/tracked_fs.go` is called:

```go
func (t *TrackedFS) RemoveAll(path string) error {
	err := removeAll(t.fsys, path)
	if err != nil {
		return err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.ops = append(t.mu.ops, FileOperation{Op: "rm", Path: path})
	return nil
}
```

This implementation only logs a **single `rm` operation for the top-level directory path**. It fails to recursively scan the folder structure and log separate `rm` operations for all nested files and sub-directories.

In contrast, the legacy TypeScript filesystem implementation recursively walked deleted directories at the application layer inside `trackDirectoryDeletion` (`packages/registry/src/file/TrackedFileSystem.ts`, lines 431-456), logging distinct `rm` database entries for every sub-file. Because Go does not do this, any query to retrieve the active tracked file states for a tool (`GetFileStatesForTool`) will continue to falsely return all nested files as active on disk, leading to severe state drift and database record corruption.

## Why this matters

Correct active file state tracking is vital to prevent orphaned configuration files on disk during tool uninstallation or upgrades. If nested files are not recorded as deleted when a folder is removed, future uninstallations or cleanup operations will fail to clean up orphans, polluting the user's host environment.

## Observed context

- Go virtual/tracked file system:
  - `pkg/fs/tracked_fs.go` (defines `RemoveAll` and trackers)
- TS file system reference:
  - `.workspaces/main/packages/registry/src/file/TrackedFileSystem.ts` (contains `trackDirectoryDeletion`)

## Desired outcome

The Go `TrackedFileSystem.RemoveAll` recursively crawls the directories in-memory or on the physical file system before deletion and logs a separate `rm` file operation record in its internal ops buffer for every nested file and sub-folder, ensuring database state alignment.

## Acceptance criteria

- [ ] **Recursive Crawl on Removal**: Update `RemoveAll` in `pkg/fs/tracked_fs.go` to recursively list all sub-entries before executing the deletion.
- [ ] **Log Separate Ops**: Append an `"rm"` file operation record to the operations slice for every discovered nested file and directory, with paths relative to the volume root.
- [ ] **Unit Testing**: Add a test in `pkg/fs/tracked_fs_test.go` asserting that removing a directory containing multiple sub-folders and files correctly appends discrete `"rm"` entries for every nested path to the operations buffer.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
