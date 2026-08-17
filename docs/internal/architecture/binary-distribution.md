---
created_on: 2026-08-14 12:00
last_modified: 2026-08-14 21:10
status: current
---

# Binary Distribution Architecture

This document describes how `@alexgorbatchev/dotfiles` compiles, packages, embeds TypeScript declaration types, and distributes native Go binaries.

## Overview

The CLI is compiled from Go source (`cmd/dotfiles/`) into statically linked native executables distributed directly via GitHub Releases (`vX.Y.Z`):

### 1. Standalone Native Releases & Hosted Installer

The CLI executable is distributed directly through GitHub Releases as cross-platform native binaries (`dotfiles-darwin-x64`, `dotfiles-darwin-arm64`, `dotfiles-linux-x64`, `dotfiles-linux-arm64`). The hosted installer (`scripts/managed-installer/install.sh` / `curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash`) downloads the native binary directly into `~/.local/bin/dotfiles` without requiring Node.js, Bun, or npm.

### 2. Embedded TypeScript Declaration Types

To provide full TypeScript type safety, autocomplete, and IDE support without requiring npm or Bun runtime dependencies:

- Generated `.d.ts` declaration files (`index.d.ts`, `authoring-types.d.ts`, `schemas.d.ts`, `cli.d.ts`) are compiled into `pkg/embedded/dist/` during `bun compile` (`scripts/build/main.go`).
- The Go binary embeds these files using `//go:embed all:dist` in `pkg/embedded/embedded.go`.
- At runtime (`dotfiles generate` or `dotfiles install`), `pkg/orchestrator` automatically emits the embedded declaration files into `.generated/node_modules/@alexgorbatchev/dotfiles/` and creates a relative `node_modules/@alexgorbatchev/dotfiles` symlink in the project root.
- `dotfiles generate` dynamically produces `.generated/tool-types.d.ts` containing the `z_internal_IKnownBinNameRegistry` interface with all configured tool binary names for type-safe `dependsOn()` validation.
