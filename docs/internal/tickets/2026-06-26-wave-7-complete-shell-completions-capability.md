---
created_on: 2026-06-26 17:00
last_modified: 2026-06-26 17:00
status: current
ticket_status: open
---

# Wave 7: Complete Shell Completions Capability in Go

## Problem

Go's completion script generator (`GenerateCompletionsForTool` and completions pipeline) has significant feature gaps compared to the TypeScript implementation:

1. **No PowerShell Completions**: Go's generator only implements completions for `zsh` and `bash`. PowerShell completions are completely ignored.
2. **No URL/Archive Downloader Support**: The legacy TS completions generator (`CompletionGenerator.ts`) supports downloading completions directly from a `url` and unpacking them from `.zip` or `.tar.gz` archives. Go only supports referencing static local paths.
3. **No Globbing Support**: TS resolves completions paths using glob patterns (such as `completions/*.zsh`). Go only matches exact static local file names.
4. **Filename Discrepancy**: For Bash completions, Go writes completions files as `toolName` while TS writes them as `toolName.bash`.

## Why this matters

Shell completions are crucial for developer efficiency. Users expect command-line autocompletions for all major shells (including PowerShell) and depend on the tool installer to correctly download and register these completion files from remote archives.

## Observed context

- Go completions:
  - `pkg/orchestrator/orchestrator.go` (completions writing)
- TS completions:
  - `.workspaces/main/packages/shell-init-generator/src/completion-generator/CompletionGenerator.ts` (remote downloads, glob matching, formats)

## Desired outcome

The Go completions generator matches the complete capability of the TypeScript engine, supporting PowerShell completions, remote completions URLs/archives downloading, and file globbing.

## Acceptance criteria

- [ ] **PowerShell Completions**: Implement PowerShell completion generation inside the completions pipeline.
- [ ] **Remote Downloads Support**: Integrate `pkg/downloader/` inside the completions engine to support downloading completions from remote `url` strings and extracting them from `.zip` or `.tar.gz` archives.
- [ ] **Globbing Support**: Add support for resolving completion source directories matching glob patterns.
- [ ] **Bash Naming Parity**: Unify Bash completion file outputs to write as `toolName.bash`.
- [ ] **Unit Testing**: Add tests in `pkg/orchestrator/orchestrator_test.go` and `tests/e2e/completion_test.go` asserting correct completions extraction, downloading, and formatting across Bash, Zsh, and PowerShell.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
