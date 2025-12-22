---
# Task Prompt
> Follow instructions in alex--feature--new.prompt.md.
> #file:TODO.md

# Primary Objective
Address the TODO follow-ups captured in TODO.md by turning them into implemented, tested, and documented changes without leaving TODO markers in production code.

# Open Questions
- [x] Should this task implement all three TODO.md items (config `systemInfo` injection, installer context typing, and installer context builder reuse), or should it be split?
    - Answer: Implement all three in this task.
- [x] Should `createToolConfigContext(...)` (packages/config) accept `systemInfo` directly, or should a higher-level service create the context and pass it in?
    - Answer: `systemInfo` originates from `main.ts` in the CLI and must be injected.
- [x] Should installer context creation reuse the config package helper directly, or should shared context creation move into `@dotfiles/core` to avoid cross-package coupling?
    - Answer: Put the shared helper into `@dotfiles/core`.

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Add shared base-tool-context builder in `@dotfiles/core` (no dependency cycles)
- [x] **TS007**: Inject `systemInfo` into `createToolConfigContext(...)` and update call sites
- [x] **TS008**: Replace ad-hoc install context intersection type with named exported type
- [x] **TS009**: Refactor installer context creation to reuse the core helper
- [x] **TS010**: Update docs/READMEs if context construction API changes
- [x] **TS011**: Run acceptance commands (lint/typecheck/test/build)

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
- [x] Tests do not print anything to console.

# Change Log
- Initialize task worktree and task file
- Record decisions: implement all 3 TODOs; helper lives in core
- TS001: Root cause: `createToolConfigContext(...)` derives `systemInfo` from `process.*` (non-injectable); installer cannot reuse config helper without dependency cycle; install context typing has ad-hoc shapes
- TS002/TS003: Add failing test demonstrating non-injectable `systemInfo`, then confirm fix
- TS006/TS007: Add `createToolConfigContext(...)` to `@dotfiles/core` and inject `systemInfo` through config loader APIs and CLI call sites
- TS008/TS009: Export a named install context type and refactor installer contexts to reuse the shared helper
- TS010/TS011: Update README/tests, run lint/typecheck/tests, squash/merge, and clean up worktree
---
