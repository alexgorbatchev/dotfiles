---
created_on: 2026-08-14 12:00
last_modified: 2026-08-14 12:00
status: current
---

# Binary Distribution Architecture

This document describes how `@alexgorbatchev/dotfiles` compiles, packages, and distributes native Go binaries across NPM and standalone GitHub Releases.

## Overview

The CLI is compiled from Go source (`cmd/dotfiles/`) into statically linked native executables and distributed through two complementary channels:

### 1. NPM / Bun Optional Platform Packages

When compiled via `bun run compile` (`scripts/build/main.go`):

- Native Go binaries (`./cmd/dotfiles`) are compiled for target OS/architecture combinations (`darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`).
- Each binary is packaged into a platform subpackage (e.g., `@alexgorbatchev/dotfiles-darwin-arm64`) with `os` and `cpu` constraints specified in its `package.json`.
- The root `@alexgorbatchev/dotfiles` package lists all platform subpackages under `optionalDependencies`.
- Package managers (`npm`, `bun`, `pnpm`) inspect `os`/`cpu` and download only the single subpackage matching the host system into `node_modules`.
- At runtime, `cli.js` resolves the subpackage binary via `import.meta.resolve` and delegates execution with `spawnSync`.

### 2. Standalone GitHub Releases

The `.github/workflows/publish.yml` CI workflow attaches compiled native Go binaries directly to GitHub Releases (`vX.Y.Z`). The hosted installer (`curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash`) downloads this standalone binary directly without requiring Node.js or Bun.
