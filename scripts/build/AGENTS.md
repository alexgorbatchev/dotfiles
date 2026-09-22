# scripts/build

Release build and asset packaging pipeline for compiling cross-platform Go binaries, embedding client/doc assets, generating TypeScript declarations, and creating release tarballs.

## Commands

- Compile all release binaries and assets: `just compile` (or `go run scripts/build/main.go`)
- Generate embedded assets only: `just prepare` (or `go run scripts/build/main.go --assets-only`)
- Run TypeScript declaration type tests: `go run scripts/build/main.go --type-tests`
- Run build package unit tests: `go test -v ./scripts/build/...`
- Run full release build test: `just test-build` (or `go test -count=1 -tags buildtest -run TestRunBuild ./scripts/build/`)

## Local conventions

- The build orchestrator executes in sequence:
  1. Clean previous build artifacts (`.dist`, `pkg/dashboard/dist`, `pkg/embedded/dist`).
  2. Bundle Preact dashboard client using Bun (`packages/dashboard/src/client/` -> `pkg/dashboard/dist`).
  3. Run Go struct typegen (`scripts/typegen/main.go`).
  4. Generate schema type declarations (`.dist/` and `pkg/embedded/dist/`).
  5. Generate npm packages and cross-platform launcher (`.dist/cli.js`).
  6. Copy skill documentation (`.agents/skills/dotfiles/` -> `pkg/embedded/skill/` and `.dist/skill/`).
  7. Cross-compile Go binaries for `darwin/arm64`, `darwin/amd64`, `linux/arm64`, and `linux/amd64`.
  8. Package tar.gz archives and generate `checksums.sha256`.
  9. Enforce binary archive size limit (maximum 26MB budget).
- Hand-edits in `pkg/embedded/dist` or `pkg/embedded/skill` will be overwritten by `scripts/build/main.go`. Edit `.agents/skills/dotfiles/` or generator sources instead.

## Local gotchas

- **Cached test invalidation:** `TestRunBuild` in `full_build_test.go` regenerates committed and embedded files, invalidating Go package test caches. It is protected behind `//go:build buildtest` and executed separately via `just test-build`.
- **Dashboard rebuild:** Any frontend changes in `packages/dashboard/src/client/` require running `just prepare` or `just compile` so `pkg/dashboard/dist` embeds the updated bundle.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Never: publish releases automatically without explicit user authorization.
- Never: manually modify generated files in `.dist/`, `pkg/embedded/dist/`, or `pkg/dashboard/dist/`.
- Ask first: adding target platforms, altering binary size limits, or modifying archive packaging layouts.

## References

- `scripts/build/main.go`
- `scripts/build/full_build_test.go`
- `scripts/build/main_test.go`
