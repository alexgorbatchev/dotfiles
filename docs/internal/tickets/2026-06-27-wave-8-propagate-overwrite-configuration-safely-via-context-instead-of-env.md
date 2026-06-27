---
created_on: 2026-06-27 11:00
last_modified: 2026-06-27 11:00
status: current
ticket_status: open
---

# Wave 8: Propagate Overwrite Configuration Safely via Context instead of Env

## Problem

Inside `handleToolInstall`'s background goroutine in `pkg/dashboard/routes.go`, the global process environment `DOTFILES_OVERWRITE` is updated using `os.Setenv` if `req.Force` is true. Because `os.Setenv` is process-wide and not synchronized across threads, running parallel installations or other concurrent operations from the CLI can cause data races or leak global state.

## Why this matters

Concurrency safety is critical for backend servers and parallel E2E runs. Mutating global process state (`os.Setenv`) in a concurrent handler can cause unpredictable behavior, data corruption, or false overwrite skipping in other parts of the application. Propagating the overwrite option safely via `context.Context` (or as configuration parameters) removes global state mutation and is a required standard for robust software.

## Observed context

- Go files:
  - `pkg/dashboard/routes.go` (uses `os.Setenv("DOTFILES_OVERWRITE", "true")`)
  - `pkg/installer/installer.go` (reads `os.Getenv` or CLI flags for dry-run/overwrite check)

## Desired outcome

The overwrite flag is propagated through the execution context safely, preventing any process-wide environment variables from being modified concurrently.

## Acceptance criteria

- [ ] **Context-Based Flag Propagation:** Define a custom context key for the overwrite parameter and implement a helper `WithOverwrite(ctx context.Context, overwrite bool) context.Context`.
- [ ] **Reader Alignment:** Implement `IsOverwriteEnabled(ctx context.Context)` that checks the custom context key as well as the fallback environment variable for backwards compatibility.
- [ ] **Refactor Handler:** Remove `os.Setenv` from `pkg/dashboard/routes.go` and inject the context instead.
- [ ] **Unit Testing:** Write a test inside `pkg/dashboard/dashboard_test.go` or `routes_test.go` asserting that concurrent installation requests do not bleed their force/overwrite flags to other threads.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
