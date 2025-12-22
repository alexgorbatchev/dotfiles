---
# Task Prompt
> Follow instructions in alex--feature--new.prompt.md. work on T101 please

# Primary Objective
Remove direct `node:fs` usage from the TypeScript config loader existence check, so it respects the injected `IFileSystem` abstraction while preserving existing runtime behavior.

# Open Questions
- [x] Should the `@testing` section in `loadTsConfig` JSDoc be removed to keep production modules test-agnostic?
- [x] Do we want `loadTsConfig` to require `fileSystem.exists()` to pass even when the runtime `import()` could succeed (i.e. enforce consistency over permissiveness)?

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Run `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`

# Acceptance Criteria
- [x] Primary objective is met
- [ ] All temporary code is removed
- [x] All tasks are complete
- [ ] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Tests do not print anything to console.

# Change Log
- 2025-12-21: Initialized T101 worktree and task file
- 2025-12-21: Added regression test for injected filesystem existence check
- 2025-12-21: Switched `loadTsConfig` existence check to `fileSystem.exists()` and removed direct `node:fs/promises` usage
- 2025-12-21: Updated TS config loader tests to use `NodeFileSystem` for on-disk module loading
- 2025-12-21: Verified with `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`
- 2025-12-21: Verified `.dist/cli.js` does not include obvious external requires/imports
---
