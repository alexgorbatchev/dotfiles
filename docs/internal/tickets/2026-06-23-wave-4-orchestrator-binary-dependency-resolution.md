---
created_on: 2026-06-23 11:30
last_modified: 2026-06-23 11:30
status: current
ticket_status: open
---

# Wave 4: Orchestrator Binary-to-Tool Dependency Resolution Alignment

## Problem

The Go topological dependency solver (`pkg/orchestrator/orchestrator.go`) currently resolves dependencies directly based on tool names. However, user tool configurations and `.tool.ts` files declare dependencies on standard command-line binary names (such as `cargo`, `git`, or `node`) rather than tool names.

Without an orchestrator translation layer that maps binary names to their respective provider tools, dependencies cannot be resolved, resulting in missing dependency errors or sorting failures when attempting to install tools.

## Why this matters

Prerequisite tools (like compilers, runtimes, or package managers) must be fully installed and active before dependent tools can be processed. A robust binary-to-tool translation layer ensures that the Go codebase mirrors the legacy TypeScript dependency ordering logic (`orderToolConfigsByDependencies.ts`) perfectly, preventing cycle-deadlocks, order violations, and runtime install failures.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 4 and Section 12.
- Legacy TypeScript implementation: `packages/generator-orchestrator/src/orderToolConfigsByDependencies.ts`.
- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (enhance `TopologicalSort` to map binaries to provider tools)
  - `pkg/orchestrator/orchestrator_test.go` (verify binary dependency mapping and sorting)

## Desired outcome

An enhanced, deterministic dependency sorting engine in `pkg/orchestrator` that scans the binaries provided by each tool config, constructs an in-memory binary provider registry, maps binary dependencies to tool dependencies, and topologically sorts the configurations sequentially.

## Acceptance criteria

- [ ] `pkg/orchestrator` must dynamically build a `binaryProviders` map (`map[string]string`) linking each binary name to the tool configuration that provides it.
- [ ] If a tool declares no binaries explicitly, it must be treated as providing a binary named after itself (i.e. tool name).
- [ ] If a binary name is declared as provided by multiple tool configurations, `TopologicalSort` must return a clear, descriptive error indicating an ambiguous dependency.
- [ ] If a tool declares a dependency on a binary name that is not provided by any configured tool, `TopologicalSort` must return an error indicating a missing dependency.
- [ ] Kahn's algorithm or DFS must be used to resolve dependency order based on translated tool-level dependencies.
- [ ] Unit tests in `pkg/orchestrator/orchestrator_test.go` must assert:
  - Successful binary-to-tool resolution and sorting.
  - Error on ambiguous binary dependencies (multiple providers).
  - Error on missing binary dependencies (no providers).
- [ ] Unit tests for `pkg/orchestrator` must maintain a minimum of 90% function-level coverage.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
