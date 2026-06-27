---
created_on: 2026-06-26 17:00
last_modified: 2026-06-26 17:00
status: current
ticket_status: open
---

# Wave 7: Package and Distribute Fluent DSL Typings as NPM Package

## Problem

Because all of the legacy TypeScript packages (including `packages/core` and `packages/cli`) have been demolished on this branch, users who author `.tool.ts` configurations will lose all IDE autocomplete, inline compiler checks, and type safety.

The type generation script `scripts/typegen/main.go` only outputs raw static JSON interface maps (`types.gen.ts`). It completely lacks the fluent builder declarations (`defineTool`, `.bin()`, `.zsh()`, `.hook()`, `IFileSystem`) necessary to write configuration scripts. Although these declarations exist internally inside `pkg/vm/loader-api.ts` and `pkg/vm/dsl-types.ts`, they are never packaged and distributed as a public types definition package to NPM.

## Why this matters

The configuration authoring developer experience (DX) is a critical component of the project. If users lose IDE type safety and autocomplete, the barrier to writing configurations rises dramatically, and errors will only be caught during runtime evaluation inside Goja.

## Observed context

- Go VM:
  - `pkg/vm/loader-api.ts` (contains the fluent definitions)
  - `pkg/vm/dsl-types.ts`
- TS references:
  - `packages/build/` (legacy build configurations)

## Desired outcome

A lightweight, dedicated NPM package (`@alexgorbatchev/dotfiles`) is built and published. It exports the fluent builder types and ambient declarations from `loader-api.ts` and `dsl-types.ts` to restore complete autocompletion in developer IDEs.

## Acceptance criteria

- [ ] **Ambient Types Extraction**: Extract and export the complete fluent TypeScript definitions (`defineTool`, `defineConfig`, `IToolBuilder`, etc.) from `pkg/vm/loader-api.ts` and `pkg/vm/dsl-types.ts`.
- [ ] **Package Assembly**: Refactor `packages/build/` or write a script to package these typings into a lightweight NPM distribution directory under `.dist/` or similar.
- [ ] **Zero Goja Runtime Dependency**: Ensure the published package does not bundle or depend on legacy TypeScript packages, serving only as an ambient types library.
- [ ] **IDE Verification**: Verify that opening a local `dotfiles.config.ts` or `.tool.ts` resolves types from the generated package with full editor autocomplete.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
