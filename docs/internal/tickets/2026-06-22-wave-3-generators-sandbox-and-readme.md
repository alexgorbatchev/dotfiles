---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 3: Profile Shell Script Injector, Symlink Evaluator, Shim Generator, Virtual Sandbox Environment, and Readme Cache Processor

## Problem

Generators for system symlinks, executable shims, environment variable overrides, shell profile injection, and markdown documentation processing are implemented in TypeScript. To ensure proper filesystem setup, sandboxing, and help formatting, these system actions must be fully migrated to Go using clean concurrent strategies.

## Why this matters

After downloading and extracting tools, the orchestrator needs to integrate them into the host. The shell initializers, symlink evaluation paths, executable shims, and virtual environments must be configured properly to guarantee zero host system contamination and ensure complete uninstallability.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 4 and Section 7.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/shell/shell.go` (implement script generation)
  - `pkg/shellinit/shellinit.go` (implement shell profile injector)
  - `pkg/symlink/symlink.go` (implement symlink creation algorithms)
  - `pkg/shim/shim.go` (implement wrapper script shims)
  - `pkg/venv/venv.go` (implement localized environment sandbox creator)
  - `pkg/features/readme.go` (implement readme parser and feature actions)

## Desired outcome

Clean, portable, concurrent Go engines that handle symlink paths, shell profile injections, sandboxed virtual environments, and documentation parsing while keeping full audit trails.

## Acceptance criteria

- [ ] `pkg/shell` must generate path extension directives, aliases, and export environments.
- [ ] `pkg/shellinit` must support parsing and editing main shell profile configurations (`.zshrc`, `.bashrc`, `.profile`) to inject startup script wrappers.
- [ ] `pkg/symlink` must evaluate and safely create symbolic links on the system, verifying target destinations.
- [ ] `pkg/shim` must generate native shell executable wrapper script shims.
- [ ] `pkg/venv` must configure localized path-isolated sandbox environments.
- [ ] `pkg/features` must parse markdown files, extract metadata, and cache tool readmes.
- [ ] All package utilities must achieve a minimum of 90% function-level test coverage.
- [ ] All file system actions in tests must use the mock file system `pkg/fs.MemFS` or `t.TempDir()` rather than mutating active developer paths.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
