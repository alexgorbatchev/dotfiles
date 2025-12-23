---
# Task Prompt
> Follow instructions in [alex--feature--new.prompt.md](file:///Users/alex/.dotfiles/instructions/chat/prompts/alex--feature--new.prompt.md).
> packages/installer-github/src/installFromGitHubRelease.ts imports messages from core which violates project rules, audit entire code base for similar violations and resolve

# Primary Objective
Remove all cross-package `messages` imports (including the current `installer-github` violation) by moving needed message templates into the owning package.

# Open Questions
- [x] Should the rule be **strictly** “no importing `messages` from `@dotfiles/core`”, or should it be “no importing `messages` from any *other* `@dotfiles/*` package”?
  - Answer: No cross-package `messages` imports across `@dotfiles/*`.
- [x] Are there any sanctioned exceptions (e.g. shared “generic” messages package), or should each package always define its own `log-messages.ts`?
  - Answer: No exceptions; each package owns its own `log-messages.ts`.

# Tasks
- [x] **TS001**: Identify the root cause of the problem
  - [x] Locate the import in `packages/installer-github/src/installFromGitHubRelease.ts`.
  - [x] Determine why the package is importing `messages` from another package.
  - [x] Identify what the correct logging/message source should be per project logging rules.
- [x] **TS002**: Audit the repo for cross-package `messages` imports
  - [x] Search `packages/**` for imports that include `messages` from `@dotfiles/*`.
  - [x] Record all offenders for remediation.
- [x] **TS003**: Confirm the root cause based on the audit results
  - [x] Validate that each offender is a cross-package `messages` import (not docs/examples).
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
  - [x] Describe the problem as you understand it
  - [x] Describe proposed solution
  - [x] Iterate with the user on proposed solution
- [x] **TS005**: Implement fixes for all identified violations
  - [x] For each offending package, create/extend its own `log-messages.ts` and move/add message templates there.
  - [x] Update imports to reference the local package `messages` only.
  - [x] Ensure logging calls remain single-event (no duplicate consecutive logs) and do not log objects/arrays.
- [x] **TS006**: Validate code quality and regression coverage
  - [x] Run `bun fix`.
  - [x] Run `bun lint`, `bun typecheck`, and `bun test`.
  - [x] Run `bun run build`.
  - [x] Run `bun test-project generate` and verify `test-project/.generated` is created.

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Use `bun test-project generate` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log
- 2025-12-23: Set up worktree/branch and added failing test for cross-package `messages` imports.
- 2025-12-23: Removed the test and moved needed messages into `installer-github`.
- 2025-12-23: Ran `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`, and `bun test-project generate`.
---
