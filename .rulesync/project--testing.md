---
root: false
targets: ["*"]
description: Project testing requirements.
globs:
  - '**/*'
---

# Project Testing Requirements

- `bun run test {file}` - Run a single test file.
- `bun run test` - Run all tests.
- `bun lint` - Run linting.
- Do not run `tsc` directly. 

## Available Testing Helpers

Before creating any bespoke mocks, check the `src/testing-helpers` directory to see if there is a utility that can be used. If not, create a new utility in that directory.

- **FetchMockHelper** - Helper for spying on and mocking `globalThis.fetch` in tests with configurable responses and error simulation
- **TestLogger** - Extended logger for tests that captures logs for verification with `expect()` methods and filtering capabilities
- **createMemFileSystem** - Creates in-memory file system for testing with customizable mock implementations and initial directory structure
- **createMockYamlConfig** - Factory for creating mock YAML configurations with partial overrides and default values
- **createMockGitHubServer** - Express server mock for GitHub API endpoints and binary downloads with configurable responses
- **createTestDirectories** - Utility for setting up temporary test directories with proper cleanup and path configuration
- **createToolConfig** - Helper for creating tool configuration files from content or fixtures for testing
- **createFile** - Simple utility for creating files with optional executable permissions in test file systems
- **executeCliCommand** - Executes CLI commands in test environment with custom environment variables and working directory
- **toMatchLooseInlineSnapshot** - Custom matcher for flexible snapshot testing with regex patterns and loose matching
- **Mocking:**
  - `fetch` must be mocked, typically using the `FetchMockHelper` utility (imported from `@testing-helpers`).
  - All modules should be passed in as dependencies.
  - When mocking real public API calls, the `curl` command must be use to capture the real API response and must be captured in fixtures. An `express` server must be used to serve the fixtures. 
  - module mocking is 
- **Testing Framework:** The project uses `bun:test` framework and `bun run test {file}` command to run tests.

## How to Mock External Modules

```typescript
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';

setupTestCleanup();
const mockModules = createModuleMocker();

describe('...', () => {
  beforeEach(async () => {
    await mockModules.mock('@/hooks', () => ({
      useUser: () => ({ id: 1, name: 'Test User' })
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
