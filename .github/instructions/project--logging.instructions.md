---
description: Detailed instructions on how to correctly handle logging in the project.
applyTo: '**/*'
---

# Project Logging Requirements

The purpose of logging is to provide insights into what the application is doing to the END USER.
INFO, WARN, and ERROR levels are always printed to the user and must be easily readable.

## Logger Architecture

The project uses `tslog` with a custom `SafeLogger` wrapper. See `packages/logger/README.md` for API details.

### Sublogger Hierarchy

Every function/method that logs must create a sublogger with `name` for the structural hierarchy:

```typescript
function installTool(parentLogger: TsLogger, toolName: string): void {
  const logger = parentLogger.getSubLogger({ name: 'installTool' });
  // ...
}
```

### Context for Runtime Values

Use `context` for runtime values that identify WHAT is being operated on (tool names, hook names, etc.):

```typescript
// ✅ CORRECT: context identifies the specific tool
const logger = parentLogger.getSubLogger({ name: 'install', context: toolName });
logger.error(messages.installFailed()); // Output: [toolName] Installation failed

// ✅ CORRECT: context identifies the specific hook
const logger = parentLogger.getSubLogger({ name: 'executeHook', context: hookName });
logger.error(messages.hookFailed()); // Output: [after-install] Hook failed
```

**Key distinction:**

- `name` = structural hierarchy (method/class names) - used for log filtering by path
- `context` = runtime identifier (tool name, hook name) - appears as `[value]` prefix in output

### What NOT to embed in log messages

Since `context` provides the runtime identifier, log messages should NOT include:

- Tool names (use `context: toolName`)
- Hook names (use `context: hookName`)
- Any value that varies per invocation

```typescript
// ❌ BAD: toolName embedded in message
installFailed: ((toolName: string) => createSafeLogMessage(`[${toolName}] Installation failed`));

// ✅ GOOD: simple message, toolName comes from logger context
installFailed: (() => createSafeLogMessage('Installation failed'));
```

## Log Message Templates

### File Organization

- Each package has one `log-messages.ts` file exporting a single `messages` object
- Messages are grouped by domain/feature within the object

### Message Content Rules

- Messages must be short and clear
- Messages will be translated - no partial English sentences in parameters
- Parameters can only be system values (paths, versions, method names, counts)
- Each template is single responsibility - never reuse in different contexts

```typescript
// ✅ GOOD: system values only
installFailed: ((method: string) => createSafeLogMessage(`Installation failed via ${method}`));
extracted: ((count: number) => createSafeLogMessage(`Extracted ${count} files`));

// ❌ BAD: partial English sentence in parameter
logMessage: ((action: string) => createSafeLogMessage(`${action} completed`)); // "Downloading" is English
```

## Error Handling

### Pass errors directly to logger

```typescript
// ✅ CORRECT: pass error object directly
try {
  await operation();
} catch (error) {
  logger.error(messages.operationFailed(), error);
}

// ❌ WRONG: extracting message
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(messages.operationFailed(message)); // Don't embed in template!
}
```

### No duplicate logging

When an error occurs, log it ONCE at the appropriate level:

```typescript
// ❌ WRONG: same failure logged twice
async function install(toolName: string): Promise<Result> {
  try {
    return await doInstall();
  } catch (error) {
    logger.error(messages.installFailed()); // Logged here
    return { success: false, error: error.message };
  }
}

// Then in caller:
const result = await install(toolName);
if (!result.success) {
  logger.error(messages.installFailed()); // Logged AGAIN - wrong!
}

// ✅ CORRECT: log only in one place (where error originates)
```

## General Rules

- Code must not have any `console.[fn]` statements
- Only `cli.ts` and tests can create root logger instances
- All other code receives logger as parameter and creates sublogger
- Log messages must not include method names (sublogger `name` provides this)
- Do not log objects, arrays, or long string values
- Do not wrap function calls with begin/end logs if those functions have their own logging
- Do not log more than one message per event
- Log output uses the tab character (`\t`) as a separator between fields (eg `WARN\t`). Tests verifying log output must match this character explicitly.
