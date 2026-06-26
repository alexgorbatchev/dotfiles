---
created_on: 2026-06-26 10:30
last_modified: 2026-06-26 10:30
status: current
ticket_status: open
---

# Wave 6: Transition to Standard Goja Engine and Unify TypeScript DSL Types

## Problem

Currently, the configuration loading and evaluation pipeline relies on Grafana's specialized load-testing fork **Sobek** (`github.com/grafana/sobek`). Because of Sobek's divergent package paths and internal types, we are unable to leverage standard Goja-compatible ecosystem libraries such as **`github.com/dop251/goja_nodejs/require`**.

Additionally, this packaging split forces our build pipeline to duplicate and hardcode public-facing TypeScript autocomplete type signatures as static, plain-string templates inside `packages/build/src/build/steps/generateSchemaTypes.ts`, which prevents `pkg/vm/loader-api.ts` from reusing them and introduces severe type-maintenance risks and contract-drift regressions.

## Why this matters

Migrating our Go-native JS engine to standard **Goja** (`github.com/dop251/goja`) resolves these type-system barriers. It allows us to integrate the official `goja_nodejs/require` CommonJS module loader to support dynamic, relative file resolutions and module caching natively inside the VM, while unifying our TypeScript DSL definitions inside a single, shared, JSDoc-documented source of truth on disk.

## Observed context

- Specified in `docs/internal/eng-designs/goja-migration.md`.
- Architectural Decision Record: `docs/internal/eng-designs/goja-migration.md`.
- Codebase files affected:
  - `go.mod` (The root Go module)
  - `pkg/vm/loader.go` (loads and executes configuration scripts)
  - `pkg/vm/bindings.go` (registers Go-to-JS bindings)
  - `pkg/vm/vm.go` (helper execution wrappers)
  - `packages/build/src/build/steps/generateSchemaTypes.ts` (type generation script)
  - `pkg/vm/dsl-types.ts` (TypeScript types definition file)

## Desired outcome

The monorepo's JS engine is fully migrated to standard Goja with `goja_nodejs/require` support, allowing `loader-api.ts` and user tool configurations to resolve relative imports dynamically at runtime. The TypeScript DSL types are fully unified inside `pkg/vm/dsl-types.ts`, removing all hardcoded string templates from the build pipeline.

## Acceptance criteria

- [ ] **Migrate Go Imports to Goja**: Replace all imports of `github.com/grafana/sobek` with `github.com/dop251/goja` in `go.mod`, `go.sum`, and all `pkg/vm/` files.
- [ ] **Integrate `goja_nodejs/require`**: Wire up the official Node-compatible CommonJS `require` registry inside `pkg/vm/loader.go` to support runtime imports and module caching.
- [ ] **Unify TypeScript DSL Types**: Keep `pkg/vm/dsl-types.ts` as the single, clean, JSDoc-annotated source of truth for public authoring types, and have both `generateSchemaTypes.ts` and `loader-api.ts` reuse them.
- [ ] **Validate Parity**: Ensure `bun fix`, `bun typecheck`, and `bun check` pass successfully with zero type or lint warnings.
- [ ] **Unit and E2E Tests**: Run `go test ./...` verifying that all package unit tests and 14 E2E test suites compile and pass with 100% success on the standard Goja engine.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
