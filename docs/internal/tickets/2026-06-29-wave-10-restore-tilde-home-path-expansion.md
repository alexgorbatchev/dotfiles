---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Restore Tilde Home Path Expansion

## Problem

TypeScript's filesystem uses a `ResolvedFileSystem` wrapper that intercepts all path parameters and automatically expands home shortcuts (`~` and `~/`) to the user's home directory.

Although Go defines an `ExpandHomePath` utility, it is **never invoked anywhere in the filesystem packages (`pkg/fs/`) or installer pipelines**. If a configuration uses paths targeting home shortcuts (e.g. `~/bin/binary` or `~/.config/app`), Go writes a literal directory named `~` in the active working directory or fails to write files entirely.

## Why this matters

The tilde character (`~`) is standard in UNIX configurations. Excluding tilde expansion forces users to define rigid, absolute paths or complex environment variables, breaking backward compatibility and drop-in parity for user-authored configurations.

## Observed context

- Codebase files affected:
  - `pkg/fs/fs.go` (defines file system interfaces)
  - `pkg/fs/os_fs.go` (implements physical filesystem calls)
  - `pkg/utils/utils.go` (declares paths utilities including `ExpandHomePath`)

## Desired outcome

Integrate `ExpandHomePath` automatically across the file system abstraction. All physical filesytem operations on `OSFS` and `TrackedFileSystem` will automatically parse and expand `~` and `~/` targets to the user's active home directory.

## Acceptance criteria

- [ ] Integrate home expansion into path resolution inside `pkg/fs/os_fs.go`.
- [ ] Ensure that `TrackedFileSystem` also expands paths correctly so that database entries record absolute, resolved paths.
- [ ] Add a unit test verifying that writing to `~/test-file-expansion.txt` writes the file directly to the user's home directory and resolves the path correctly in Go.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.

```

```
