---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:20
status: current
ticket_status: open
---

# Wave 5: Enforce Installer Supports Sudo Validation

## Problem

The Go CLI completely bypasses `sudo` validation for installer plugins.
* **The Bug:** Go's `Installer` interface declares `SupportsSudo() bool` and all plugins implement it, but **the Go orchestrator never calls or checks this method**. If a tool config defines `sudo: true` but its installation method does not support it (e.g. `npm`), Go executes it blindly under `sudo`, potentially corrupting global package registries or throwing cryptic errors.
* **TypeScript's Behavior:** The TS orchestrator strictly checks if the installer plugin supports sudo, immediately aborting with a helpful validation error if a mismatch is caught.

## Why this matters

Enforcing privilege safety prevents users from running inappropriate installers (such as `npm`, `cargo`, or `pip`) under elevated root environments, preserving host file ownership and preventing filesystem security degradation.

## Observed context

- Specified in `packages/core/src/builder/builder.types.ts` and `pkg/orchestrator/orchestrator.go`.
- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (add `SupportsSudo` validation check in `InstallTool`)

## Desired outcome

Go's `InstallTool` strictly validates that the installer supports sudo before running tool installations under `sudo: true` configurations, returning a clean, user-friendly error on mismatch.

## Acceptance criteria

- [ ] Edit `pkg/orchestrator/orchestrator.go`'s `InstallTool` to assert that if `tool.Sudo` is `true`, `inst.SupportsSudo()` must also be `true`.
- [ ] If `tool.Sudo` is `true` but `inst.SupportsSudo()` is `false`, immediately return a descriptive error (e.g., `installer "npm" does not support sudo installations`).
- [ ] Implement a helper in Go's command execution wrapper to validate TTY status or log warnings before executing commands with elevated root privileges.
- [ ] Write unit tests inside `pkg/orchestrator/orchestrator_test.go` asserting that trying to install a tool with `sudo: true` on an installer that returns `SupportsSudo() == false` fails immediately with the expected validation error.
- [ ] Run `bun check` and `bun check:ci` to verify all checks pass cleanly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
