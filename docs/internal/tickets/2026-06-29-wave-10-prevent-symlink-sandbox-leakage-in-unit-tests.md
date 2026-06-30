---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Prevent Symlink Sandbox Leakage in Unit Tests

## Problem

During the execution of unit tests, the virtual filesystem sandbox (`MemFS`) is intended to isolate all filesystem operations, protecting the developer's host machine.

However, due to a preflight check bypass in `cmd/dotfiles/bootstrap.go` or orchestrator setup, when unit tests run with `dryRun = false`, the system fails to initialize the virtual filesystem symlink evaluator correctly. Consequently, symlink and file creation operations bypass the memory sandbox and write physical symbolic links directly to the developer's real host machine, polluting local workspaces and folders.

## Why this matters

Unit tests must be 100% isolated, non-destructive, and fast. Writing real files and symlinks directly to the host filesystem during tests risks corrupting local workspace structures, violating the principle of containment, and leading to flaky or host-dependent test runs.

## Observed context

- Go files:
  - `cmd/dotfiles/bootstrap.go` (preflight setup)
  - `pkg/fs/mem_fs.go` (in-memory filesystem)
  - `pkg/fs/tracked_fs.go` (decorator wrapping the filesystem)
  - `tests/e2e/` (integration test suites)

## Desired outcome

All test suites and dry-run paths are strictly contained within their respective sandboxes (either `MemFS` or a managed temporary directory workspace like `t.TempDir()`), with zero physical modifications (symlinks or directory creation) leaking to the host system.

## Acceptance criteria

- [ ] **Enforce MemFS Sandboxing**: Audit and refactor the preflight checks in `bootstrap.go` and the test helpers to ensure that when `dryRun` or test environments are active, all filesystem operations—especially symlink and directory creations—are strictly bound to the `MemFS` or an isolated virtual directory, completely disabling physical disk writes.
- [ ] **Fix Unit Test Setup Hooks**: Ensure that the E2E test runner dynamically hooks the filesystem wrapper and never instantiates `OSFS` with direct write permissions on the host system root during test assertions.
- [ ] **Verify Symlink Isolation**: Add a dedicated validation test in `pkg/fs/mem_fs_test.go` or `tests/e2e/sandbox_test.go` that attempts to create an absolute symlink during a mock generation run, asserting that the physical host remains untouched while the virtual symlink is correctly recorded in `MemFS`.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
