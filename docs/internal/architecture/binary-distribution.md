---
created_on: 2026-08-14 12:00
last_modified: 2026-09-17 22:30
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

- Generated `.d.ts` declaration files (`index.d.ts`, `authoring-types.d.ts`, `schemas.d.ts`, `cli.d.ts`) are compiled into `pkg/embedded/dist/` during `bun compile` (`scripts/build/main.go`). `index.d.ts` is produced from `pkg/vm/dsl-types.ts`, which describes what `pkg/vm/loader-api.ts` hands to a configuration and which parameters `pkg/installer` reads; `globals.d.ts` (copied from `pkg/vm/globals.d.ts`) declares the runtime globals (`process.env`) and is kept out of `index.d.ts` so it cannot collide with Node or Bun type definitions a project may also load.
- The Go binary embeds these files using `//go:embed all:dist` in `pkg/embedded/embedded.go`.
- At runtime (`dotfiles generate` or `dotfiles install`), `pkg/orchestrator.SyncTypeScriptTypes` emits the embedded declaration files into `.generated/node_modules/@alexgorbatchev/dotfiles/` and creates a relative `node_modules/@alexgorbatchev/dotfiles` symlink in the project root.
- The same step writes `.generated/tool-types.d.ts`, a module (it imports the package, so its `declare module` block augments rather than shadows) whose `z_internal_IKnownBinNameRegistry` interface lists the binary names of every configured tool, disabled ones included, for type-safe `dependsOn()` validation.
- It also writes the CLI-owned `.generated/tsconfig.json` (`pkg/typecheck.Program`): the project configuration file, every tool configs directory, the registry and `globals.d.ts`, with `types: []` and the compiler options the declarations target. A project without a `tsconfig.json` is given one that extends it (`pkg/scaffold.ProjectTSConfig`); a `tsconfig.json` an earlier version generated is recognised byte for byte and replaced, anything the user edited is left alone.
- `pkg/embedded/skill_snippets_test.go` compiles every TypeScript fence of the embedded skill against the embedded declarations with that same program shape, so the documentation cannot drift from what the runtime accepts. `tests/type-tests` (tsd) covers the declarations member by member and runs from `just typecheck`.
