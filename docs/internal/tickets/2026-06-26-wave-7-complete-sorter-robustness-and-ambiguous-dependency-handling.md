---
created_on: 2026-06-26 17:00
last_modified: 2026-06-26 17:00
status: current
ticket_status: open
---

# Wave 7: Complete Sorter Robustness and Ambiguous Dependency Handling

## Problem

There are two major functional discrepancies in the topological dependency sorter:

1. **Over-Aggressive Ambiguous Dependency Check**: In `pkg/orchestrator/orchestrator.go` (lines 112-115), if _any_ two tools define identical binary names (e.g. `helper`), Go immediately throws a hard ambiguous dependency error, even if no other tool in the workspace actually depends on that binary name. TS tracks binary providers in a `Set<string>` and only throws an error if some tool actually depends on that binary name and the set has multiple entries.
2. **Sorting Determinism and Output Stability**: TS implements a deterministic `insertOrdered` priority queue that inserts freed zero-in-degree nodes back into the queue based on their **original configuration indices**, maintaining stable configuration ordering across unrelated parallel branches. Go uses a standard slice queue, resulting in unstable, map-traversal-dependent wave orderings.

## Why this matters

Over-aggressive sorting failures make user configurations extremely brittle and prone to crashing on unrelated parallel tools. Stable, deterministic topological sorting is critical for guaranteeing repeatable shell environment emissions and reproducible installations.

## Observed context

- Go Sorter:
  - `pkg/orchestrator/orchestrator.go` (contains sorting logic and `binaryProviders` registration)
- TS Sorter:
  - `.workspaces/main/packages/generator-orchestrator/src/orderToolConfigsByDependencies.ts`

## Desired outcome

Go's dependency sorter matches the robust, lenient, and stable sorting behaviors of the TypeScript engine, resolving ambiguous dependency constraints only when dependent, and ensuring deterministic, stable output ordering.

## Acceptance criteria

- [ ] **Deferred Ambiguity Resolution**: Refactor `pkg/orchestrator/orchestrator.go` to register binary providers as a list of strings (`map[string][]string`) and only throw an ambiguous dependency error if a tool actually depends on that binary and there are multiple providers.
- [ ] **Deterministic Sorting Queue**: Refactor the topological sort loop to prioritize zero-in-degree nodes based on their original configuration indices, guaranteeing 100% stable output orderings identical to TS.
- [ ] **Unit Testing**: Add tests inside `pkg/orchestrator/orchestrator_test.go` asserting that overlapping binaries across unrelated tools do not crash sorting, and that parallel independent branches resolve deterministically.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
