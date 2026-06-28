---
created_on: 2026-06-27 12:00
last_modified: 2026-06-27 12:00
status: current
ticket_status: open
---

# Wave 9: Create Go-Native Release Packaging and Ambient Types Pipeline

## Problem

Currently, the release compilation and packaging of `.dist/` is orchestrated entirely by `packages/build/src/build/build.ts` using Bun. This script is responsible for:
1. Running Go-typegen (`scripts/typegen/main.go`) to generate `types.gen.ts`.
2. Bundling visual dashboard Preact assets via Bun compiler and saving them to `pkg/dashboard/dist`.
3. Generating and combining fluent DSL declaration files (`schemas.d.ts`, `cli.d.ts`).
4. Compiling cross-platform Go binaries.
5. Packaging `.dist/` for NPM with matching multi-arch `package.json` configurations.

If we demolish the TypeScript folders under `packages/` today, **we completely lose our build, type-generation, and release compilation pipeline**, making it impossible to package or publish new versions of the Go CLI.

## Why this matters

To complete the demolition of the TypeScript codebase, the release build process must be fully ported to a Go-native builder or clean automation script. This removes legacy Node execution dependencies, streamlines local development, and ensures the Go monorepo can compile and distribute itself statically with zero dependency on the legacy TS packages.

## Observed context

- Active TS build script:
  - `packages/build/src/build/build.ts`
- Go type-generator:
  - `scripts/typegen/main.go`
- Go embedded assets:
  - `pkg/dashboard/dashboard.go` (uses `//go:embed all:dist`)

## Desired outcome

Port the entire release compilation pipeline to a Go-native compiler script (e.g., `scripts/build/main.go`) or a robust Makefile. This script will bundle Preact assets, compile types, run cross-platform Go builds, and structure the final `.dist/` directory for npm distribution, allowing the safe demolition of the legacy `packages/build` TypeScript folder.

## Acceptance criteria

- [ ] **Create Go-Native Builder**: Implement `scripts/build/main.go` to coordinate all release assembly stages.
- [ ] **Bundle Preact Assets**: Invoke `bun build` to bundle Preact dashboard files into `pkg/dashboard/dist` before invoking Go compilation (so Go's native embed directives can bundle the static frontend assets).
- [ ] **Types Concatenation Pipeline**: Automatically execute the typegen script and concatenate `pkg/vm/dsl-types.ts` and `pkg/vm/loader-api.ts` into a single, clean ambient declaration file `schemas.d.ts` inside the release output.
- [ ] **Cross-Platform Compilation**: Trigger multi-platform cross-compilations for Darwin (x64, arm64) and Linux (x64, arm64) statically, outputting them to their respective optional-dependency target folders under `.dist/packages/`.
- [ ] **NPM Packaging Structure**: Automatically write the core `.dist/package.json` and the four subpackage `package.json` configs with correct dependencies, mirroring the configuration of legacy build scripts.
- [ ] **Validation Run**: Run the new Go-native build script, verifying that the compiled binary executes cleanly with the visual dashboard active and that types compile without errors.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
