---
created_on: 2026-06-27 12:00
last_modified: 2026-06-28 12:00
status: current
ticket_status: closed
---

# Wave 9: Fix Sourced Files Process Substitution Execution Bug

## Problem

In `pkg/orchestrator/orchestrator.go` (and related shell initialization generators), when a tool specifies native `SourceFiles` (paths to local shell scripts on disk), the orchestrator erroneously wraps them in a complex process substitution function designed only for raw _Sources_ blocks (arbitrary inline javascript/shell scripts):

```go
body = fmt.Sprintf("[[ -f %q ]] && cat %q", resolvedPath, resolvedPath)
scriptLines = append(scriptLines, fmt.Sprintf("%s() {\n%s\n}", funcName, body))
scriptLines = append(scriptLines, fmt.Sprintf("source <(%s)", funcName))
```

This is a severe bug. Sourcing via `source <(cat "/path/to/file")` forces the shell (zsh or bash) to read the script from a temporary named pipe/file descriptor (e.g., `/dev/fd/63`), rather than from the actual file path itself.

If the sourced script contains location-aware self-reference statements (such as`${BASH_SOURCE[0]}` or `${(%):-%x}`) to locate its own relative configuration assets—a standard, ubiquitous pattern in dotfiles configurations—the script resolves its path to `/dev/fd/63` and **instantly crashes or fails to locate relative assets**.

## Why this matters

Many robust shell plugins, themes, and tool setups (such as `fzf`, `asdf`, `nvm`, or custom user aliases) rely on location-aware sourcing to dynamically load adjacent files. Wrapping these direct file references in process substitution breaks the scripts on execution, making them non-functional.

## Observed context

- Go files:
  - `pkg/orchestrator/orchestrator.go` (contains shell initialization emission logic)
- TS reference:
  - `.workspaces/main/packages/shell-init-generator/src/formatters/ZshEmissionFormatter.ts`

## Desired outcome

Refactor the shell initialization generator to distinguish between raw dynamic inline _Sources_ and static _SourceFiles_. Dynamic inline sources can continue to use process substitution wrappers if needed, but local `SourceFiles` must be emitted as a clean, simple, and direct `source "/path/to/file"` or `[[ -f "/path/to/file" ]] && source "/path/to/file"` statement, preserving location-awareness.

## Acceptance criteria

- [x] **Direct Sourcing Emission**: Refactor `pkg/orchestrator/orchestrator.go` to emit a direct, standard shell `source` call for all paths defined under `SourceFiles`.
- [x] **Preserve Process Substitution for Raw Sources**: Keep process-substitution subshell wrappers restricted exclusively to arbitrary, raw inline `Sources` blocks that require on-the-fly streaming.
- [x] **Format Alignment**: Ensure the generated path is safely quoted to prevent shell syntax breakage on spaces.
- [x] **Unit Testing**: Add a unit test `TestSourceFilesDirectEmission` in `pkg/orchestrator/orchestrator_test.go` verifying that:
  - Specifying a local file in `SourceFiles` outputs `source "/path/to/file"` (or Zsh/Bash equivalent checks) without any subshell process substitution functions.
  - Specifying dynamic inline scripts in `Sources` preserves subshell execution structure.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
