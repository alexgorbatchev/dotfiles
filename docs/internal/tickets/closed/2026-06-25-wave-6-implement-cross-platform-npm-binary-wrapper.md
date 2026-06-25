---
created_on: 2026-06-25 10:00
last_modified: 2026-06-25 15:30
status: current
ticket_status: closed
---

# Wave 6: Implement Cross-Platform NPM Binary Wrapping and Distribution

## Problem

Statically compiled Go executables are platform-specific (tied to OS and CPU architecture). Because we are publishing our toolchain via NPM as a single command-line package `@alexgorbatchev/dotfiles`, a single pre-compiled binary will fail or refuse to execute on other platforms (e.g., trying to run a Linux-AMD64 binary on macOS-ARM64). We need a robust, platform-agnostic distribution strategy that automatically installs and executes the correct native Go binary.

## Why this matters

The dotfiles installer is used across diverse development machines (Intel Macs, Apple Silicon Macs, x86_64 Linux servers, and ARM-based Linux dev environments). For developers to run `bun install -g @alexgorbatchev/dotfiles` or use it in localized workspaces without friction, the NPM package must handle binary distribution and OS/CPU mapping dynamically under a unified entry point.

## Observed context

- Target compiled binary output is defined in `packages/build/src/build/steps/buildCompiledBinary.ts`.
- Package assembly happens in `packages/build/src/build/steps/generateDistPackageJson.ts`.
- Subpackage output is stored under the `.dist/` directory.

## Desired outcome

A multi-platform packaging setup where:

1. `packages/build` compiles the Go binary for multiple targets (`darwin-amd64`, `darwin-arm64`, `linux-amd64`, `linux-arm64`).
2. We assemble or define optional native sub-packages (e.g. `@alexgorbatchev/dotfiles-darwin-arm64`) holding the raw platform binaries.
3. The main `@alexgorbatchev/dotfiles` package publishes a small, ultra-lightweight JavaScript launcher (`cli.js`) that performs runtime platform detection (`process.platform` and `process.arch`) and spawns the correct Go subprocess, passing through all stdin, stdout, stderr, and exit codes cleanly.

## Acceptance criteria

- [x] Refactor the release compilation step in `packages/build` to cross-compile Go binaries for the following four target environments:
  - `GOOS=darwin GOARCH=amd64` (resulting in `bin/dotfiles-darwin-x64`)
  - `GOOS=darwin GOARCH=arm64` (resulting in `bin/dotfiles-darwin-arm64`)
  - `GOOS=linux GOARCH=amd64` (resulting in `bin/dotfiles-linux-x64`)
  - `GOOS=linux GOARCH=arm64` (resulting in `bin/dotfiles-linux-arm64`)
- [x] Implement the runtime launcher script `cli.js` inside the main package, performing precise mapping from NodeJS host values to sub-packages:
  - `process.platform === 'darwin'` and `process.arch === 'x64'` -> `@alexgorbatchev/dotfiles-darwin-x64`
  - `process.platform === 'darwin'` and `process.arch === 'arm64'` -> `@alexgorbatchev/dotfiles-darwin-arm64`
  - `process.platform === 'linux'` and `process.arch === 'x64'` -> `@alexgorbatchev/dotfiles-linux-x64`
  - `process.platform === 'linux'` and `process.arch === 'arm64'` -> `@alexgorbatchev/dotfiles-linux-arm64`
- [x] Ensure `cli.js` executes the binary using native `node:child_process` `spawn` or `spawnSync`, setting options `{ stdio: 'inherit' }` to forward all stream inputs/outputs, forwards system OS signals (such as `SIGINT`, `SIGTERM`), and terminates calling `process.exit(code)` with the exact exit code of the spawned Go subprocess.
- [x] Define the exact optional package distribution schema in the root `.dist/package.json`, listing the 4 native platform packages inside the `optionalDependencies` block with matching semver versions.
- [x] Add unit tests inside `packages/build/src/build/__tests__/platformDetection.test.ts` that mock `process.platform` and `process.arch` to assert that all 4 target states resolve to their correct paths, and throws descriptive errors on unsupported platforms.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
