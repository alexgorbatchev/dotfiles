---
# User Prompt
> Follow instructions in [alex--feature--new.prompt.md](file:///Users/alex/.dotfiles/instructions/chat/prompts/alex--feature--new.prompt.md).
>
> your job is to rename toolDir to toolBinariesDir because that's what it actually is, remove getToolDir from ibasetoolcontext completely, update all docs and readmes, make sure that all variables are also properly renamed and jsdoc is updated

# Primary Objective
Rename `toolDir` to `toolBinariesDir` across the codebase (types, context objects, and consumers), remove `getToolDir` from `IBaseToolContext`, and update documentation to match the new API.

# Open Questions
- [ ] Should the rename be strictly limited to `IBaseToolContext`/`ctx.*` shape, or also rename local variables currently named `toolDir` when they refer to the same concept (tool base dir under binaries)?
- [ ] Are there any external (non-repo) tool configs relying on `ctx.getToolDir()` that need a migration note, or is it acceptable to make this a breaking change with docs updated only?

# Tasks
 [x] **TS001**: Identify the root cause of the naming mismatch and all impacted API surfaces (`toolDir`, `getToolDir`).
 [x] **TS002**: Create a failing test that asserts the context API exposes `toolBinariesDir` and does not expose `getToolDir`.
 [x] **TS003**: Confirm the root cause based on the failing test and locate all call sites that rely on `toolDir`/`getToolDir`.
- [ ] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
 Initialized worktree, branch, and task file.
 Added failing tests asserting `toolBinariesDir` and removal of legacy context fields.
  - Describe proposed solution
  - Iterate with the user on proposed solution
- [ ] **TS005**: Write down follow up tasks needed to implement the solution.

# Acceptance Criteria
- [ ] Primary objective is met
- [ ] All temporary code is removed
- [ ] All tasks are complete
- [ ] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [ ] All code quality standards are met
- [ ] All changes are checked into source control
- [ ] All tests pass
- [ ] All acceptance criteria are met
- [ ] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [ ] `bun run build` completes successfully.
- [ ] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [ ] Tests do not print anything to console.

# Change Log
- Initialized worktree, branch, and task file.
---
