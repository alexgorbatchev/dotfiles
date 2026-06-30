---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Implement Stale, Disabled, and Orphaned Tool Cleanups

## Problem

In TypeScript, `generateAll` is a self-cleaning operation. If a user disables a tool (`disabled: true`), deletes its file entirely (creating an orphaned record in the database), or removes binaries or symlinks from its active configuration, TypeScript compares the configuration history against the database and executes `cleanupToolArtifacts`, `cleanupStaleShims`, `cleanupStaleSymlinks`, and `cleanupStaleCopies` to recursively delete obsolete files on disk.

In Go, the orchestrator has **zero cleanup logic**. If a tool is disabled, removed, or has its configurations updated, Go simply bypasses or skips processing it during the next generation run. The historical physical shims, symlinks, copies, and shell completions remain active on the user's host machine indefinitely, causing severe state bloat and orphaned symlinks pointing to deleted targets.

## Why this matters

A lack of automated cleanup turns a declarative configuration system into a purely additive one. Users modifying or disabling configurations will experience broken links, duplicate commands, and stale shell integrations because old setups are never swept.

## Observed context

- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (coordinates generation and installers)
  - `pkg/registry/registry.go` (manages the SQLite history registers)

## Desired outcome

The Go orchestrator is updated to compare incoming configuration mappings against historical database entries before processing. Any tool flagged as disabled, orphaned (deleted from config), or modified will have its stale artifacts (shims, symlinks, copies, and completions) automatically deleted from disk and purged from the SQLite file registry.

## Acceptance criteria

- [ ] Implement stale shim, symlink, and file copy cleanup logic in `pkg/orchestrator/orchestrator.go`.
- [ ] Implement orphaned tool detection by scanning database records for tools that no longer exist in the config folder, and execute `cleanupToolArtifacts` to remove all their active artifacts.
- [ ] Purge deleted file records and tool records from the SQLite registry.
- [ ] Add an E2E test in `tests/e2e/symlink_stale_test.go` or a new test verifying that disabling or deleting a tool's configuration file results in the automatic deletion of its generated shims, symlinks, and database records on the next `generate` run.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
