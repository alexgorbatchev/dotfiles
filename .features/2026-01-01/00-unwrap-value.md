# Task

> Create a new package called `unwrap-value` that implements the `Resolvable<TParams, TReturn>` type pattern and `resolveValue` function to handle values that may be static, sync functions, or async functions.

# Primary Objective

Create a standalone `unwrap-value` package with type definitions and resolution function, starting with tests, including README documentation, with no dependencies or logging.

# Open Questions

- None

# Tasks

- [x] **TS001**: Create package structure in `.tmp/worktrees/unwrap-value/packages/unwrap-value/`
- [x] **TS002**: Write tests first covering:
  - Static value resolution
  - Sync function resolution
  - Async function resolution
  - Edge cases (null, undefined, complex objects)
- [x] **TS003**: Implement `Resolvable<TParams, TReturn>` type
- [x] **TS004**: Implement `resolveValue<TParams, TReturn>` function
- [x] **TS005**: Create README.md with usage examples
- [x] **TS006**: Verify all tests pass and code quality checks succeed

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

- Created feature branch and worktree
- Created task file
- Implemented @dotfiles/unwrap-value package with Resolvable type and resolveValue function
- Added 19 tests covering static values, sync/async functions, and edge cases
- Fixed lint issues (removed unnecessary await before expect)
- All checks pass: lint, typecheck, test (1226 tests), build
