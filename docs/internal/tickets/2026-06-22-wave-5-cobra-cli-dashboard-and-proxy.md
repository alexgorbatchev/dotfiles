---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 5: Modular Cobra CLI Subcommands, Caching Proxy Server, and Embedded Static Web Dashboard Server

## Problem

The command-line parsing (via Commander.js), local caching HTTP proxy, and React-based logs dashboard server are written in TypeScript/Node.js. These must be replaced with a single Go executable using Cobra, a standard library HTTP caching proxy, and an embedded static web server for the dashboard.

## Why this matters

Users interact directly with the CLI commands and Web dashboard. Consolidating subcommands inside Cobra, embedding dashboard static assets inside the Go binary via `//go:embed`, and hosting the cache proxy natively reduces execution times and compiles everything into a single, dependency-free binary.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 3, Section 4, Section 7, and Section 10.
- Architectural Decision Record: None.
- Codebase files affected:
  - `cmd/dotfiles/main.go`
  - `cmd/dotfiles/root.go`
  - `cmd/dotfiles/generate.go`
  - `cmd/dotfiles/install.go`
  - `cmd/dotfiles/uninstall.go`
  - `cmd/dotfiles/update.go`
  - `cmd/dotfiles/env.go`
  - `cmd/dotfiles/files.go`
  - `cmd/dotfiles/dashboard.go`
  - `cmd/dotfiles/convert.go`
  - `pkg/dashboard/dashboard.go`
  - `pkg/proxy/proxy.go`

## Desired outcome

A unified executable entry point that exposes clean, modular Cobra commands matching legacy CLI flags, and embeds/serves the cached static dashboard assets and local proxy operations using native `net/http`.

## Acceptance criteria

- [ ] The CLI entry point must utilize `github.com/spf13/cobra` to parse terminal options.
- [ ] The CLI must define modular subcommands split into separate files under `cmd/dotfiles/` to ensure readability and maintainability.
- [ ] All CLI options, commands, and subcommands must map exactly to the API surface defined in Section 10 of the design document.
- [ ] `pkg/dashboard` must serve pre-compiled dashboard frontend assets using the `//go:embed` directive and standard library `http.FileServer`.
- [ ] `pkg/proxy` must implement a local HTTP asset caching proxy using `net/http`.
- [ ] All CLI commands and package engines must achieve a minimum of 90% function-level test coverage.
- [ ] Test suites for CLI subcommands must capture stdout/stderr and assert output structure.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
