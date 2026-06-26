---
created_on: 2026-06-25 14:20
last_modified: 2026-06-25 14:20
status: current
ticket_status: closed
---

# Wave 6: Integrate fsys CopyFile and Prevent Sandboxing Bypass on Direct Copies

## Problem

To support safe `--dry-run` executions and comprehensive unit test verification, the monorepo utilizes an virtualized filesystem abstraction (`fs.FS` or `fsys`).

However, multiple Go packages currently bypass this abstraction, making direct OS-level writes or copies that bypass virtual `MemFS` boundaries:

1. **Missing `CopyFile` in FS Interface**: Go's core `FS` interface (`pkg/fs/fs.go`) has no copy-file signature.
2. **Hardcoded Command Spawning**: In `pkg/installer/dmg.go` (lines 258-260), the dmg installer copies `.app` bundles from mounted volumes to `/Applications` by spawning hardcoded OS-level shell commands (`cp -R appSource appDest`).
3. **Hardcoded standard library File Operations**: In `pkg/archive/archive.go`'s `copyDir` helper (lines 509-525), the file copying logic walks physical directories on the host operating system using `filepath.Walk` and opens source files via Go's standard library `os.Open` instead of calling `fsys.Open`.

Because these methods bypass the `fsys` abstraction, **any `--dry-run` execution or test suite execution will actively copy, write, and modify files on the developer's live local disk**, violating sandbox security and potentially corrupting the host machine.

## Why this matters

The core design principle of virtual filesystems is absolute containment. Bypassing the FS virtual boundary exposes the user's physical host system to unintended disk modification during a `--dry-run` or test execution. Standardizing all file manipulations (including directory copy operations) behind the `fsys` interface preserves absolute containment and guarantees test safety.

## Observed context

- Go virtual file system structures:
  - `pkg/fs/fs.go` (defines the `FS` interface)
  - `pkg/fs/os_fs.go` (physical OS implementation)
  - `pkg/fs/mem_fs.go` (virtual in-memory implementation)
- Filesystem bypasses in installers:
  - `pkg/installer/dmg.go` (uses physical `cp -R` commands)
  - `pkg/archive/archive.go` (uses `os.Open` inside directory-copy helpers)

## Desired outcome

Go's virtual filesystem interface is extended with copy methods, and all installer plugins and archive-handling helpers are refactored to execute files manipulations exclusively through the `fsys` abstraction, achieving 100% sandboxing coverage for copy operations.

## Acceptance criteria

- [x] **Extend FS Interface**: Add `CopyFile(src, dest string) error` to Go's core `FS` interface in `pkg/fs/fs.go`:
  - Implement the method in `pkg/fs/os_fs.go` using standard stream copies (`io.Copy`).
  - Implement the method in `pkg/fs/mem_fs.go` by copying stored byte buffers between in-memory file nodes.
- [x] **Refactor Archive Copying**: Replace the standard library `os.Open` and `filepath.Walk` calls inside `pkg/archive/archive.go`'s directory-copy helper with sandboxed `fsys.Open` and virtualized walking helpers, ensuring nested copying runs entirely inside `MemFS` if injected.
- [x] **Refactor DMG Installer**: Refactor `pkg/installer/dmg.go`'s application bundler copies to utilize `fsys.CopyFile` (or virtual directory copies) instead of spawning standard shell `cp -R` subprocesses.
- [x] **Unit and E2E Tests**: Write test cases in `pkg/archive/archive_test.go` and `pkg/installer/dmg_test.go` asserting:
  - Running copy operations on a mocked `MemFS` volume updates only the virtual in-memory map with zero physical disk changes.
  - Verification: `go test ./pkg/archive/...` and `go test ./pkg/installer/...` return clean successes.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
