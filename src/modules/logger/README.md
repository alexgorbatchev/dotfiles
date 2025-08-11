# Log Templates System

A unified, type-safe logging template system that provides structured, consistent log messages across the entire application.

## Overview

The log templates system provides a unified approach to logging that:
- Ensures type safety with `SafeLogMessage` branded strings and `SafeLogMessageMap` validation
- Provides consistent message formatting across all modules  
- Organizes templates by functional domain and log level
- Uses modern TypeScript `satisfies` operator for enhanced type inference
- Supports internationalization and message standardization
- Enables easy maintenance and debugging

## Architecture

### Directory Structure

```
src/modules/logger/templates/
├── {category}/
│   ├── error.ts                     # Error-level templates
│   ├── warning.ts                   # Warning-level templates
│   ├── success.ts                   # Success-level templates
│   ├── debug.ts                     # Debug-level templates
│   └── index.ts                     # Category aggregator 
└── index.ts                         # Main aggregator 
```

### Usage Pattern

```typescript
import { logs } from '@modules/logger';

// Use structured logging templates
logger.error(logs.tool.error.installFailed('github-release', 'fzf', 'Network timeout'));
logger.info(logs.tool.success.installed('fzf', '0.42.0'));
logger.debug(logs.cache.debug.notFound('download-cache-key'));
logger.warn(logs.config.warning.deprecated('old-setting', 'new-setting'));
```

## Creating New Templates

### Step 1: Choose or Create a Category

Categories represent functional domains in the application:

**Existing Categories:**
- `tool` - Tool lifecycle operations (install, update, cleanup)
- `config` - Configuration loading and validation
- `cache` - Caching operations
- `fs` - File system operations
- `service` - External service interactions (GitHub API, etc.)
- `command` - CLI command execution
- `archive` - Archive extraction and processing
- `downloader` - Download operations
- `extractor` - Archive extraction
- `generator` - Code/config generation
- `registry` - File registry operations
- `installer` - Installation process
- `symlink` - Symbolic link operations
- `shim` - Binary shim generation

### Step 2: Create Template Files

#### 2.1 Create the Category Aggregator

**File:** `src/modules/logger/templates/{category}/index.ts`

```typescript
import { {category}ErrorTemplates } from './error';
import { {category}WarningTemplates } from './warning';
import { {category}SuccessTemplates } from './success';
import { {category}DebugTemplates } from './debug';

/**
 * {Category description} templates grouped by log level
 */
export const {category} = {
  error: {category}ErrorTemplates,
  warning: {category}WarningTemplates,
  success: {category}SuccessTemplates,
  debug: {category}DebugTemplates,
} as const;
```

#### 2.2 Create Level-Specific Templates

**File:** `src/modules/logger/templates/{category}/error.ts`

```typescript
import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const {category}ErrorTemplates = {
  operationFailed: (operation: string, resource: string, reason: string) => 
    createSafeLogMessage(`${operation} failed for ${resource}: ${reason}`),
  
  resourceNotFound: (resource: string, location: string) => 
    createSafeLogMessage(`Resource "${resource}" not found in ${location}`),
    
  // Add more templates as needed
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

### Step 3: Update Main Logger Export

**File:** `src/modules/logger/index.ts`

```typescript
// Add import for new category
import { newCategory } from './templates/newCategory';

// Add to logs export object
export const logs = {
  // ... existing categories
  newCategory,
};
```

### Step 4: Template Design Best Practices

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

#### Examples of Good Templates

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

```typescript
// ❌ Bad - Vague, missing context
export const badTemplates = {
  failed: (message: string) => 
    createSafeLogMessage(`Operation failed: ${message}`),

  error: () => 
    createSafeLogMessage('An error occurred'),
} satisfies SafeLogMessageMap;
```

## Log Level Guidelines

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

### Core Operation Categories

#### `tool` - Tool Lifecycle
- **Error:** Installation failures, dependency issues, version conflicts
- **Warning:** Update recommendations, compatibility concerns
- **Success:** Successful installations, updates, cleanups
- **Debug:** Installation steps, binary resolution, version checking

#### `config` - Configuration Management
- **Error:** Invalid configurations, missing required fields, parse errors
- **Warning:** Deprecated settings, fallback configurations, validation warnings
- **Success:** Configuration loaded, validation passed, settings applied
- **Debug:** Configuration sources, validation steps, resolved values

#### `fs` - File System Operations
- **Error:** Permission denied, file not found, disk space issues
- **Warning:** File overwrite, permission issues, path concerns
- **Success:** Files created/copied/moved, directories created, cleanup completed
- **Debug:** File operations, path resolution, permission checks

### Infrastructure Categories

#### `cache` - Caching System
- **Error:** Cache corruption, storage failures, serialization errors
- **Warning:** Cache misses, expiration notices, size limits
- **Success:** Cache hits, successful storage, cleanup completed
- **Debug:** Cache operations, key generation, storage statistics

#### `service` - External Services
- **Error:** API failures, authentication issues, service unavailable
- **Warning:** Rate limiting, deprecated APIs, fallback behavior
- **Success:** API calls completed, authentication successful, data retrieved
- **Debug:** Request/response details, authentication steps, retry logic

#### `downloader` - Download Operations
- **Error:** Network failures, invalid URLs, corrupted downloads
- **Warning:** Slow downloads, retry attempts, fallback sources
- **Success:** Downloads completed, checksums verified, files cached
- **Debug:** Download progress, URL resolution, strategy selection

## Testing Templates

### Unit Testing Template Functions

```typescript
import { expect, test } from 'bun:test';
import { logs } from '@modules/logger';

test('tool error templates produce correct messages', () => {
  const message = logs.tool.error.installFailed('github-release', 'fzf', 'Network timeout');
  
  expect(message).toContain('Installation failed');
  expect(message).toContain('[github-release]');
  expect(message).toContain('fzf');
  expect(message).toContain('Network timeout');
});
```

### Integration Testing with Logger

```typescript
import { TestLogger } from '@testing-helpers';
import { logs } from '@modules/logger';

test('templates work with TestLogger', () => {
  const logger = new TestLogger();
  
  logger.error(logs.tool.error.installFailed('github-release', 'fzf', 'Network timeout'));
  
  logger.expect(['ERROR'], ['TestTarget'], [
    logs.tool.error.installFailed('github-release', 'fzf', 'Network timeout')
  ]);
});
```

## Advanced Patterns

### Conditional Templates

```typescript
// Template with optional context
export const networkTemplates = {
  requestFailed: (url: string, error: string, retryCount?: number) => {
    const retryInfo = retryCount ? ` (attempt ${retryCount})` : '';
    return createSafeLogMessage(`Request to ${url} failed${retryInfo}: ${error}`);
  },
} satisfies SafeLogMessageMap;
```

### Template Composition

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

### Template Validation

```typescript
// Runtime validation for complex templates
export const validatedTemplates = {
  complexOperation: (config: OperationConfig) => {
    if (!config.name || !config.target) {
      throw new Error('Template requires name and target in config');
    }
    return createSafeLogMessage(`Operation "${config.name}" targeting ${config.target}`);
  },
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
- Check old template files for method names
- Add missing methods to new template structure
- Run `bun lint` to identify compilation errors

### Debugging Templates

1. **Check Template Definition:** Verify the template exists in the correct category/level
2. **Verify Exports:** Ensure all levels are exported in category aggregator
3. **Check Main Export:** Confirm category is exported in main logger index
4. **Test Template Function:** Create unit test to verify template produces expected output

## Performance Considerations

- Template functions are lightweight and cacheable
- String interpolation happens only when templates are called
- Use parameter validation sparingly to avoid runtime overhead
- Consider template caching for frequently-used messages with dynamic content

---

This unified template system provides type-safe, consistent, maintainable logging across the entire application. Follow the patterns and guidelines above to create effective log templates that improve debugging and monitoring capabilities.