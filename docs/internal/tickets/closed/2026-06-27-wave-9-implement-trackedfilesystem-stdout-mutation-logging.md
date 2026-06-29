---
created_on: 2026-06-27 12:00
last_modified: 2026-06-28 12:00
status: current
ticket_status: closed
---

# Wave 9: Implement TrackedFileSystem Stdout Mutation Logging

## Problem

The legacy TypeScript implementation of `TrackedFileSystem` generates detailed, user-facing stdout logs whenever filesystem modifications occur:

```typescript
if (!fileExists) {
  this.logInfo(messages.fileCreated(contractHomePath(this.projectConfig.paths.homeDir, filePath)));
} else {
  this.logInfo(messages.fileUpdated(contractHomePath(this.projectConfig.paths.homeDir, filePath)));
}
```

This generates transparent console outputs like: `write ~/.bashrc` or `ln -s /source /dest`.

In the Go implementation:

- `TrackedFileSystem` (`pkg/fs/tracked_fs.go`) has **no logger** and generates **zero stdout output**.
- All file writes, symlinks, and directory deletions execute completely silently. Only database writes occur.

**The Parity Failure:** The Go CLI operates as a silent black box during installations. Downstream script integrations or test suites that parse stdout output are broken, violating the drop-in parity standard.

## Why this matters

Visual feedback is a core requirement of a CLI. Users need to see exactly what files are being written, symlinked, updated, or removed during configuration generation to verify correctness and trust the installer's operations.

## Observed context

- Go files:
  - `pkg/fs/tracked_fs.go` (defines `TrackedFileSystem` and file operations)
- TS reference:
  - `.workspaces/main/packages/registry/src/file/TrackedFileSystem.ts`

## Desired outcome

Inject a structured logger into `TrackedFileSystem` and implement standard user-facing console log statements for every file write, deletion, or symlinking operation, matching the legacy TypeScript output format.

## Acceptance criteria

- [x] **Inject Logger**: Update the initialization of `TrackedFileSystem` (and all callers) to accept a pointer to a structured logger (`*logger.Logger` from `pkg/logger/`).
- [x] **Log File Creations/Updates**: In `WriteFile`, check if the file exists. Log a `write` message containing the contracted user home path (e.g. `write ~/.bashrc`) upon successful write.
- [x] **Log Symlink Operations**: In `Symlink`, log an `ln -s` message representing the link creation.
- [x] **Log File/Directory Deletions**: In `Remove` and `RemoveAll`, log `rm` messages.
- [x] **Contract Home Paths**: Implement a helper function `ContractHomePath` (matching TS's `contractHomePath`) to format paths using the tilde prefix (`~`) when they reside inside the user's home directory.
- [x] **Unit Testing**: Add unit tests inside `pkg/fs/tracked_fs_test.go` utilizing a mock test logger to assert that:
  - Writing a new file logs `write ~/.test_file` (matching the exact expected string format).
  - Creating a symlink logs the correct source and destination targets.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
