---
created_on: 2026-06-23 23:35
last_modified: 2026-06-23 23:35
status: current
ticket_status: open
---

# Wave 5: Implement TrackedFileSystem State Recording

## Problem

The Go CLI currently records database tracking actions explicitly inside the orchestrator's `InstallTool` method under a generic `"shim"` type. However, the legacy TypeScript CLI uses a low-level, implicit `TrackedFileSystem` wrapper that intercepts raw filesystem writes (`WriteFile`, `chmod`, `MkdirAll`, `Remove`) and records separate, granular `"writeFile"`, `"chmod"`, `"mkdir"`, and `"rm"` rows in `registry.db`.

This difference causes an inherent mismatch in `db_file_operations.json` during dry-run validations, preventing the Go CLI from passing the byte-for-byte dual-run parity harness gates (`bun check:ci`).

## Why this matters

Absolute, zero-compromise state parity is required before replacing and shipping the Go line to end users. A low-level, implicit file event tracking database wrapper ensures that the Go CLI matches TS's exact transactional log entries (including calculated file sizes, file types, operation types, and decimal Unix permissions like `"493"` / `"438"`) flawlessly, guaranteeing zero state-tracking regression.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 3, Section 4, and Section 8.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/fs/fs.go` (introduce `TrackedFileSystem` and database context interfaces)
  - `pkg/fs/tracked_fs.go` (implement the `TrackedFileSystem` wrapper struct)
  - `pkg/orchestrator/orchestrator.go` (remove explicit database tracking for file operations and use the `TrackedFileSystem` instead)

## Desired outcome

A Go-native `TrackedFileSystem` wrapper in `pkg/fs` that wraps any raw `FS` interface, intercepts file and directory creation, modification, removal, and permission changes, and automatically writes granular transactional operations (`writeFile`, `chmod`, `mkdir`, `rm`) with precise calculated sizes and permissions to `registry.db`.

## Acceptance criteria

- [ ] Define the `TrackedFileSystem` struct in a new file `pkg/fs/tracked_fs.go` that implements the `fs.FS` (or custom `FS`) interface.
- [ ] `TrackedFileSystem` must intercept low-level writes:
  - `WriteFile` / `Create` must automatically log a `"writeFile"` operation to `registry.db` with the precise calculated byte-size of the written file.
  - `Chmod` / `Chmod` operations must automatically log a `"chmod"` operation with decimal Unix permission strings (e.g., `"493"` for `0o755` executable permissions, `"438"` for `0o644` read-write permissions).
  - `MkdirAll` must automatically log a `"mkdir"` operation.
  - `Remove` / `RemoveAll` must automatically log a `"rm"` operation.
- [ ] Remove manual file operations database tracking in `pkg/orchestrator/orchestrator.go` and ensure file logging occurs implicitly through the `TrackedFileSystem` wrapper.
- [ ] Write unit tests inside `pkg/fs/tracked_fs_test.go` asserting that writing and chmod'ing files through the `TrackedFileSystem` wrapper automatically records correct rows in the database registry.
- [ ] Run `bun check` and `bun check:ci` to verify that Go registry database files (`db_file_operations.json`) match TS output precisely.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
