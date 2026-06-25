---
created_on: 2026-06-25 12:20
last_modified: 2026-06-25 12:20
status: current
ticket_status: open
---

# Wave 6: Standardize Go Structured Logging and Remove Orchestrator Test Hacks

## Problem

The Go implementation currently violates several core architectural standards defined in `AGENTS.md`:

1. **Total Structured Logger Bypass**:
   `AGENTS.md` mandates that all logging must utilize our safe structured logger wrapping `tslog` (in TS) or our custom structured logger wrapper (in Go `pkg/logger`), with "No `console.*` anywhere" and no raw prints in internal packages.
   * **The Bug**: **None of the installer plugins, the VM runner, or the core orchestrator in Go import or use `pkg/logger`.** Instead, they write raw, unformatted strings directly to standard error or standard output using standard library `fmt.Fprintf` and `fmt.Printf`.
   This bypasses the hierarchical structure, context-tagging, stack-trace filtering, and translation-readiness of the logger module, and prints noisy, raw unformatted streams directly to the terminal.

2. **Hardcoded Testing Hacks inside the Core Orchestrator**:
   * **The Bug**: `pkg/orchestrator/orchestrator.go` contains a hardcoded testing check written specifically for a mock fixture named `"hook-test-tool"`:
     ```go
     if tool.Name == "hook-test-tool" {
         hooks := []string{
             `echo "shell-output-for-hook-test-tool"`,
             `./scripts/test-output.sh`,
         }
         ...
     ```
     This violates standard encapsulation rules and separation of concerns. Testing hooks must be read dynamically from parsed structures instead of being hardcoded into the production orchestration loop.

## Why this matters

Using raw `fmt` prints in core modules bypasses global log levels (`--log=verbose`/`--trace`), making debug tracing difficult. Hardcoding test tool hooks directly in production files degrades code quality, increases technical debt, and leads to code rot.

## Observed context

- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (contains direct prints and hardcoded test hooks)
  - `pkg/installer/` (all 15 installer plugins print directly to stderr)
  - `pkg/logger/logger.go` (defines structured logging interface)

## Desired outcome

1. All raw `fmt.Printf` / `fmt.Fprintf` prints inside core Go packages are replaced with structured logs using `pkg/logger`.
2. Core orchestrator files have zero hardcoded conditions for testing tools; hooks are parsed and executed purely from dynamic configurations.

## Acceptance criteria

- [ ] Standardize the Go orchestrator (`pkg/orchestrator/`) and all 15 installer plugins (`pkg/installer/`) to use `pkg/logger`:
  - Pass the parent/context logger through constructors or method signatures.
  - Create name-scoped sub-loggers using `logger.WithName()`.
  - Pass error objects directly instead of extracting `.Error()`.
  - Replace all raw `fmt.Printf`, `fmt.Println`, and `fmt.Fprintf(os.Stderr)` with appropriate logger calls (`Info`, `Debug`, `Warn`, `Error`).
- [ ] Completely remove the hardcoded `"hook-test-tool"` block from `pkg/orchestrator/orchestrator.go`.
- [ ] Implement a generic lifecycle hook parsing routine in the orchestrator that reads and executes `after-install` commands dynamically from the config file, ensuring `"hook-test-tool"` is executed via declarative config rather than hardcoded rules.
- [ ] Verify that running `go test ./pkg/orchestrator/...` passes cleanly and captures all logged actions inside a structured `TestLogger`.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
