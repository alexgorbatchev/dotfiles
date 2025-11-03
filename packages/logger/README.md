# @dotfiles/logger

The `@dotfiles/logger` package provides a robust, type-safe, and structured logging solution for the application. It is built on top of `tslog` and enhances it with features tailored for this project's needs, such as type-safe message templates and specialized testing utilities.

## Core Components

- **`createTsLogger`**: A factory function that creates a `tslog` logger instance, pre-configured with project-specific settings. It returns a `SafeLogger`.
- **`SafeLogger`**: A custom logger class that extends `tslog`'s `Logger`. It enforces that all log messages are of type `SafeLogMessage`, preventing the use of raw strings.
- **`SafeLogMessage`**: A branded string type that represents a message that is safe for logging. This is the cornerstone of the type-safe logging system.
- **`TestLogger`**: An extension of the logger designed for testing. It captures log messages in memory, allowing assertions on logs emitted during a test run.
- **Log Levels**: Defines standard log levels (`TRACE`, `VERBOSE`, `DEFAULT`, `QUIET`) and provides helpers like `parseLogLevel` and `getLogLevelFromFlags`.

## Package-Specific Log Messages

To ensure strong module encapsulation and maintainability, every feature package **MUST** co-locate its own log messages in a `log-messages.ts` file. This file should live directly beside the feature's primary source file(s).

**Co-location benefits:**
- Keeps intent and message evolution close to the business logic.
- Prevents global template bloat with one-off messages.
- Encourages single responsibility and easier refactoring.
- Improves discoverability when reading a package.

### File Naming & Location

```
packages/{package}/src/{feature}/
  index.ts
  {feature}.ts          # Main implementation
  log-messages.ts       # Module-scoped log templates (required if logging exists)
  __tests__/
    ...
```

### Example `log-messages.ts`

```typescript
// packages/example/src/log-messages.ts
import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

// Group by semantic intent, not by log level.
export const messages = {
  resolvingConfig: (path: string) =>
    createSafeLogMessage(`Resolving example config at ${path}`),
  configResolved: (path: string) =>
    createSafeLogMessage(`Example config resolved from ${path}`),
  operationSkipped: (reason: string) =>
    createSafeLogMessage(`Example operation skipped: ${reason}`),
  invalidState: (state: string) =>
    createSafeLogMessage(`Invalid example state: ${state}`),
} satisfies SafeLogMessageMap;
```

### Usage in a Package

```typescript
import { messages } from './log-messages';
import type { TsLogger } from '@dotfiles/logger';

export function runExample(logger: TsLogger) {
  const l = logger.getSubLogger({ name: 'runExample' });
  l.debug(messages.resolvingConfig('/tmp/example.yaml'));
  // ...
  l.error(messages.invalidState('orphaned'));
}
```

### Design Rules for `log-messages.ts`

1. **Single Purpose**: Only include messages that are local to the package.
2. **No Duplication**: If a message is needed in multiple packages, promote it to a shared helper package.
3. **Descriptive Naming**: Use action-oriented function names (e.g., `configResolved`, `downloadPlanned`).
4. **Type Safety**: Always return values created via `createSafeLogMessage()`.
5. **Group by Intent**: Do not create log-level sub-objects (`error`, `debug`). The log level is chosen at the call site.
6. **No Method Names**: Do not embed method names in messages; the logger's sub-logger name provides this context.
7. **Pure Functions**: Templates should only perform formatting.
8. **Stay Current**: Remove stale or unused messages promptly.

## Log Level Guidelines (Call Site Responsibility)

- **`error`**: Critical failures that prevent an operation from completing (e.g., file not found, network failure, try/catch).
- **`warn`**: Recoverable issues or potential problems (e.g., using a deprecated feature, fallback behavior triggered).
- **`info`**: Successful completion of significant operations (e.g., tool installed, operation completed).
- **`debug`**: Internal state details for debugging (e.g., cache hits, intermediate steps, variable values).

## Testing

Use `TestLogger` to capture and assert on log messages in your tests.

```typescript
import { TestLogger } from '@dotfiles/logger';
import { messages } from '../log-messages';

test('should log an error when initialization fails', () => {
  const logger = new TestLogger({ name: 'MyModule' });
  const subLogger = logger.getSubLogger({ name: 'initialize' });

  subLogger.error(messages.initializationFailed('Something went wrong'));

  logger.expect(
    ['ERROR'],
    ['MyModule', 'initialize'],
    ['Initialization failed: Something went wrong']
  );
});
```
