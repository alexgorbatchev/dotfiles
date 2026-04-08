---
targets:
  - '*'
root: false
description: Project testing requirements.
globs:
  - '**/*'
---

# Project Testing

- `bun test:native [file]` - run a one or more test files with the native Bun test runner
- `bun test:all` - run all project tests in parallel with a custom test runner
- `bun lint` - run linting

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
- **toMatchLooseInlineSnapshot** - Custom matcher for flexible snapshot testing with regex patterns and loose matching
- **Mocking:**
  - `fetch` must be mocked, typically using the `FetchMockHelper` utility (imported from `@dotfiles/testing-helpers`).
  - All packages should be passed in as dependencies.
  - When mocking real public API calls, the `curl` command must be used to capture the real API response and store in fixtures.

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

- Folder `test-project` contains a few tools and a `dotfiles.config.ts` file that could be used for live testing, **but never in test files**.
- Use `bun cli --config=test-project/dotfiles.config.ts` to run the CLI with the test project configuration
- Sometimes it's necessary to delete `test-project/.generated` folder to force re-generating the project
