# Task

> Replace `--log=trace` with `--trace` flag for source location tracing

# Primary Objective

Separate source location tracing (`--trace`) from log level verbosity (`--log`) so that file paths and line numbers can be added to any log level output.

# Open Questions

- [x] None currently

# Root Cause Analysis (TS001)

The current implementation ties source location tracing (file paths and line numbers) to the `trace` log level:

1. **CLI**: `createProgram.ts` defines `--log <level>` with valid levels: `trace`, `verbose`, `default`, `quiet`
2. **Logger Factory**: In `createTsLogger.ts`, the `prettyLogTemplate` is conditionally set:
   ```typescript
   const prettyLogTemplate = config.level === LogLevel.TRACE
     ? '{{logLevelName}}\t{{filePathWithLine}} - ' // shows file:line
     : '{{logLevelName}}\t'; // no file:line
   ```
3. **Main**: In `main.ts`, `resolveLogLevel()` converts CLI flags to a log level, which is passed to `createTsLogger()`

**The Problem**: Source tracing is coupled to log level 0 (TRACE), so users cannot get file paths at INFO or DEBUG levels.

# Tasks

- [x] **TS001**: Identify the root cause - understand how `--log=trace` currently enables source tracing
- [x] **TS002**: Create a failing test to isolate the problem
- [x] **TS003**: Confirm the root cause based on the failing test
- [x] **TS004**: Design the solution - STOP and iterate with user
- [x] **TS005**: Implement the `--trace` CLI flag
- [x] **TS006**: Update logger configuration to support trace independently
- [x] **TS007**: Update all relevant tests
- [x] **TS008**: Update documentation

# Proposed Solution (TS004)

## Problem Understanding

Currently, source location tracing (showing `filepath:line` in log output) is coupled to `--log=trace`. The `trace` log level conflates two concepts: verbosity and source tracing.

## Proposed Changes

### 1. Remove `trace` log level (packages/logger/src/LogLevel.ts)

- Remove `TRACE: 0` from `LogLevel`
- Remove `'trace'` from `LOG_LEVEL_NAMES`
- Update `LOG_LEVEL_MAP` accordingly
- Log levels become: `quiet`, `default`, `verbose`

### 2. Add `trace` option to `ILoggerConfig` (packages/logger/src/types.ts)

```typescript
export interface ILoggerConfig {
  name: string;
  level?: LogLevelValue;
  trace?: boolean; // Enable source location tracing
}
```

### 3. Update `createTsLogger` (packages/logger/src/createTsLogger.ts)

- Accept `trace` boolean option
- Set `prettyLogTemplate` based on `trace` flag only

```typescript
const prettyLogTemplate = config.trace ? '{{logLevelName}}\t{{filePathWithLine}} - ' : '{{logLevelName}}\t';
```

### 4. Add `--trace` CLI flag (packages/cli/src/createProgram.ts)

```typescript
.option('--trace', 'Show file paths and line numbers in log output', false)
```

### 5. Update `IGlobalProgramOptions` (packages/cli/src/types.ts)

Add `trace: boolean` property.

### 6. Update `main.ts`

Pass `trace` flag to logger configuration:

```typescript
const rootLogger = createTsLogger({
  name: 'cli',
  level: logLevel,
  trace: options.trace,
});
```

### 7. Update SafeLogger `isTraceLevel()` method

Rename to `isTracingEnabled()` and check config flag instead of log level.

## Valid Combinations

- `--log=default` - Normal logging, no file paths
- `--log=verbose` - Debug logging, no file paths
- `--log=default --trace` - Normal logging with file paths
- `--log=verbose --trace` - Debug logging with file paths
- `--quiet` - No logging (--trace has no effect)

## Breaking Changes

- `--log=trace` is removed (users should use `--log=verbose --trace` instead)

## Files to Modify

1. `packages/logger/src/LogLevel.ts` - Remove TRACE level
2. `packages/logger/src/types.ts` - Add `trace` option to `ILoggerConfig`
3. `packages/logger/src/createTsLogger.ts` - Update template logic
4. `packages/logger/src/SafeLogger.ts` - Update tracing check method
5. `packages/cli/src/createProgram.ts` - Add `--trace` flag
6. `packages/cli/src/types.ts` - Add `trace` to options interface
7. `packages/cli/src/main.ts` - Pass trace flag to logger
8. Tests and documentation

# Acceptance Criteria

- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.
- [x] All acceptance criteria are met

# Change Log

- Initial task file creation
- Root cause analysis complete
- Proposed solution approved
- Implemented --trace flag and removed LogLevel.TRACE
- Updated tests and fixed type issues
- [ ] All temporary code is removed
- [ ] All tasks are complete
- [ ] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [ ] All code quality standards are met
- [ ] All changes are checked into source control
- [ ] All tests pass
- [ ] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [ ] `bun run build` completes successfully.
- [ ] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [ ] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [ ] Tests do not print anything to console.
- [ ] All acceptance criteria are met

# Change Log

- Initial task file creation
