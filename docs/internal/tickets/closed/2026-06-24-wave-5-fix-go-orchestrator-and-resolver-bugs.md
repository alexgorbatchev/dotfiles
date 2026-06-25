---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 20:30
status: current
ticket_status: closed
---

# Wave 5: Fix Go Orchestrator and Resolver Bugs

## Problem

Several critical runtime correctness bugs and test regressions have been identified in the Go orchestrator and resolver packages:

1. **Broken `TestOrchestrator_Install` (Test Regression):** The `chmod` operations added by the permission tracking system increase the operation log count from 2 to 3, breaking the test's assertion.
2. **Once-Script Self-Deletion Sourcing Failure (Bug):** Once-scripts are executed by **sourcing** them in the main initialization script. Under bash, `$0` evaluates to the calling shell path (e.g. `/bin/bash`), so `rm -f "$0"` tries to delete bash instead of the once-script on disk, causing the script to run repeatedly.
3. **Regex Placeholder Lookbehind Omission (Bug):** Go's regex engine has no lookarounds, so resolving placeholders replaces standard shell variables (like `${HOME}`) with expanded values preceded by `$`, resulting in corrupt `$/home/user` paths.

## Why this matters

Fixing these bugs guarantees accurate shell initialization, prevents terminal startup slowdowns due to repeating once-scripts, resolves path-corruption issues, and restores the unit testing suite to a fully green state.

## Observed context

- Specified in `packages/generator-orchestrator`, `packages/shell-init-generator`, and `packages/unwrap-value`.
- Codebase files affected:
  - `pkg/orchestrator/orchestrator_test.go` (fix `TestOrchestrator_Install` log count assertion)
  - `pkg/orchestrator/orchestrator.go` (fix once-script self-deletion command format)
  - `pkg/config/resolver.go` (simulate negative lookbehind to prevent resolving shell variables with leading `$`)

## Desired outcome

Unit tests pass cleanly, once-scripts delete themselves after execution, and standard shell variables are bypassed cleanly by the placeholder resolver.

## Acceptance criteria

- [x] Fix `/home/alex/development/projects/dotfiles-installer/pkg/orchestrator/orchestrator_test.go` (line 414) to assert 3 operations instead of 2.
- [x] Refactor once-script generation in `pkg/orchestrator/orchestrator.go` to statically write the target once-script file path into the self-deletion command (e.g. `rm -f "<onceFilePath>"`), or use shell-appropriate self-deletion tokens (for bash: `${BASH_SOURCE[0]}`, for zsh: `${(%):-%x}`).
- [x] Refactor `ResolvePlaceholders` in `pkg/config/resolver.go` to find match indices using `tokenRegex.FindAllStringSubmatchIndex` and check if the preceding character is `$` (i.e. `start > 0 && current[start-1] == '$'`), skipping replacement for those matches to safely bypass shell variables like `${HOME}`.
- [x] Write unit tests verifying that standard shell variables like `${HOME}` and `${PATH}` are left untouched by `ResolvePlaceholders`.
- [x] Run `go test ./pkg/orchestrator/...` and `go test ./pkg/config/...` and ensure they pass completely.
- [x] **Review Instructions:** Run an independent review pass of the changes using a dedicated review workflow or review subagent, and resolve all identified issues until a completely clean review is returned.
