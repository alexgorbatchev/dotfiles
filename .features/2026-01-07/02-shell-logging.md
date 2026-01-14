# Shell Command Logging Feature

## Status: COMPLETED

## Description

Add command logging to the extended shell used in hooks. Commands are logged as `$ cmd` and their output as `| line`.

## Implementation

### New Files

- `packages/core/src/shell/createLoggingShell.ts` - Creates shell wrapper that logs commands and output

### Modified Files

- `packages/core/src/shell/index.ts` - Export `createLoggingShell`
- `packages/installer/src/utils/HookExecutor.ts` - Added logger parameter to `createEnhancedContext`, integrate logging shell
- `packages/installer/src/Installer.ts` - Pass logger to `createEnhancedContext`
- `docs/hooks.md` - Documented shell command logging feature

### Tests

- `packages/core/src/shell/__tests__/createLoggingShell.test.ts` - 12 tests covering logging behavior

## Behavior

- Commands are logged as `$ command` at info level before execution
- Stdout lines are logged as `| line` at info level
- Stderr lines are logged as `| line` at error level (only if stderr has content)
- Logging happens regardless of `.quiet()` usage
- All shell promise methods (`.cwd()`, `.env()`, `.text()`, etc.) are properly wrapped

## Date Completed

2026-01-07
