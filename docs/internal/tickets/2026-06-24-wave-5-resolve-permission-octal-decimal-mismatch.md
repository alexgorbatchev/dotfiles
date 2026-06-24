---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:20
status: current
ticket_status: open
---

# Wave 5: Resolve Permission Octal-Decimal Mismatch in SQLite Registry

## Problem

There is a critical data-representation mismatch between Go and TypeScript when writing to and reading from the `permissions` column in `registry.db`.
* **TypeScript:** Saves and reads permissions as stringified base-10 (decimal) integers (e.g., `493` represents `0o755`, `420` represents `0o644`). When read back into memory, TS executes `parseInt(row.permissions, 10)`.
* **Go:** Saves and reads permissions as standard octal strings (e.g., `"0755"`, `"0644"`).

If a SQLite database is shared or analyzed in dual-run parity mode, Go gets string `"493"` and parses it incorrectly, while TS executes `parseInt("0755", 10)` which results in decimal `755` (equivalent to octal `0o1363`), leading to corrupted file permissions or runtime panics.

## Why this matters

Absolute, zero-compromise database and state parity is required between the compiled Go CLI and the legacy TS CLI. Sharing database states or performing live dual-runs will corrupt permission configurations across language barriers unless the representations are aligned.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md`.
- Codebase files affected:
  - `pkg/registry/registry.go` (unmarshaling and scanning of permissions column)
  - `pkg/fs/tracked_fs.go` (if implemented, writing file permissions to DB)

## Desired outcome

Go and TypeScript represent permissions identically inside the SQLite database. Go's registry methods must parse decimal permission strings from the database and marshal permissions back to base-10 stringified integers (e.g. converting `0755` into `"493"` and `0644` into `"420"`), achieving 100% database representation parity.

## Acceptance criteria

- [ ] Modify `pkg/registry/registry.go` to marshal/unmarshal permissions in base-10 (decimal) integers string format rather than octal strings.
- [ ] Add converter helpers in Go (e.g., converting `os.FileMode` to decimal string and vice versa).
- [ ] Write unit tests in `pkg/registry/registry_test.go` verifying that permissions are stored as base-10 stringified integers (e.g., `493` for `0o755`).
- [ ] Run `bun check` and `bun check:ci` to verify that Go registry database files (`db_file_operations.json`) match TS output precisely on permissions.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
