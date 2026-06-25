---
created_on: 2026-06-23 23:35
last_modified: 2026-06-24 18:50
status: current
ticket_status: closed
---

# Wave 5: Refactor Generate Command Semantics

## Problem

The Go CLI `generate` subcommand (`cmd/dotfiles/generate.go`) currently executes `services.Orchestrator.InstallTools(...)` on all tools, running the full installation pipeline. Under dry-runs and standard generations, this causes the Go CLI to trigger mock tool installations and record entries in `db_tool_installations.json`.

In contrast, the legacy TypeScript CLI `generate` command does **not** install tools (except for those with `auto: true` configured under their install parameters, such as `zsh-plugin--zsh-vi-mode`). Instead, it executes decoupled, standalone generators for shims, symlinks, shell init profiles, and virtual environments, leaving `db_tool_installations.json` empty for standard tools.

## Why this matters

The `generate` command must behave identically to the legacy TypeScript CLI to prevent database mismatches and behavioral deviations under end-user scenarios. Decoupling file generation from installation ensures that the Go CLI matches TS command semantics perfectly and avoids populating the local database with erroneous tool installation records during simple shim generation.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 3 and Section 8.
- Architectural Decision Record: None.
- Codebase files affected:
  - `cmd/dotfiles/generate.go` (refactor to invoke only decoupled generation flow)
  - `pkg/orchestrator/orchestrator.go` (implement standalone file generation workflows)

## Desired outcome

A refactored `generate` subcommand in Go that topologically sorts tool configurations, executes standalone shim, symlink, shell-init, and virtual environment generation steps, and skips installation pipelines entirely (only triggering mock or real installs for tools configured with `auto: true`). `db_tool_installations.json` must remain empty `[]` when standard tools are generated.

## Acceptance criteria

- [x] Refactor `cmd/dotfiles/generate.go` to avoid invoking `services.Orchestrator.InstallTools(...)` on all tools.
- [x] Implement standalone, decoupled generation coordination in `pkg/orchestrator` that executes only file generators (shims, symlinks, completions, shell-init, venv) on the list of topologically sorted tools.
- [x] The `generate` command must strictly skip running installation pipelines (`Install`) on standard tools, keeping the `db_tool_installations.json` output completely empty `[]` under dry-run validations.
- [x] Ensure that tools with `auto: true` in their install parameters (e.g., `zsh-plugin--zsh-vi-mode`) are still successfully auto-installed during generation, matching TS behavior.
- [x] Write unit tests verifying that running `generate` generates the correct shims and symlinks on disk without creating tool installation records in the SQLite database.
- [x] Run `bun check` and `bun check:ci` to verify that no compilation or TypeScript errors are introduced.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
