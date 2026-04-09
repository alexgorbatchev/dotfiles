# @dotfiles/logger

The `@dotfiles/logger` package provides a robust, type-safe, and structured logging solution for the application. It is built on top of `tslog` and enhances it with features tailored for this project's needs, such as type-safe message templates and specialized testing utilities.

## Core Components

- **`createTsLogger`**: A factory function that creates a `tslog` logger instance, pre-configured with project-specific settings. It returns a `SafeLogger`.
- **`SafeLogger`**: A custom logger class that extends `tslog`'s `Logger`. It enforces that all log messages are of type `SafeLogMessage`, preventing the use of raw strings. Supports context strings that are prepended to log messages as `[context]`.
- **`SafeLogMessage`**: A branded string type that represents a message that is safe for logging. This is the cornerstone of the type-safe logging system.
- **`TestLogger`**: An extension of the logger designed for testing. It captures log messages in memory, allowing assertions on logs emitted during a test run.
- **Log Levels**: Defines standard log levels (`VERBOSE`, `DEFAULT`, `QUIET`) and provides helpers like `parseLogLevel` and `getLogLevelFromFlags`.

## Logger Context

SafeLogger supports a `context` option that prepends a `[context]` prefix to all log messages. This is useful for adding contextual information like tool names to log output.

### Creating a Logger with Context

```typescript
import { createTsLogger } from "@dotfiles/logger";

const logger = createTsLogger({ name: "MyApp" });

// Create a sublogger with context - all logs will have [myTool] prefix
const toolLogger = logger.getSubLogger({ context: "myTool" });
toolLogger.info(messages.installing()); // Output: [myTool] Installing tool...

// Context can be combined with named subloggers
const subLogger = toolLogger.getSubLogger({ name: "download" });
subLogger.debug(messages.downloading()); // Output: [myTool] Downloading...
```

### Context vs Named Subloggers

- **Named subloggers** (`{ name: 'methodName' }`) create a hierarchy for log path filtering (e.g., `['MyApp', 'download']`)
- **Context subloggers** (`{ context: 'toolName' }`) add a `[context]` prefix to messages without creating a new hierarchy level
- Context is inherited by child subloggers automatically

### Setting Prefix Dynamically

When you need to set the prefix within a method that knows the context (e.g., `toolName`), use `setPrefix()`:

```typescript
async processForTool(toolName: string) {
  const logger = this.logger.getSubLogger({ name: 'processForTool' }).setPrefix(toolName);
  logger.debug(messages.processing()); // Output: [toolName] Processing...
}
```

This is useful when the context isn't known at construction time but is available at runtime.

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
import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

// Group by semantic intent, not by log level.
export const messages = {
  resolvingConfig: (path: string) => createSafeLogMessage(`Resolving example config at ${path}`),
  configResolved: (path: string) => createSafeLogMessage(`Example config resolved from ${path}`),
  operationSkipped: (reason: string) => createSafeLogMessage(`Example operation skipped: ${reason}`),
  invalidState: (state: string) => createSafeLogMessage(`Invalid example state: ${state}`),
} satisfies SafeLogMessageMap;
```

### Usage in a Package

```typescript
import type { TsLogger } from "@dotfiles/logger";
import { messages } from "./log-messages";

export function runExample(logger: TsLogger) {
  const l = logger.getSubLogger({ name: "runExample" });
  l.debug(messages.resolvingConfig("/tmp/example.yaml"));
  // ...
  l.error(messages.invalidState("orphaned"));
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

## Error Object Handling

When passing Error objects to logger methods (`logger.error(messages.something(), error)`), the logger automatically handles error output based on the tracing mode:

### Default Mode (user-facing)

- Error objects are **never passed to tslog** — they are converted to a `.tool.ts` location string or dropped entirely.
- If the error stack contains `.tool.ts` frames, a `(filename.tool.ts:line)` string is appended to the log message. This tells the user which line in their tool config caused the failure.
- If no `.tool.ts` frames exist (purely internal error), the error is dropped — the `SafeLogMessage` already describes the failure.

**Output examples:**

```
ERROR   Installation failed via cargo (flux.tool.ts:14)
ERROR   Installation failed via cargo
```

### Trace Mode (`--trace` flag)

- Error objects pass through to tslog unchanged, showing the full error name, message, and complete stack trace with all frames.
- Used for debugging internal issues.

### Rules

1. **Always pass error objects directly**: `logger.error(messages.something(), error)` — the logger decides what to show.
2. **Never extract error.message into log templates**: The `SafeLogMessage` provides the user-facing description. Error details are only shown via `.tool.ts` file references in default mode, or full stack in trace mode.
3. **Only `.tool.ts` files appear in user-facing error output**: Internal framework paths, `node_modules`, and other implementation details are never shown to end users.

## Testing

Use `TestLogger` to capture and assert on log messages in your tests.

```typescript
import { TestLogger } from "@dotfiles/logger";
import { messages } from "../log-messages";

test("should log an error when initialization fails", () => {
  const logger = new TestLogger({ name: "MyModule" });
  const subLogger = logger.getSubLogger({ name: "initialize" });

  subLogger.error(messages.initializationFailed("Something went wrong"));

  logger.expect(["ERROR"], ["MyModule", "initialize"], ["Initialization failed: Something went wrong"]);
});
```
