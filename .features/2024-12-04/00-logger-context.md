# User Prompt
> need to extend safe logger to be able to set context for subloggers via getSubLogger(settings?: ISettingsParam<LogObj>): SafeLogger, the goal is that loggers with context would print `[context] message`, implement this

# Primary Objective
Extend SafeLogger to support context strings that are prepended to log messages as `[context] message`

# Open Questions
- [x] Should context be inherited by child subloggers? (Assumed: yes, contexts should chain)
- [x] Should multiple contexts be supported (e.g., `[parent][child] message`)? (Assumed: yes)

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Implement the solution
- [x] **TS006**: Update TestLogger to support context as well
- [x] **TS007**: Verify all tests pass

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [x] All code quality standards are met
- [ ] All changes are checked into source control
- [x] All tests pass
- [ ] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree

# Change Log
- Created feature file
- Implemented SafeLogger context support with `contexts` array and `formatContextPrefix` method
- Updated TestLogger to extend SafeLogger and inherit context functionality
- Added tests for context feature in SafeLogger.test.ts
- Fixed TestLogger.test.ts to use createSafeLogMessage
