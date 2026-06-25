---
created_on: 2026-06-25 09:30
last_modified: 2026-06-25 09:30
status: current
ticket_status: open
---

# Wave 6: Transition to Pure Go Binary Distribution and TS Packages Demolition

## Problem

The repository is currently in a transitional hybrid state. While the Core Go application engine, Cobra CLI commands, SQLite connection pool, and E2E test suites are fully implemented in Go 1.26, we are still maintaining over 40+ legacy TypeScript packages under `packages/*` (including `@dotfiles/core`, `@dotfiles/cli`, `@dotfiles/config`, `@dotfiles/registry`, and 15+ installer plugins).

The legacy React-based logs dashboard server still runs on a Bun-based server (`packages/dashboard/src/server/`) and relies heavily on TypeScript types imported from these deleted packages. To complete the migration to a high-performance Go-native codebase, we need to:

1. Separate and consolidate the types needed for the dashboard UI, while maintaining 100% full, complete type signatures inside our public `.d.ts` definitions.
2. Port the dashboard's REST `/api/*` endpoints to the Go-native dashboard server (`pkg/dashboard/dashboard.go`) and delete the Bun-based backend.
3. Restructure `packages/build` to bundle the dashboard frontend client, compile the Go binary directly, generate types directly from Go structs and public API contracts, and package `.dist/` cleanly for npm distribution.
4. Safely delete all legacy TypeScript packages, clean up workspace definitions, and transition all CI checks to rely entirely on Go and the remaining `dashboard` and `build` packages.

## Why this matters

Shipping a hybrid application with massive node dependency footprint defeats the core purpose of a compiled Go application. Transitioning to a pure Go distribution:

- **Reduces Bloat**: Deletes dozens of redundant packages and thousands of lines of legacy TS logic, minimizing workspace complexity and build times.
- **Standalone Execution**: Eliminates the end-user runtime dependency on Node or Bun, delivering a single, lightweight, fast statically compiled executable.
- **Maintains Elite DX**: Ensures that users authoring `.tool.ts` files continue to receive 100% type-accurate autocompletions directly derived from the Go struct configurations.
- **Go-Native Robustness**: Serving the dashboard entirely inside Go ensures database connections are local, fast, and transactionally safe under a unified binary interface.

## Observed context

- Go migration plan defined in `docs/internal/eng-designs/go-migration-plan.md`.
- Legacy dashboard backend server in `packages/dashboard/src/server/dashboard-server.ts` and its routes under `packages/dashboard/src/server/routes/`.
- Current types and utilities used by the dashboard client in `packages/dashboard/src/shared/types.ts` and `packages/dashboard/src/shared/dashboardUtils.ts`.
- Build and compilation pipeline defined in `packages/build/src/build/build.ts` and its steps under `packages/build/src/build/steps/`.
- Automatic type-generation script in `scripts/typegen/main.go`.

## Desired outcome

A streamlined, highly-optimized monorepo consisting only of:

- `cmd/dotfiles` and `pkg/*`: Core Go codebase and its subpackages.
- `packages/dashboard`: The React/Preact dashboard client (served statically by Go).
- `packages/build`: The build and publishing utility.

At build time, `bun compile` compiles the dashboard client, embeds it inside the Go binary, builds the standalone Go executable, generates clean ambient `.d.ts` definitions from Go config structs, and produces a standalone `.dist/` NPM package with zero heavy external dependencies. At runtime, the single `dotfiles` binary executes configurations, tracks operations, and hosts the dashboard server and its JSON APIs natively.

## Acceptance criteria

### 1. Types Separation & Public Autocomplete 100% Completeness
- [ ] Relocate and consolidate the TypeScript interfaces required by the dashboard client (specifically `Architecture`, `Platform`, `IBinaryConfig`, `IFileOperation`, and `IFileState`) directly inside `packages/dashboard/src/shared/types.ts` or a new standalone types file.
- [ ] Maintain 100% completeness inside the public `.d.ts` definitions (e.g. `schemas.d.ts`, `tool-types.d.ts`, `authoring-types.d.ts`). All configuration properties, helper functions, and custom installer parameters must have identical Type signatures as the legacy TS implementation to ensure a perfect drop-in swap.
- [ ] Ensure that `Platform` and `Architecture` bitwise enums and their basic string converters are implemented locally in the dashboard shared folder, removing all dependency on `@dotfiles/core`.
- [ ] Completely sever all imports pointing to `@dotfiles/core`, `@dotfiles/config`, `@dotfiles/registry`, and other deleted TS packages within `packages/dashboard/src/client/` and `packages/dashboard/src/shared/`.
- [ ] Update `scripts/typegen/main.go` to output synchronized Go-to-TypeScript interfaces directly to `packages/dashboard/src/shared/types.gen.ts`.

### 2. Go-Native Dashboard REST Server & Backend Deletion

- [ ] Completely delete the legacy Bun-based dashboard server source directory (`packages/dashboard/src/server/`).
- [ ] Implement all dashboard REST API endpoints (served under `/api/*`) natively inside `pkg/dashboard/` in Go (including `/api/tools`, `/api/stats`, `/api/health`, `/api/config`, `/api/tool-configs-tree`, `/api/shell`, `/api/activity`, `/api/recent-tools`, `/api/tools/:name/*`).
- [ ] Ensure the Go API routes query the live SQLite `registry.db` (utilizing the transactional bindings in `pkg/registry` and `pkg/db`) and parse local configs to construct identical JSON response structures as the legacy Bun server.
- [ ] Serve the bundled, static dashboard assets out of the embedded `pkg/dashboard/dist` folder using the standard library `http.FileServer` in Go.

### 3. Build Pipeline Restructuring

- [ ] Refactor `packages/build/src/build/build.ts` and its helper files to orchestrate the new Go-native build pipeline.
- [ ] **Dashboard Bundling**: Build the Preact client (`packages/dashboard/src/client/dashboard.html` and assets) using Bun into the output directory `pkg/dashboard/dist/`.
- [ ] **Go Binary Compilation**: Execute `go build -ldflags="-s -w" -o .dist/dotfiles ./cmd/dotfiles` to compile the final statically-linked binary.
- [ ] **Type Publishing**: Emit ambient type definitions (`schemas.d.ts`, `tool-types.d.ts`, and `authoring-types.d.ts`) directly into `.dist/` derived from `types.gen.ts` and simple typescript templates, entirely removing `dts-bundle-generator` step on legacy packages.
- [ ] **Type Verification**: Verify the generated `.d.ts` definitions in `.dist/` using `tsd` type tests. 100% of all existing type tests (`*.test-d.ts` across all deleted packages) must be consolidated in `packages/build/type-tests/` and run successfully at build time. This guarantees a perfect, 100% drop-in swap with absolute backward compatibility for all existing customer `.tool.ts` configurations.
- [ ] **Package Assembly**: Generate a clean `.dist/package.json` that refers to `./dotfiles` in its `bin` field and includes only minimal dependencies (such as `@types/bun` and `@types/node` required for `.tool.ts` compilation) and has zero legacy dependencies (e.g., removing `commander`, `memfs`, `tslog`, `minimatch`).

### 4. Legacy TS Packages Demolition

- [ ] Safely remove all legacy packages under `packages/*` EXCEPT `dashboard` and `build` (e.g. `packages/core`, `packages/cli`, `packages/config`, `packages/file-system`, `packages/installer-*`, etc.).
- [ ] Update the root `package.json` workspaces key to include only `"packages/dashboard"`, `"packages/build"`, and the test fixture project directories.
- [ ] Remove all legacy TypeScript configuration files (`tsconfig.json`), build scripts, and unit tests belonging to the deleted packages.
- [ ] Adjust formatting (`oxfmt`), linting (`oxlint`), and typechecking (`tsconfig.json`) config files to target only the active Go directory and the two remaining TypeScript packages.
- [ ] Update `.github/workflows/ci.yml` and `.github/workflows/publish.yml` to reflect the removed packages and run only Go checks and dashboard checks.

### 5. Verification & Testing

- [ ] Retire and delete the legacy Dual-Run Parity verification harness (`scripts/parity-harness/`), since the legacy TS codebase is fully removed.
- [ ] Ensure that the Go-native E2E test suite in `tests/e2e/` passes cleanly with 100% success on local and CI environments.
- [ ] Verify that running `bun run check` on the root workspace returns a clean pass for linting, formatting, typechecking, and package testing.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
