---
created_on: 2026-06-22 12:00
last_modified: 2026-06-22 12:00
status: current
ticket_status: open
---

# Wave 4: Sequential Migration of the 15 Package Installer Plugins

## Problem

The installer supports 15 separate system and language-specific package management mechanisms (e.g., Brew, Cargo, Apt, Pacman, Npm, GitHub, Gitea, etc.). These plugins are written in TypeScript and must be translated into Go 1.26 modules while preserving system compatibility and executing through a mockable command runner.

## Why this matters

Installer plugins execute actual machine modifications (like running system package managers or writing files). To guarantee safety, prevent unauthorized changes, and make them fully mockable under test suites, they must execute command operations exclusively via the `CommandRunner` abstraction.

## Observed context

- Specified in `docs/internal/eng-designs/go-migration-plan.md` under Section 2, Section 3, Section 6, and Section 7.
- Architectural Decision Record: None.
- Codebase files affected:
  - `pkg/installer/brew.go`
  - `pkg/installer/cargo.go`
  - `pkg/installer/curl_binary.go`
  - `pkg/installer/curl_script.go`
  - `pkg/installer/curl_tar.go`
  - `pkg/installer/dmg.go`
  - `pkg/installer/gitea.go`
  - `pkg/installer/github.go`
  - `pkg/installer/manual.go`
  - `pkg/installer/npm.go`
  - `pkg/installer/zsh_plugin.go`
  - `pkg/installer/apt.go`
  - `pkg/installer/pacman.go`
  - `pkg/installer/dnf.go`
  - `pkg/installer/pkg.go`

## Desired outcome

Complete, idiomatic, sequentially migrated Go modules for the 15 installer plugins, mapping standard arguments and interacting with external systems exclusively through the `CommandRunner` and `downloader` interfaces.

## Acceptance criteria

- [ ] Each of the 15 installer plugins must implement the `Installer` interface.
- [ ] The installers must invoke external terminal applications exclusively using the injected `CommandRunner` interface.
- [ ] The plugins must not reference global environment states directly and must instead use variables extracted via the `SystemContext` and `pkg/arch` modules.
- [ ] Each installer plugin must be covered by a separate unit test file (e.g., `pkg/installer/brew_test.go`).
- [ ] Unit tests for all 15 plugins must achieve a minimum of 90% function-level coverage.
- [ ] Tests must utilize `MockCommandRunner` to assert that correct command lines, environments, and directories are constructed for every plugin method.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
