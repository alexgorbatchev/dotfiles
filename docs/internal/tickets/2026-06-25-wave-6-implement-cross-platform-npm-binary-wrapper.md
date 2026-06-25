---
created_on: 2026-06-25 10:00
last_modified: 2026-06-25 10:00
status: current
ticket_status: open
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

- [ ] Refactor the compilation step in `packages/build` to cross-compile the Go binary using standard `GOOS` and `GOARCH` environment variables during release.
- [ ] Implement a lightweight platform detection script in `packages/build` / root package (`cli.js`) mapping `process.platform` and `process.arch` to the correct native target binary.
- [ ] Define and generate corresponding package.json configurations for optional native platform dependencies.
- [ ] Ensure that native sub-packages are listed under `optionalDependencies` inside the main `.dist/package.json` so package managers install the appropriate native package automatically.
- [ ] Ensure the JavaScript launcher wraps standard execution, capturing CLI arguments (`process.argv`), handling process signal forwarding, and matching exit codes identically.
- [ ] Write unit tests verifying that the platform detection and path-resolution logic maps accurately on all target OS and architecture combinations.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
