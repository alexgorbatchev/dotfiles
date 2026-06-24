---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:20
status: current
ticket_status: open
---

# Wave 5: Fix Go Once-Script Continuous Execution Bug

## Problem

Go's orchestrator writes "once-scripts" to the `.once/` directory and sources them in the main initialization script. However, it completely lacks self-deletion logic.
* **The Bug:** Because the script file is never deleted from disk, the sourcing condition is satisfied on every startup. This causes Go's "once-scripts" to execute on every single shell startup, effectively behaving identical to "always-scripts".
* **TypeScript's Behavior:** The TS POSIX formatter appends `rm "${outputPath}"` to the once-script file, and the PowerShell formatter appends `Remove-Item "${outputPath}"` so that they clean themselves up immediately after the first successful execution.

## Why this matters

Once-scripts are reserved for heavy, non-idempotent operations (such as compiling extensions, verifying systems, or triggering one-time alerts). Executing them on every shell startup introduces massive overhead, slows down terminal loading, and violates the toolchain's execution contract.

## Observed context

- Specified in `packages/shell-init-generator` and Go's `pkg/orchestrator/orchestrator.go`.
- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (inject deletion command when writing once scripts)

## Desired outcome

Go's once-scripts safely delete themselves immediately after executing successfully, matching TS behavior and ensuring single-use execution boundaries.

## Acceptance criteria

- [ ] Refactor once-script generation inside `pkg/orchestrator/orchestrator.go` (line 586-611) to append self-deletion commands at the end of written once-scripts:
  - POSIX shells (zsh, bash): Append `\nrm -f "$0"\n` or similar self-cleanup hook.
  - PowerShell: Append `\nRemove-Item $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue\n` or similar.
- [ ] Ensure that existing files in `.once/` are safely pruned/managed during consecutive generate commands.
- [ ] Write unit tests inside `pkg/orchestrator/orchestrator_test.go` verifying that written once-scripts contain the appropriate self-deletion statements.
- [ ] Run `bun check` and `bun check:ci` to verify that Go shell init tests pass cleanly.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
