# Task

> Add a logger to defineTool ctx that user can use

# Primary Objective

Expose a `log` property on the `IToolConfigContext` (and `IBaseToolContext`) so users can log messages within their `defineTool` callback function and hooks.

# Open Questions

- [x] Should the logger be a full `TsLogger` or a simplified interface for users? **Answer**: Simplified interface (`IToolLog`) that accepts plain strings
- [x] What should be the logger's context/prefix (toolName)? **Answer**: Yes, pre-configured with `[toolName]` context

# Tasks

- [x] **TS001**: Identify the root cause of the problem
  - `IBaseToolContext` and `IToolConfigContext` do not expose a logger
  - `createToolConfigContext` receives a logger but doesn't expose it on the context
- [x] **TS002**: Create a failing test to isolate the problem
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Design solution and propose to user
  - Add `IToolLog` interface with simplified string-based logging methods
  - Add `log: IToolLog` property to `IBaseToolContext`
  - Update `createToolConfigContext` to create a wrapper logger with toolName context
- [x] **TS005**: Add `IToolLog` interface to `IBaseToolContext` type definition
  - File: `packages/core/src/common/baseToolContext.types.ts`
- [x] **TS006**: Update `createToolConfigContext` to expose `log` property
  - File: `packages/core/src/context/createToolConfigContext.ts`
  - Create wrapper that accepts plain strings and delegates to SafeLogger
- [x] **TS007**: Update tests for `createToolConfigContext`
  - File: `packages/core/src/context/__tests__/createToolConfigContext.test.ts`
- [x] **TS008**: Update documentation
  - Update `packages/core/README.md`
  - Update `docs/context-api.md` if exists
- [x] **TS009**: Run full test suite and acceptance criteria

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
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log

- 2026-01-08: Task file created with initial structure
- 2026-01-08: Feature complete - added IToolLog interface and log property to context
