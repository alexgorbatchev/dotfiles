# Log Message System (Module-CoLocated First)

Legacy `logger/templates` category files have been removed. The **only supported pattern** is module-level, co-located `log-messages.ts` files. Progress and sequencing are tracked in `LOGGER_TEMPLATE_MIGRATION_PLAN.md`; contributors must consult that plan before adjusting log message architecture.

> Migration Principle: Prefer small, explicit, module-scoped message sets over large global taxonomies.

## Overview

The logging system now emphasizes:
- Strong module encapsulation via co-located `log-messages.ts`
- Type safety with `SafeLogMessage` and `createSafeLogMessage()`
- Minimal, intention-revealing template functions
- Ease of refactoring and removal of obsolete messages

Active Direction:
- Flat intent-based functions inside each module's `log-messages.ts`
- Use logger subloggers for contextual scoping instead of embedding method names
- Migrate existing global templates opportunistically (do NOT copy—move & update call sites)

## Architecture

### Directory Structure (Current + Legacy)

Current (preferred):
```
src/modules/{feature}/
  log-messages.ts        # REQUIRED when custom log messages exist
  {feature}.ts
  index.ts
```

Legacy (frozen – do not add new files):
```
src/modules/logger/templates/
  {category}/
    error.ts
    warning.ts
    success.ts
    debug.ts
    index.ts
  index.ts
```

All future work MUST use the co-located model.

### Module-Specific Log Messages (Co-Location Requirement)

In addition to the shared category templates above, every feature/module MUST co-locate its own private log messages in a `log-messages.ts` file that lives directly beside that module's primary source file(s). This file is for messages that are ONLY used within that module and are not broadly reusable across the application. Do NOT add narrow, module-specific messages to the global `logger/templates` categories.

Co-location benefits:
- Keeps intent and message evolution close to the business logic
- Prevents global template bloat with one-off messages
- Encourages single responsibility and easier refactoring
- Improves discoverability when reading a module

#### File Naming & Location

```
src/modules/{feature}/
  index.ts
  {feature}.ts          # main implementation (example)
  log-messages.ts       # module-scoped log templates (required when logging exists)
  __tests__/
    ...
```

#### Responsibilities Split

Every module owns its own log messages within the `log-messages.ts` file that sits beside the module implementation. If you discover wording that belongs in more than one module, promote it to a purpose-built shared helper module (not a central registry) and update all call sites immediately.

If during implementation you notice a module message becomes generically useful (e.g. multiple modules duplicate similar wording), promote it by moving it into the appropriate global category template and updating all call sites—do not keep duplicates.

#### Module File Pattern

```typescript
// src/modules/example/log-messages.ts
import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

// Group by semantic intent (NOT by log level here). Keep surface small & focused.
export const exampleLogMessages = {
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

Usage inside the module:

```typescript
import { exampleLogMessages } from './log-messages';

export function runExample(logger: Logger) {
  const l = logger.getSubLogger({ name: 'runExample' });
  l.debug(exampleLogMessages.resolvingConfig('/tmp/example.yaml'));
  // ...
  l.error(exampleLogMessages.invalidState('orphaned'));
}
```

#### Design Rules for `log-messages.ts`

1. Only include messages that are single-purpose and local to the module.
2. Avoid duplicating wording across modules—if multiple modules need the same phrasing, create a shared helper module and update every caller in the same change.
3. Keep function names descriptive and action-oriented (`configResolved`, `downloadPlanned`, `checksumMismatch`).
4. Return values MUST be created via `createSafeLogMessage()`; never return raw strings.
5. Do not create log-level sub-objects (`error`, `debug`, etc.) inside `log-messages.ts`; selection of level happens at the call site. If you need strong grouping, group by intent not severity.
6. Avoid embedding method names in messages—the logger sublogger name provides that context.
7. No interpolation logic side-effects—pure formatting only.
8. Remove stale messages promptly; no deprecated placeholders.

#### When to Choose Global vs Local

| Scenario | Choose |
|----------|-------|
| Message expresses a domain concept used by multiple modules (e.g., archive extraction step) | Global category template |
| Message is tightly coupled to internal algorithm details of one module | Local `log-messages.ts` |
| Message might become reusable soon (already in 2+ modules) | Promote to global now |
| Temporary diagnostic while developing | Local (delete if no longer needed) |

#### Migration Guidance

When refactoring existing modules:
1. Identify inline string literals passed to logger calls.
2. Extract them into functions inside `log-messages.ts`.
3. Replace call sites with the new template functions.
4. If any extracted message clearly aligns with an existing global category, move it there instead.
5. Run `bun lint` to ensure no raw string violations remain (search heuristically for `logger.` usages followed by backticks/quotes).

This co-location rule is MANDATORY—new code introducing logger calls without a `log-messages.ts` (when custom messages exist) will be rejected.

### Usage Pattern (New Style)

```typescript
import { exampleLogMessages } from './log-messages';

logger.error(exampleLogMessages.invalidState('stale-index'));
logger.debug(exampleLogMessages.resolvingConfig('/tmp/example.yaml'));
```

## Creating New Templates (Module-Scoped Only)

DO NOT create new global categories. All new templates belong in the module's `log-messages.ts`.

### Steps
1. Create (or update) `src/modules/{feature}/log-messages.ts`.
2. Add intent-based functions returning `createSafeLogMessage()`.
3. Replace inline string literals at call sites.
4. If you find a pattern repeating across ≥2 modules, extract to a single shared module later (NOT the legacy category system).

### Example `log-messages.ts`

```typescript
import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const featureLogMessages = {
  starting: (mode: string) => createSafeLogMessage(`Starting feature in ${mode} mode`),
  finished: (durationMs: number) => createSafeLogMessage(`Feature completed in ${durationMs}ms`),
  cacheMiss: (key: string) => createSafeLogMessage(`Feature cache miss for ${key}`),
  invalidInput: (field: string, value: string) => createSafeLogMessage(`Invalid input ${field}=${value}`),
} satisfies SafeLogMessageMap;
```

**Modern TypeScript Pattern Benefits:**
- **Enhanced Type Inference:** The `satisfies` operator provides better type checking while preserving exact object types
- **Cleaner Syntax:** No need for verbose `: SafeLogMessage` return type annotations
- **Compile-time Validation:** Ensures template functions conform to `SafeLogMessageMap` interface
- **Better IDE Support:** Improved autocomplete and error detection

**Template Function Guidelines:**
- Use descriptive function names that clearly indicate the scenario
- Accept parameters that customize the message content
- Use `satisfies SafeLogMessageMap` for type validation (no explicit return types needed)
- Use `createSafeLogMessage()` to create branded strings
- Follow consistent naming conventions (camelCase)
- Include context information (resource names, operations, reasons)

### Template Design Best Practices (Modern Co-Located)

#### Message Formatting
- Use clear, actionable language
- Include relevant context (names, paths, values)
- Be specific about what failed and why
- Use consistent terminology across templates

#### Parameter Design
- Order parameters from most specific to most general
- Use descriptive parameter names
- Consider optional parameters for additional context
- Validate parameter types with TypeScript

#### Examples of Good Module Templates

```typescript
// ✅ Good - Specific, actionable, contextual
export const exampleTemplates = {
  notFound: (toolName: string, searchPath: string) => 
    createSafeLogMessage(`Tool "${toolName}" not found in ${searchPath}`),

  downloadFailed: (url: string, statusCode: number, reason: string) => 
    createSafeLogMessage(`Download failed from ${url} (HTTP ${statusCode}): ${reason}`),

  configurationInvalid: (field: string, value: string, expectedFormat: string) => 
    createSafeLogMessage(`Invalid configuration for "${field}": got "${value}", expected ${expectedFormat}`),
} satisfies SafeLogMessageMap;
```

Legacy anti-patterns to remove during migration:
```typescript
// ❌ Avoid adding new severity-nested objects or vague catch-alls
export const bad = {
  error: (m: string) => createSafeLogMessage(`Error: ${m}`),
};
```

## Log Level Guidelines (Call Site Responsibility)

### Error Level
- **When to use:** Critical failures that prevent operation completion
- **Examples:** File not found, network failures, validation errors
- **Message style:** Specific about what failed and why

### Warning Level  
- **When to use:** Recoverable issues, deprecated features, potential problems
- **Examples:** Using deprecated config, fallback behavior triggered
- **Message style:** Explain the issue and any automatic recovery

### Success Level
- **When to use:** Successful completion of significant operations
- **Examples:** Tool installed, file processed, operation completed
- **Message style:** Confirm what was accomplished

### Debug Level
- **When to use:** Internal state, method entry/exit, detailed progress
- **Examples:** Cache hits/misses, intermediate steps, variable values
- **Message style:** Technical details for debugging

## Template Categories Reference

## Legacy Category Reference (For Migration Only)

The following legacy categories exist only to support incremental migration. Do not add new methods:
- tool, config, cache, fs, service, command, archive, downloader, extractor, generator, registry, installer, symlink, shim

Migration approach:
1. Pick a category.
2. Search usages of its templates.
3. For each usage, decide: keep (promote to module `log-messages.ts`) or consolidate into a new shared reusable abstraction.
4. Remove the unused legacy template function.
5. Repeat until category file empties—then delete it.

## Testing Templates

### Unit Testing Template Functions

```typescript
import { expect, test } from 'bun:test';
import { exampleLogMessages } from '../log-messages';

test('example log templates produce correct messages', () => {
  const message = exampleLogMessages.invalidState('stale-index');

  expect(message).toContain('Invalid example state');
  expect(message).toContain('stale-index');
});
```

### Integration Testing with Logger

```typescript
import { TestLogger } from '@testing-helpers';
import { exampleLogMessages } from '../log-messages';

test('templates work with TestLogger', () => {
  const logger = new TestLogger();

  logger.error(exampleLogMessages.invalidState('stale-index'));

  logger.expect(['ERROR'], ['TestTarget'], ['Invalid example state: stale-index']);
});
```

## Advanced Patterns

### Conditional Templates (Module Scope)

```typescript
// Template with optional context
export const networkTemplates = {
  requestFailed: (url: string, error: string, retryCount?: number) => {
    const retryInfo = retryCount ? ` (attempt ${retryCount})` : '';
    return createSafeLogMessage(`Request to ${url} failed${retryInfo}: ${error}`);
  },
} satisfies SafeLogMessageMap;
```

### Template Composition (Module Scope)

```typescript
// Reusable message parts
const formatResource = (type: string, name: string) => `${type} "${name}"`;

export const resourceTemplates = {
  notFound: (type: string, name: string, location: string) => 
    createSafeLogMessage(`${formatResource(type, name)} not found in ${location}`),
    
  created: (type: string, name: string, location: string) => 
    createSafeLogMessage(`${formatResource(type, name)} created at ${location}`),
} satisfies SafeLogMessageMap;
```

## Troubleshooting

### Common Issues

**Template Not Found Error**
```
Property 'methodName' does not exist on type...
```
- Check that the template method exists in the correct level file
- Verify the category is exported in the main logger index
- Ensure proper import statement

**Type Safety Violations**
```
Argument of type 'string' is not assignable to parameter of type 'SafeLogMessage'
```
- Always use template functions, never raw strings
- Use `createSafeLogMessage()` only within template functions
- Verify template function return types

**Missing Templates During Migration**
- Extract missing string into module `log-messages.ts`
- Remove legacy usage once replaced
- Run `bun lint` to confirm no raw string regressions

### Debugging Templates

1. Check module `log-messages.ts` for function presence
2. If still using legacy `logs.*`, plan migration and create equivalent local message
3. Remove or refactor legacy template if no longer referenced
4. Add/adjust unit test to cover new local message

## Performance Considerations

- Module templates are minimal and inline-evaluated only when called
- No central registry lookup cost
- Keep functions pure and fast
- Avoid premature caching—optimize only if profiling shows hotspots

---

This modern co-located system provides type-safe, maintainable logging with minimal indirection. Migrate remaining legacy category usages steadily and avoid introducing new global templates.