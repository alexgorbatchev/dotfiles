# Task
> Filter stack traces in hook error output to show only .tool.ts references

# Primary Objective
Simplify hook error output to show only the relevant .tool.ts stack frames and hide internal framework stack traces from end users.

# Open Questions
- [x] Is there existing stack manipulation code? YES - `writeHookErrorDetails.ts` already has `parseFirstToolFrame()` 
- [x] Are there pre-installed libraries for stack parsing? YES - `@babel/code-frame` is used for code frames

# Tasks
- [x] **TS001**: Identify the root cause of the verbose stack trace output
  - Current behavior: When a hook fails with a ShellError, the error is logged via `methodLogger.error(messages.outcome.hookFailed(), error)` in `HookExecutor.ts:163`
  - The `error` object is passed to tslog which uses `prettyErrorTemplate: '\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}'`
  - tslog formats the entire stack trace from the Error object
  - The `bun: command not found: navi` leaks to stdout because shell stderr is not being captured/silenced

- [x] **TS002**: Create a failing test to isolate the problem
  - Write a test that verifies the stack trace output only contains .tool.ts frames
  - Test should capture the actual output and verify no internal framework paths appear

- [x] **TS003**: Confirm the root cause based on the failing test
  - Verified the test fails with current implementation showing full stack trace

- [x] **TS004**: Design the solution
  - **Problem**: tslog prints the full error stack via `prettyErrorStackTemplate`, showing all internal frames
  - **Solution Chosen**: Don't pass error to tslog for hook failures; extract error cause from stderr/message and include in log message

- [x] **TS005**: Implement stack trace filtering
  - Created `extractErrorCause()` function to get error cause from ShellError stderr or Error message
  - Modified HookExecutor to use extracted cause when logging
  - Updated log message to include the error message directly (e.g., "Hook failed: bun: command not found: navi")

- [x] **TS006**: Handle shell stderr leaking to console
  - Fixed by not passing error object to logger for shell errors
  - Shell errors now extracted via `extractErrorCause()` and included in log message

- [x] **TS007**: Format the hook error details block cleanly
  - Simplified output to show code frame wrapped in `---` delimiters
  - Verbose details (exit code, stderr) only shown in trace mode

- [x] **TS008**: Write tests for the new behavior
  - Created `extractErrorCause.test.ts` with 12 tests
  - Created `HookExecutor--stack-trace-filter.test.ts` with 3 tests
  - Updated `HookExecutor--error-reporting.test.ts`
  - Updated `writeHookErrorDetails--codeframe.test.ts`

- [x] **TS009**: Run full test suite and fix any issues
  - All 1335 tests pass
  - Lint passes
  - Typecheck passes
  - Build succeeds

- [ ] **TS010**: Update documentation if needed

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated (no docs changes needed)
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Files Changed
- `packages/installer/src/utils/extractErrorCause.ts` - NEW: Extract error cause from errors
- `packages/installer/src/utils/index.ts` - Added export for extractErrorCause
- `packages/installer/src/utils/log-messages.ts` - Modified hookFailed() to accept cause parameter
- `packages/installer/src/utils/HookExecutor.ts` - Use extractErrorCause, don't pass error for shell errors
- `packages/installer/src/utils/writeHookErrorDetails.ts` - Simplified output format

# Tests Added
- `packages/installer/src/utils/__tests__/extractErrorCause.test.ts` - 12 tests
- `packages/installer/src/utils/__tests__/HookExecutor--stack-trace-filter.test.ts` - 3 tests

# Change Log
- 2026-01-07: Created task file and identified existing code in `writeHookErrorDetails.ts`
- 2026-01-07: Implemented solution - extractErrorCause utility, modified HookExecutor and log-messages
- 2026-01-07: All tests pass, lint/typecheck/build pass
