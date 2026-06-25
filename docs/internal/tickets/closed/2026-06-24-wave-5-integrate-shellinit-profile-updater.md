---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:50
status: current
ticket_status: closed
---

# Wave 5: Integrate shellinit Profile Updater

## Problem

The Go package `pkg/shellinit` implements a `ProfileUpdater` capable of editing system files (like `.zshrc` and `.bashrc`) to source the generated init script. However, this package is currently **dead code** and is never imported or executed by `cmd/dotfiles` or `pkg/orchestrator`.

- **The Gap:** Users running the Go CLI must manually edit their profile files to source `.generated/shell-scripts/main.zsh`, whereas TypeScript automatically detects, updates, and removes profile blocks natively.
- **Marker Conflict:** Go's unused updater searches for block markers `# >>> dotfiles initialize >>>` and `# <<< dotfiles initialize <<<`, while TypeScript searches for `# Generated via dotfiles generator - do not modify` and replaces up to the next `source` line, causing duplicates if both updaters run on the same profile.

## Why this matters

Unifying profile integration ensures a zero-friction user onboarding experience when switching from TypeScript to Go. Activating the profile updater removes the need for manual file editing while guaranteeing that Go and TS do not conflict or corrupt the user's rc files on collision.

## Observed context

- Specified in `packages/shell-init-generator/src/profile-updater/ProfileUpdater.ts`.
- Codebase files affected:
  - `pkg/shellinit/shellinit.go` (align block markers to TS standards and verify methods)
  - `cmd/dotfiles/generate.go` (integrate and run `shellinit.Injector` on successful generation)

## Desired outcome

Go CLI automatically injects and cleans up its initialization sourcing lines inside `.zshrc`/`.bashrc`/PowerShell profiles upon successful script generation, sharing identical markers and injection patterns with the TypeScript implementation.

## Acceptance criteria

- [x] Update block markers inside `pkg/shellinit/shellinit.go` to match TypeScript's injection signature: `# Generated via dotfiles generator - do not modify`.
- [x] Integrate and execute `shellinit` injection inside `cmd/dotfiles/generate.go` upon completing standalone script generation.
- [x] Write unit tests inside `pkg/shellinit/shellinit_test.go` verifying the correct addition and removal of initialization sourcing lines under the updated markers.
- [x] Run `bun check` and `bun check:ci` to verify all checks pass cleanly.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
