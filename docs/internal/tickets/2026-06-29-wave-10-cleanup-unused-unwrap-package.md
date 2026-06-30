---
created_on: 2026-06-29 10:00
last_modified: 2026-06-29 10:00
status: current
ticket_status: open
---

# Wave 10: Integrate or Archive Unused pkg/unwrap Package

## Problem

The package `pkg/unwrap` is fully implemented, compiled, and carries its own unit test file `pkg/unwrap/unwrap_test.go`. However, it is completely unused and un-imported by any other package or CLI command in the entire Go codebase.

`pkg/unwrap` was originally intended to handle Go-native template string resolution (such as resolving `{{ .Version }}` in download URLs). Currently, different parts of the downloader or configuration loader implement localized, simplistic string replacements or ignore dynamic parsing entirely.

## Why this matters

Unused and dead code increases repository bloat, increases compilation noise, and leads to maintenance overhead. We must either fully integrate `pkg/unwrap` to replace all simplistic string replacements across the codebase, or safely archive/delete the package.

## Observed context

- Codebase files affected:
  - `pkg/unwrap/unwrap.go` (implements template string unwrapping)
  - `pkg/downloader/downloader.go` (performs URL formatting)
  - `pkg/config/resolver.go` (performs path and placeholder replacements)

## Desired outcome

Perform a review on the intended usage of `pkg/unwrap`. If it serves a functional purpose (such as consolidating placeholder resolving inside `pkg/config/` and `pkg/downloader/`), fully integrate it and delete any soft localized string-replace duplication. If it is redundant, safely delete the directory and remove any dead code.

## Acceptance criteria

- [ ] Audit all placeholders and template strings across `pkg/downloader/` and `pkg/config/`.
- [ ] If useful, refactor placeholders resolving to utilize the safe template evaluator inside `pkg/unwrap/unwrap.go`.
- [ ] If redundant, delete `pkg/unwrap/` completely and clean up any references.
- [ ] Ensure that all tests compile and pass cleanly after refactoring.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
