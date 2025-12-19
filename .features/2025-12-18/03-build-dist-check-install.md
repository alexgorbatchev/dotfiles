---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> add a new step to bun run build, after the .dist is ready in the .tmp/dist-check create package.json with dep "@gitea/dotfiles":"file....dist" and run bun install, it should pass

# Primary Objective
Make `bun run build` validate the built `.dist` output by generating a `.tmp/dist-check/package.json` that depends on `@gitea/dotfiles` via a local `file:` reference to `.dist`, then running `bun install` successfully.

# Open Questions
- [x] Use a relative `file:` URL from `.tmp/dist-check` (target: `file:../../.dist`).
- [x] Run plain `bun install`.

# Tasks
- [x] **TS001**: Identify the root cause / current build pipeline location for `.tmp/dist-check`
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Implement dist-check install build step
- [x] **TS007**: Run lint/typecheck/tests/build in worktree
- [x] **TS008**: Fix dependency version parsing for dist-check

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
- 2025-12-18: Confirmed `file:` dependency should be relative and `bun install` should be plain.
- 2025-12-18: Located build orchestrator and explored dist-check package.json testing approach.
- 2025-12-18: Confirmed missing dist-check package.json generator is the cause of failing test.
- 2025-12-18: Implemented `.tmp/dist-check` package.json generation and `bun install` verification step.
- 2025-12-18: Fixed installed version lookup to avoid substring matches (e.g. `cli-progress` vs `@types/cli-progress`).
---
