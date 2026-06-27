---
created_on: 2026-06-26 17:00
last_modified: 2026-06-26 17:00
status: current
ticket_status: open
---

# Wave 7: Implement Content Change Skip in TrackedFileSystem

## Problem

Currently, when the Go `TrackedFileSystem.WriteFile` is called, it always performs the physical write and records a database entry:

```go
func (t *TrackedFS) WriteFile(name string, data []byte, perm os.FileMode) error {
	err := t.fsys.WriteFile(name, data, perm)
	if err != nil {
		return err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.ops = append(t.ops, FileOperation{Op: "write", Path: name, Perm: perm})
	return nil
}
```

This executes redundant system I/O and creates duplicate operation records in the database, even if the file already exists and its content is identical to the data being written.

The legacy TypeScript implementation (`packages/registry/src/file/TrackedFileSystem.ts`, lines 156-175) performs a content comparison: if a file exists, it reads its current content and **skips the file write and database logging** if the new content matches the existing content.

## Why this matters

Idempotence and performance are core to dotfile installations. Skipping redundant file writes minimizes disk wear, speeds up the generation and bootstrap processes, and avoids bloating the SQLite database with duplicate log records for unchanged files.

## Observed context

- Go files:
  - `pkg/fs/tracked_fs.go` (contains `WriteFile`)
- TS files:
  - `.workspaces/main/packages/registry/src/file/TrackedFileSystem.ts`

## Desired outcome

Go's `TrackedFileSystem.WriteFile` matches the TypeScript behavior by verifying if the target file exists and has identical content before performing write and record operations.

## Acceptance criteria

- [ ] **Content Comparison Guard**: In `tracked_fs.go`, modify `WriteFile` to first check if the file exists using `fsys.Exists(name)`.
- [ ] **Content Matching**: If it exists, read its current content with `fsys.ReadFile(name)`. If the content matches the new data exactly, return immediately without invoking `WriteFile` or recording an operation.
- [ ] **Unit Testing**: Add a test in `pkg/fs/tracked_fs_test.go` confirming that writing identical content to an existing file skips executing the file system write and logging.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
