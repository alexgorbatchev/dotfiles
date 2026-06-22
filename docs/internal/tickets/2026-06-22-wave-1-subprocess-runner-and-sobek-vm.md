---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 1: Subprocess Execution Driver, Sobek JavaScript VM Sandboxed Environment, and Type Generator

## Problem

Legacy tools are configured using TypeScript-based `.tool.ts` definitions. To support these without requiring external runtime engines like Node.js or Bun on end-user machines, the system needs an embedded JavaScript execution engine. Additionally, terminal executions must be mockable to achieve 90% test coverage, and TypeScript configurations must remain perfectly synchronized with Go structs to prevent type-safety drift.

## Why this matters

Executing `.tool.ts` configurations dynamically and sandboxing shell executions are core requirements of the installation orchestrator. Type-safe configuration binding ensures that Go structures and TypeScript types are defined from a single source of truth, eliminating runtime marshaling and deserialization bugs.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 1, Section 3, Section 6, and Section 7.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/exec/exec.go` (define the CommandRunner interface and Cmd types)
  - `pkg/exec/os_runner.go` (implement system subprocess runner wrapping `os/exec`)
  - `pkg/exec/mock_runner.go` (implement mock CommandRunner for testing)
  - `pkg/vm/vm.go` (implement Sobek JavaScript VM initialization and runner)
  - `pkg/vm/bindings.go` (implement global JS-to-Go binding callbacks)
  - `pkg/vm/embed_gen.go` (embed compiled `.tool.js` script definitions using `//go:embed`)
  - `scripts/typegen/main.go` (implement type generator CLI script)

## Desired outcome

An isolated execution layer that compiles `.tool.ts` files into Javascript during the build phase, embeds them inside the compiled Go binary, runs them inside an embedded Sobek VM at runtime, and synchronizes the configuration schemas with Go-to-TypeScript type generation during development.

## Acceptance criteria

- [ ] `pkg/exec` must define the `CommandRunner` and `Cmd` interfaces to abstract terminal commands.
- [ ] `pkg/exec/os_runner.go` must implement `CommandRunner` using the native `os/exec` package.
- [ ] `pkg/exec/mock_runner.go` must implement `CommandRunner` to allow mocking of CLI command outputs and testing command arguments.
- [ ] `pkg/vm` must initialize the pure-Go **Sobek** (`github.com/grafana/sobek`) JavaScript VM.
- [ ] `pkg/vm` must export `EvaluateToolDefinition` to execute bundled JavaScript scripts in the Sobek VM and marshal output directly into Go config structures.
- [ ] `pkg/vm/bindings.go` must register and expose essential Go utility functions (like platform indicators, OS paths, and helpers) directly inside the Sobek global context.
- [ ] `pkg/vm/embed_gen.go` must utilize `//go:embed` directives to load pre-bundled `.tool.js` assets from `pkg/vm/dist/`.
- [ ] `scripts/typegen` must compile a binary that executes `typescriptify-golang-structs` to convert `pkg/config/config.go` structs into equivalent TypeScript interfaces at `packages/core/src/types.gen.ts`.
- [ ] The generated JavaScript files in `pkg/vm/dist/` must be excluded in `.gitignore` to prevent pre-compiled bundles from being checked into the repository.
- [ ] Every package in this ticket must be covered by unit tests, achieving a minimum of 90% function-level coverage.
- [ ] All VM execution tests must run against static mock scripts embedded in testing tables rather than referencing external files.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
