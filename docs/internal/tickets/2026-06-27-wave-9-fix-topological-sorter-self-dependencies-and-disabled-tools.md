---
created_on: 2026-06-27 12:00
last_modified: 2026-06-27 12:00
status: current
ticket_status: open
---

# Wave 9: Fix Topological Sorter Self-Dependencies and Disabled Tools

## Problem

In `pkg/orchestrator/orchestrator.go`, multiple severe discrepancies exist inside the topological dependency sorter compared to the legacy TypeScript implementation:

1. **Self-Dependency Cycle Crashes**: In the original TS codebase, a tool depending on its own name or its own provided binary is gracefully ignored. In Go, self-dependencies are not filtered. If a tool defines a dependency on its own name, Go increments the in-degree of that tool (`inDegree[tool.Name]++`). Since the in-degree can never reach zero, the tool is never queued, and the orchestrator immediately crashes with a cycle detection error:
   ```go
   return nil, fmt.Errorf("dependency cycle detected among tools: %s", ...)
   ```
2. **Disabled Tools Sorter Crashes**: In TS, disabled tools and hostname-mismatched configurations are pruned *before* topological sorting takes place. Go's orchestrator executes sorting on the raw, unfiltered configurations slice. If a disabled tool contains a circular, missing, or ambiguous dependency, the sorter will crash the entire CLI program, even though the user explicitly disabled the tool to prevent any execution.

## Why this matters

Bootstrapping installers often declare dependencies on themselves (e.g. to specify their own binaries in pre-flight checks). Declaring these or disabling broken configs is a standard practice. Crashing on self-dependencies or disabled tools represents a major regression that breaks otherwise valid dotfiles repositories.

## Observed context

- Go files:
  - `pkg/orchestrator/orchestrator.go` (contains `TopologicalSort` and `GenerateTools` / `InstallTools`)
- TS reference:
  - `.workspaces/main/packages/generator-orchestrator/src/orderToolConfigsByDependencies.ts`
  - `.workspaces/main/packages/generator-orchestrator/src/GeneratorOrchestrator.ts`

## Desired outcome

Refactor the Go topological sorter and orchestrator pipelines to ignore self-dependencies gracefully and prune disabled or hostname-mismatched tools *before* topological sorting or cycle-checks are executed.

## Acceptance criteria

- [ ] **Filter Self-Dependencies**: Update the topological dependency builder in `pkg/orchestrator/orchestrator.go` to ignore self-dependencies. If a tool declares a dependency matching its own name, bypass incrementing its in-degree.
- [ ] **Prune Before Sort**: In `GenerateTools` and `InstallTools`, filter and prune all disabled tools and configurations whose `hostnames` do not match the current machine *before* invoking `TopologicalSort`.
- [ ] **Preserve Queue Order Determinism**: Ensure that sorting remains stable and deterministic, matching the priority orderings of original configurations.
- [ ] **Unit Testing**: Add unit tests inside `pkg/orchestrator/orchestrator_test.go` asserting that:
  - A tool declaring a self-dependency executes and sorts cleanly without cycle errors.
  - A disabled tool with a circular dependency is successfully pruned and does not crash the sorting process of other active tools.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
