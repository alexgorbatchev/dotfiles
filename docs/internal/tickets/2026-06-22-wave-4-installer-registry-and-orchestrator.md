---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 4: Package Installer Registry Driver and Topological Dependency Orchestrator

## Problem

Dynamic installation plugins and dependency-solving orchestration are handled via complex async functions in TypeScript. The rewritten Go system needs a strongly-typed, thread-safe central plugin registry and an orchestration driver capable of topological sorting of dependencies.

## Why this matters

Users configure complex hierarchies of tools where package configurations must install in a safe, resolved dependency order. A robust topological sorting engine and stable plugin registration driver prevent cycle-deadlocks and mismatched installs.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 4, Section 6, and Section 7.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/installer/installer.go` (implement installer plugin registration driver and Installer interfaces)
  - `pkg/orchestrator/orchestrator.go` (implement topological dependency resolver and multi-step installer pipeline)

## Desired outcome

A central registry mapping installer names to native `Installer` implementations, coupled with a topological sorting orchestrator that executes installer pipelines and records state updates inside the database.

## Acceptance criteria

- [ ] `pkg/installer` must expose the core `Installer` interface defined in Section 6 of the design document.
- [ ] `pkg/installer` must provide a thread-safe registry to register and fetch installer implementations.
- [ ] `pkg/orchestrator` must implement a topological dependency solver algorithm using Kahn's algorithm or Depth-First Search to verify cycles and establish installation order.
- [ ] `pkg/orchestrator` must coordinate downloading, unpacking, symlinking, shimming, and database entry insertion sequentially per tool config.
- [ ] If any installer plugin returns `supportsSudo(): true`, both `.sudo()` JSDoc blocks in `packages/core/src/builder/builder.types.ts` must be updated to keep them synchronized.
- [ ] All packages in this ticket must achieve a minimum of 90% function-level test coverage.
- [ ] Orchestration tests must mock file-system, downloader, and subprocess runners completely.
- [ ] The work must be reviewed by a sub-agent, and all issues must be addressed until the sub-agent reviewing the code returns no further issues.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
