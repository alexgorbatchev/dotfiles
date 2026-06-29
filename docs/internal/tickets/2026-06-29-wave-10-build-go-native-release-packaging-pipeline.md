---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Build Go-Native Release Packaging Pipeline

## Problem

The assembly of the `.dist/` folder—which packages the compiled Go binaries for multiple architectures, builds the Preact dashboard client, generates types, and packages everything as an npm library—is currently coordinated by legacy TypeScript code inside `packages/build/` running via Bun.

Although `scripts/build/main.go` exists and compiles binaries, it lacks several key verification and compilation sub-steps necessary to safely remove Node/TS dependencies during compilation:
1. **No Binary Size Limits Enforcement**: The Go pipeline doesn't check compiled sizes, which was previously enforced in TS to prevent bloated distributions (checking that Go binaries remain within `26000 KB`).
2. **No TSD Type-Level Verification**: It does not run type-level assertion checks (`tsd`) on generated declarations, risking broken typing releases.
3. **Mismatched Frontend Compilation**: It lacks native coordination to trigger Preact's production bundler and dynamically write static assets to `pkg/dashboard/dist` before Go's embedding compiler is invoked.

## Why this matters

To complete the demolition of the TypeScript implementation, we must have a 100% self-sufficient build process that can package the compiled Go binaries and types for NPM with zero legacy Node.js/TypeScript build dependencies in the project's tooling workflows.

## Observed context

- Go files:
  - `scripts/build/main.go` (Go-native build script)
- TS files:
  - `packages/build/src/build/build.ts` (legacy TS-based build runner)

## Desired outcome

`scripts/build/main.go` is fully upgraded to orchestrate the entire build, asset-bundling, size-checking, typing de-duplication, and type-level TSD verification steps, enabling the complete deletion of `packages/build` and all other legacy JS build packages.

## Acceptance criteria

- [ ] **Enforce Go Binary Size Limits**: Re-implement binary file size checking in `scripts/build/main.go`. Fail the build if any of the cross-compiled binaries (darwin/amd64, darwin/arm64, linux/amd64, linux/arm64) exceed `26000 KB`.
- [ ] **Type-Level TSD testing**: Integrate type-level verification in `scripts/build/main.go`. Spawn `bun x tsd` as a subprocess to verify the generated `.d.ts` declaration files inside `.dist/` and fail the Go build if typing tests fail.
- [ ] **Clean Preact Compilation & Embed**: Automate building the React/Preact visual assets from `packages/dashboard` via a temporary subprocess and ensure they are written to `pkg/dashboard/dist/` before Go builds the dashboard server.
- [ ] **Delete packages/build**: Once the Go build script successfully wraps these phases, completely delete the `packages/build/` directory and remove its workspace declaration from `package.json`.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
