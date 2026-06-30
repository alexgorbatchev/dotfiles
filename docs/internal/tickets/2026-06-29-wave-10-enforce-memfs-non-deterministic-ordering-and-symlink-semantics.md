---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Enforce MemFS Deterministic Ordering and Symlink Semantics

## Problem

Go's in-memory filesystem `MemFS` (`pkg/fs/mem_fs.go`) exhibits several critical behavioral deviations from standard physical filesystems and TypeScript's `MemFileSystem` predecessor:

1. **Non-deterministic Directory Listings**: `ReadDir` iterates directly over a standard Go map to return directory entries, which results in a non-deterministic random return order. TypeScript always returns sorted directory contents alphabetically.
2. **Broken Symlink Exist Checks**: Calling `Exists` on a broken symlink in `MemFS` returns `true` (resolving the symlink node itself) instead of following the symlink to the target and returning `false` (standard OS behavior).
3. **ReadDir Error Suppression**: When `ReadDir` is called on a non-existent directory, `MemFS` silently returns an empty slice and a `nil` error, which hides missing folder issues during dry-runs.

## Why this matters

Non-deterministic directory listings cause flaky tests and unstable shell configuration script emissions. Incorrect symlink exists evaluations and silent directory listing errors can bypass sandboxing constraints and hide structural issues.

## Observed context

- Codebase files affected:
  - `pkg/fs/mem_fs.go` (implements in-memory filesystem operations)

## Desired outcome

`MemFS` is updated to guarantee deterministic, alphabetically-sorted listings, standard symlink target follow-resolution for existence checks, and standard folder existence errors during directory listings.

## Acceptance criteria

- [ ] Update `ReadDir` in `pkg/fs/mem_fs.go` to sort returning filenames alphabetically.
- [ ] Refactor `ReadDir` to return an explicit path error if the directory does not exist.
- [ ] Refactor `Exists` (and relevant stats checks) to resolve symbolic links recursively to their targets, returning `false` on broken symlinks.
- [ ] Write unit tests inside `pkg/fs/mem_fs_test.go` verifying alphabetical `ReadDir` ordering, broken symlink `Exists` evaluation, and directory read failures.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
