---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Fix Core Platform Bitmask Matching Comparisons

## Problem

In `cmd/dotfiles/bootstrap.go`, platform matching for configuration loading is implemented using simplified integer equality comparisons:

```go
if platforms == 3 || platforms == 7 { ... }
```

These values refer to numeric platform bitmasks (e.g. `Platform.Linux = 1`, `Platform.MacOS = 2`, `Platform.Windows = 4`, `Platform.Unix = 3`, `Platform.All = 7`).

However, if a user-authored configuration defines a customized or intermediate bitmask—such as `platforms = 5` (which specifies `Platform.Linux | Platform.Windows` to skip macOS)—the simplified integer comparison fails on Linux because `5` does not equal `3` or `7`. Consequently, the valid Linux installer is silently skipped on Linux machines.

## Why this matters

Bitmask-based platform and architecture filters are designed to support flexible, multi-platform combinations. Using hardcoded integer checks instead of standard bitwise logical `AND` gates (`(platforms & targetOS) != 0`) introduces subtle, silent bugs where installers are bypassed on perfectly matching operating systems.

## Observed context

- Codebase files affected:
  - `cmd/dotfiles/bootstrap.go` (implements platform config matching)
  - `pkg/vm/dsl-types.ts` (defines Platform enums matching these bitmasks)

## Desired outcome

Refactor all platform and architecture matching checks inside the Go configurations loader and orchestrator to utilize standard bitwise bitmask operations rather than simplistic integer checks.

## Acceptance criteria

- [ ] Refactor platform checks in `cmd/dotfiles/bootstrap.go` (and relevant orchestrator locations) to use bitwise logical gates: `(configPlatforms & currentPlatform) != 0`.
- [ ] Refactor architecture checks to use the equivalent bitwise gates.
- [ ] Add a unit test in `pkg/config/config_test.go` asserting that configuring platform combinations (like Linux | Windows) matches correctly on Linux and skips macOS.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
