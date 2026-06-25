---
created_on: 2026-06-24 19:30
last_modified: 2026-06-24 19:45
status: current
ticket_status: closed
---

# Wave 5: Fix macOS DMG/PKG Installer Leaks and Errors

## Problem

Several critical robustness issues and resource leaks have been identified in Go's macOS `dmg` and `pkg` installer plugins:

1. **Ignored Copy Exit Codes (Bug):** The copy command in the DMG installer (`cp -R appSource appDest`) discards its error/exit code, allowing installations to silently succeed even when copying failed due to a lack of write privileges or disk space.
2. **Extracted Archive Directory Leak (Leak):** Extracted temporary subdirectories (e.g. `<tool>-extracted`) are never deleted upon installation completion, causing a host-level disk leak.
3. **Dangling Mounted DMG Images (Leak):** If an installation fails after the DMG is successfully mounted, the installer exits early without detaching/unmounting the DMG volume (`hdiutil detach`).

## Why this matters

Resolving these issues ensures that macOS installer plugins fail fast with descriptive errors rather than failing silently, and prevents polluting the host filesystem with dangling mounts and temporary files.

## Observed context

- Specified in `packages/installer-dmg` and `packages/installer-pkg`.
- Codebase files affected:
  - `pkg/installer/dmg.go` (ensure exit code validation, recursion subdirectory deletion, and mount detaching)
  - `pkg/installer/pkg.go` (ensure recursion subdirectory deletion)

## Desired outcome

The DMG installer correctly validates copying exit codes and securely unmounts/cleans up any temporary volumes and folders, even on execution failure.

## Acceptance criteria

- [x] Refactor `pkg/installer/dmg.go` to capture and validate errors from `copyCmd.Run()`, returning a formatted error on failure.
- [x] Ensure that temporary extraction subdirectories (e.g. `<tool>-extracted`) inside both `dmg.go` and `pkg.go` are recursively removed upon completion.
- [x] Implement a structured cleanup mechanism (using Go's `defer` statement) in `pkg/installer/dmg.go` to guarantee that the DMG volume is detached and unmounted if mounting was successful, even on subsequent execution errors.
- [x] Write unit tests inside `pkg/installer/dmg_test.go` and `pkg/installer/pkg_test.go` verifying the correct unmounting and directory pruning behaviors.
- [x] Run `go test ./pkg/installer/...` and ensure all tests pass completely.
- [x] **Review Instructions:** Run an independent review pass of the changes using a dedicated review workflow or review subagent, and resolve all identified issues until a completely clean review is returned.
