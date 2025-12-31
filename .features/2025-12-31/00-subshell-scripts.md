# Task
> Change how always and once scripts are generated from self-executing functions to subshell execution

# Primary Objective
Replace self-executing function pattern with subshell `( )` syntax for always and once script generation.

# Open Questions
- [x] Should PowerShell use the same pattern or maintain function syntax? → Use `try { } finally {}` pattern

# Tasks
- [x] **TS001**: Identify the root cause of the problem
  - Current implementation wraps scripts in self-executing functions with `__dotfiles_*_always()` or `__dotfiles_*_once()` patterns
  - Files affected:
    - `packages/shell-init-generator/src/script-formatters/AlwaysScriptFormatter.ts`
    - `packages/shell-init-generator/src/script-formatters/OnceScriptFormatter.ts`
    - `packages/e2e-test/src/TestHarness.ts` (verifyAlwaysScript regex)
    - `packages/shell-init-generator/src/script-formatters/__tests__/OnceScriptFormatter.test.ts`

- [x] **TS002**: Create a failing test to isolate the problem
  - Created test for AlwaysScriptFormatter that expects subshell syntax
  - Created test for OnceScriptFormatter that expects subshell syntax

- [x] **TS003**: Confirm the root cause of the problem based on the failing test

- [x] **TS004**: Implement the solution
  - Modified `AlwaysScriptFormatter.generateShScript()` to use subshell `( )` instead of function
  - Modified `AlwaysScriptFormatter.generatePowerShellScript()` to use `try { } finally {}`
  - Modified `OnceScriptFormatter.generateZshScript()` to use subshell `( )` instead of function
  - Modified `OnceScriptFormatter.generateBashScript()` to use subshell `( )` instead of function
  - Modified `OnceScriptFormatter.generatePowerShellScript()` to use `try { } finally {}`
  - Updated `TestHarness.verifyAlwaysScript()` regex to match new subshell pattern

- [x] **TS005**: Update tests to match new expected output
  - Updated `OnceScriptFormatter.test.ts` snapshots
  - Created `AlwaysScriptFormatter.test.ts` with comprehensive tests

- [x] **TS006**: Run all tests and ensure they pass

- [x] **TS007**: Verify with test-project that generation works correctly

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [ ] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [ ] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log
- Initial task file created with analysis of affected files
- Implemented subshell syntax for AlwaysScriptFormatter and OnceScriptFormatter
- Created AlwaysScriptFormatter.test.ts with tests for all shell types
- Updated OnceScriptFormatter.test.ts for new subshell syntax
- Updated TestHarness.verifyAlwaysScript to match new pattern
- Removed unused stripEmptyLineWhitespace function
