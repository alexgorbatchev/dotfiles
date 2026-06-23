---
created_on: 2026-06-22 12:00
last_modified: 2026-06-23 11:45
status: current
ticket_status: open
---

# Wave 5: Modular Cobra CLI Subcommands, Caching Proxy Server, and Embedded Static Web Dashboard Server

## Problem

The command-line parsing (via Commander.js), local caching HTTP proxy, and React-based logs dashboard server are written in TypeScript/Node.js. These must be replaced with a single Go executable using Cobra, a standard library HTTP caching proxy, and an embedded static web server for the dashboard.

However, the initial implementation of the CLI subcommands under `cmd/dotfiles/` left them as shallow stubs that merely log success messages without invoking the core `Orchestrator` engine, initializing the SQLite state registry, or executing any actual installations/generations. To prevent silent failures in the upcoming Go-native E2E test suite, the CLI subcommands must be fully wired and verified.

## Why this matters

Users interact directly with the CLI commands and Web dashboard. Consolidating subcommands inside Cobra, embedding dashboard static assets inside the Go binary via `//go:embed`, and hosting the cache proxy natively reduces execution times and compiles everything into a single, dependency-free binary. Fully wiring the subcommands is critical to guarantee that commands actually perform filesystem mutations and persist state correctly.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 3, Section 4, Section 5, Section 7, and Section 10.
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
  - `pkg/db/db.go` (needs `tool_usage` table)
  - `pkg/registry/registry.go` (needs `tool_usage` query bindings)
  - `pkg/dashboard/dashboard.go`
  - `pkg/proxy/proxy.go`

## Desired outcome

A unified executable entry point that exposes clean, modular Cobra commands matching legacy CLI flags, and embeds/serves the cached static dashboard assets and local proxy operations using native `net/http`. The subcommands must be fully functional and integrated with the config parser, file system wrapper, sqlite connection pool, and orchestrator engine.

## Acceptance criteria

### CLI Framework & Parsing (Completed)
- [x] The CLI entry point must utilize `github.com/spf13/cobra` to parse terminal options.
- [x] The CLI must define modular subcommands split into separate files under `cmd/dotfiles/` to ensure readability and maintainability.
- [x] All CLI options, commands, and subcommands must map exactly to the API surface defined in Section 10 of the design document.

### Dashboard & Proxy (Completed)
- [x] `pkg/dashboard` must serve pre-compiled dashboard frontend assets using the `//go:embed` directive and standard library `http.FileServer`.
- [x] `pkg/proxy` must implement a local HTTP asset caching proxy using `net/http`.

### Strict Command Wiring (Unfinished / Reopened)
- [ ] The CLI commands (`generate`, `install`, `uninstall`, etc.) must NOT be stubs. They must be fully wired to the core `Orchestrator` engine (`pkg/orchestrator`), the SQLite connection pool (`pkg/db`), and the `Registry` model layers.
- [ ] The `generate` command must load the project configuration using `pkg/config`, sort tool dependencies topologically, execute shim/symlink generation, and write tracking records to the SQLite database.
- [ ] The `install` and `uninstall` commands must call the orchestrator's installation/uninstallation pipelines, downloading, executing, and persisting states accordingly.
- [ ] Subcommand unit tests inside `cmd/dotfiles/subcommands_test.go` must be enhanced to assert actual filesystem side-effects (e.g. verifying shims and configs are created) and database mutations rather than checking log lines.

### Database Schema Extension (Unfinished / Reopened)
- [ ] The sqlite database schema in `pkg/db/db.go` must be extended to initialize and migrate the `tool_usage` table and `idx_tool_usage_tool_name` index identically to the TypeScript implementation.
- [ ] `pkg/registry` must provide Go models and transaction-safe querying functions to insert, update, and fetch usage metrics for the `tool_usage` table.

### Coverage & Sign-off
- [ ] All CLI commands and package engines must achieve a minimum of 90% function-level test coverage.
- [ ] The work must be reviewed by a sub-agent, and all issues must be addressed until the sub-agent reviewing the code returns no further issues.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
