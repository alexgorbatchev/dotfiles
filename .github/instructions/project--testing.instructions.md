---
description: Project testing requirements.
applyTo: '**/*'
---

# Project Testing Requirements

**All tests must work in an offline CI environment.** Tests cannot make real network requests. All external dependencies (HTTP APIs, downloads) must be mocked using fixtures or test helpers.

- `bun test [file]` - Run a single test file
- `bun lint` - Run linting

## Available Testing Helpers

Before creating any bespoke mocks, check for existing testing utilities. Shared utilities are located in the `@dotfiles/testing-helpers` package. Package-specific helpers may be co-located within the package's `src/testing-helpers` directory. Always verify the location of a helper before assuming it resides in the shared package.

- **FetchMockHelper** - Helper for spying on and mocking `globalThis.fetch` in tests with configurable responses and error simulation
- **TestLogger** - Extended logger for tests that captures logs for verification with `expect()` methods and filtering capabilities
- **createMemFileSystem** - Creates in-memory file system for testing with customizable mock implementations and initial directory structure
- **createMockProjectConfig** - Factory for creating mock project configurations with partial overrides and default values
- **createTestDirectories** - Utility for setting up temporary test directories with proper cleanup and path configuration
- **createToolConfig** - Helper for creating tool configuration files from content or fixtures for testing
- **createFile** - Simple utility for creating files with optional executable permissions in test file systems
- **executeCliCommand** - Executes CLI commands in test environment with custom environment variables and working directory
- **toMatchLooseInlineSnapshot** - Custom matcher for flexible snapshot testing with surrounding context (requires 2+ lines)
- **toMatchRegex** - Custom matcher for single-line regex matching (rejects multi-line input)
- **Mocking:**
  - `fetch` must be mocked, typically using the `FetchMockHelper` utility (imported from `@dotfiles/testing-helpers`).
  - All packages should be passed in as dependencies.
  - When mocking real public API calls, the `curl` command must be used to capture the real API response and store in fixtures.

## String Matching in Tests

**Partial string matchers like `toContain()` and `toMatch()` are prohibited** because they can cause false positives by matching unintended content.

### Use `toMatchLooseInlineSnapshot` for Multi-line Content

When verifying multi-line output or content that needs surrounding context, use `toMatchLooseInlineSnapshot`. **Must include at least 2 lines of content** to capture meaningful context.

```typescript
// ❌ BAD: Single line - not enough context
expect(script).toMatchLooseInlineSnapshot`
  source /path/to/file
`;

// ❌ BAD: Using toContain - can match unintended content
expect(script).toContain('source /path/to/file');

// ✅ GOOD: Multiple lines with surrounding context
expect(script).toMatchLooseInlineSnapshot`
  # Generated via dotfiles
  source /path/to/file
  export PATH
`;
```

### Use `toMatchRegex` for Single-line Regex Patterns

When verifying single-line strings with regex patterns, use `toMatchRegex`. This matcher **rejects multi-line input** to enforce proper context capture.

```typescript
// ❌ BAD: Using toMatch - prohibited
expect(version).toMatch(/\d+\.\d+\.\d+/);

// ✅ GOOD: Single-line regex matching
expect(version).toMatchRegex(/\d+\.\d+\.\d+/);

// ❌ BAD: toMatchRegex with multi-line input - will fail
expect(multiLineContent).toMatchRegex(/pattern/);
// Error: Input contains newlines. Use 'toMatchLooseInlineSnapshot' instead.
```

### Use `toBe` or `toEqual` for Exact Matches

For exact string comparisons without patterns:

```typescript
// ✅ GOOD: Exact match
expect(result.name).toBe('expected-value');
expect(result.message).toEqual('Installation complete');
```

### Summary

| Scenario                        | Matcher                      | Example                |
| ------------------------------- | ---------------------------- | ---------------------- |
| Multi-line content with context | `toMatchLooseInlineSnapshot` | Scripts, configs, logs |
| Single-line regex pattern       | `toMatchRegex`               | Versions, paths, IDs   |
| Exact string match              | `toBe` / `toEqual`           | Names, messages        |
| **PROHIBITED**                  | `toContain`, `toMatch`       | -                      |

## Test Coverage Requirements

- **Coverage Analysis**: Use test coverage tools to identify missing tests and uncovered code paths
- **Coverage Reporting**: Test coverage must be measured and reported for every package
- **Branch Coverage**: Focus on branch coverage, not just line coverage, to ensure all code paths are tested
- **Coverage Enforcement**: Test coverage must be verified and maintained within the 85-95% range

## How to Mock External Modules

```typescript
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';

setupTestCleanup();
const mockModules = createModuleMocker();

describe('...', () => {
  beforeEach(async () => {
    await mockModules.mock('@/hooks', () => ({
      useUser: () => ({ id: 1, name: 'Test User' }),
    }));
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });
});
```

## Testing project

- Folder `test-project` contains a few tools and `config.ts` file that should be used for live testing
- Use `bun cli --config=test-project/config.ts` to run the CLI with the test project configuration
- Sometimes it's necessary to delete `test-project/.generated` folder to force re-generating the project
