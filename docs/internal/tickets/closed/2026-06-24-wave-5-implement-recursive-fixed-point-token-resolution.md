---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:50
status: current
ticket_status: closed
---

# Wave 5: Implement Recursive Fixed-Point Token Resolution in Go

## Problem

Go's token resolution logic inside the orchestrator is extremely naive. It uses a single-pass `strings.ReplaceAll` mapped to only three literal tokens: `{stagingDir}`, `{paths.generatedDir}`, and `{paths.targetDir}`.

- **The Issue:** If config paths contain nested tokens, or if other variables (like `{paths.homeDir}`, `{paths.dotfilesDir}`) are used, Go fails to resolve them, leaving unresolved braces inside paths.
- **TypeScript's Behavior:** Uses recursive, fixed-point string substitution with up to 20 passes (`performFixedPointObjectSubstitution` inside `stagedProjectConfigLoader.ts`) to resolve arbitrary nested tokens and safely catches cyclic dependency loops.

## Why this matters

The configuration files make heavy use of nested variables. Resolving them fully is necessary to prevent runtime file operation errors when shims, symlinks, or shell scripts are evaluated with malformed, unresolved paths.

## Observed context

- Specified in `packages/unwrap-value` and Go's `pkg/orchestrator/orchestrator.go`.
- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (refactor `resolvePlaceholder`)
  - `pkg/config/config.go` (possibly add recursive resolution helper)

## Desired outcome

Go implements a robust, recursive fixed-point token substitution utility matching TypeScript's string resolution semantics perfectly, supporting arbitrary nested tokens and protecting against cyclic references.

## Acceptance criteria

- [x] Implement a recursive fixed-point token resolver in Go (e.g. inside `pkg/config` or `pkg/orchestrator`) that replaces placeholders with their corresponding paths from `ProjectConfig`.
- [x] Set a safe maximum iteration limit (e.g. 20 iterations) and throw a descriptive error if a cyclic token reference is detected.
- [x] Refactor `resolvePlaceholder` in `pkg/orchestrator/orchestrator.go` to leverage this new recursive token resolver.
- [x] Write unit tests verifying that nested path variables (such as `{paths.generatedDir}/user-home` referencing `{paths.homeDir}`) are fully resolved and that cyclic references fail fast with the expected error.
- [x] Run `bun check` and `bun check:ci` to verify all checks pass cleanly.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
