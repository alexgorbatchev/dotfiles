---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 2: CGO-Free SQLite Database and Registry

## Problem

Local tool installation state and file operation logs are currently persisted in a Bun-managed SQLite database. To ensure portable, cross-compilable, and container-ready compilation without depending on host gcc toolchains, the Go application requires a zero-dependency, pure-Go, CGO-free SQLite driver and clean database abstractions.

## Why this matters

The database tracks installed tools and files written during the generation phase. To prevent environments from entering corrupt or duplicate states, this registry must guarantee transactional, CGO-free, and concurrent database reads and writes.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 3, Section 5, and Section 7.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/db/db.go` (implement CGO-free SQLite database connector and migration execution)
  - `pkg/registry/registry.go` (implement model query functions and database schema mappings)

## Desired outcome

A fully operational, high-performance database layer that configures CGO-free connection pools, handles database schema migrations, and exposes clean, queryable models to record and inspect installer states.

## Acceptance criteria

- [ ] `pkg/db` must utilize a zero-dependency, CGO-free, pure-Go SQLite driver (`modernc.org/sqlite`) for database connections.
- [ ] `pkg/db` must manage a connection pool with reasonable connection limits and handle schema generation on database initialization.
- [ ] `pkg/registry` must model database operations mapping to `FileOperationRecord` and `ToolInstallationRecord` structs.
- [ ] All database structs must feature correct `db` tags corresponding exactly with the columns defined in Section 5 of the design document.
- [ ] `pkg/registry` must execute database writes inside transactional blocks (`sql.Tx`) to guarantee ACID properties.
- [ ] All database packages must achieve a minimum of 90% function-level test coverage.
- [ ] Unit tests for database actions must run against in-memory SQLite connection pools (`file::memory:?cache=shared`) to avoid physical state pollution.
- [ ] The work must be reviewed by a sub-agent, and all issues must be addressed until the sub-agent reviewing the code returns no further issues.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
