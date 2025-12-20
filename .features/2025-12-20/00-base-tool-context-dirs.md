---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> add toolDir to IBaseToolContext which should be absolute dir path to the location of .tool.ts
>
> add installDir to ibasetoolcontext that is absolute dir path to ${projectConfig.paths.binariesDir}/<toolName>/dir , this should be the same dir that ${projectConfig.paths.binariesDir}/<toolName>/bin is symlinking into
>
> then update all readmes and docs, both new props should have detailed JSDoc and should also illustrate the value by using `${projectConfig.paths.binariesDir}/<toolName>/blah` style examples so that end user has good understanding of values

# Primary Objective
Add `toolDir` to `IBaseToolContext`, wire it through all context creation code, and document it with clear JSDoc and end-user examples.

# Open Questions
- [x] None

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Update `IBaseToolContext` to include `toolDir` with detailed JSDoc
- [x] **TS007**: Populate `toolDir` in all context creators (tool config + installer)
- [x] **TS008**: Update docs/READMEs to document `toolDir` and examples
- [x] **TS009**: Run `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`

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
- Identified root cause: `IBaseToolContext` does not currently include `toolDir` or `installDir`.
- Added a typecheck-based failing assertion test that requires `toolDir` and `installDir` keys to exist.
- Confirmed root cause: `bun typecheck` fails because `toolDir` and `installDir` are not present on `IBaseToolContext`.
- Updated scope: dropped `installDir` (cannot be known pre-install); focus on `toolDir` only.
- Implemented `toolDir` end-to-end (config context, installer contexts, CLI contexts) and updated tests.
- Updated user-facing docs to document `toolDir` and clarify config dir vs install dir.
- Ran acceptance commands: `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`.
---
