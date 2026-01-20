# @dotfiles/testing-helpers

Testing utilities and helpers for the dotfiles generator system. Provides mock implementations, test fixtures, and helper functions to simplify testing across all packages.

## Overview

The testing-helpers package centralizes common testing utilities used across the dotfiles system. It provides filesystem helpers, test fixtures, and custom matchers to make tests more maintainable and consistent.

## Features

- **Test Directories**: Utilities for creating temporary test directories with cleanup
- **Fetch Mocking**: Helper for mocking global fetch in tests
- **Mock Configurations**: Factory functions for creating test configurations
- **Custom Matchers**: Extended Jest/Bun matchers for flexible assertions
- **File Registry Mocking**: Mock file registry for testing

## API

### `createITestDirectories(testName: string): ITestDirectories`

Creates temporary test directories with automatic cleanup.

```typescript
import { createITestDirectories } from '@dotfiles/testing-helpers';

const { workingDir, homeDir, cleanup } = await createITestDirectories('my-test');

// Use directories in test
await fs.writeFile(path.join(workingDir, 'config.yaml'), '...');

// Cleanup automatically runs after test
// Or call manually: await cleanup();
```

**Returns:**

```typescript
interface ITestDirectories {
  workingDir: string; // Temporary working directory
  homeDir: string; // Temporary home directory
  cleanup: () => Promise<void>; // Cleanup function
}
```

### `FetchMockHelper`

Helper class for mocking global fetch in tests.

```typescript
import { FetchMockHelper } from '@dotfiles/testing-helpers';

const fetchMock = new FetchMockHelper();

beforeEach(() => {
  fetchMock.setup();

  // Mock successful response
  fetchMock.mockResponse('https://api.example.com/data', {
    status: 200,
    body: JSON.stringify({ key: 'value' }),
  });

  // Mock error response
  fetchMock.mockResponse('https://api.example.com/error', {
    status: 404,
    body: 'Not Found',
  });
});

afterEach(() => {
  fetchMock.restore();
});
```

**Methods:**

- `setup()` - Initialize the mock
- `mockResponse(url, options)` - Mock a specific URL
- `mockError(url, error)` - Mock a network error
- `restore()` - Restore original fetch
- `getCalls()` - Get all fetch calls made
- `getCallCount(url?)` - Get call count for URL

### `createMockProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig`

Creates a mock project configuration for testing.

```typescript
import { createMockProjectConfig } from '@dotfiles/testing-helpers';

const config = createMockProjectConfig({
  paths: {
    targetDir: '/test/target',
    homeDir: '/test/home',
  },
});
```

### `createMockFileRegistry(overrides?: Partial<FileRegistry>): FileRegistry`

Creates a mock file registry for testing.

```typescript
import { createMockFileRegistry } from '@dotfiles/testing-helpers';

const registry = createMockFileRegistry({
  files: new Map([['tool.sh', { path: '/bin/tool.sh', hash: 'abc123' }]]),
});
```

### `createMock$(overrides?): MockedShell`

Creates a mock shell command executor.

```typescript
import { createMock$ } from '@dotfiles/testing-helpers';

const mock$ = createMock$();
mock$.mockCommand('which brew', { stdout: '/opt/homebrew/bin/brew', exitCode: 0 });
```

### Custom Matchers

#### `toMatchLooseInlineSnapshot`

Matches output with regex patterns and whitespace normalization.

```typescript
import '@dotfiles/testing-helpers';

test('loose snapshot matching', () => {
  const output = `
    Tool: fzf
    Version: 0.43.0
    Path: /home/user/.dotfiles/tools/fzf
    Size: 1234567 bytes
  `;

  expect(output).toMatchLooseInlineSnapshot`
    Tool: fzf
    Version: \\d+\\.\\d+\\.\\d+
    Path: /.*/.dotfiles/tools/fzf
    Size: \\d+ bytes
  `;
});
```

**Features:**

- Regex pattern support
- Whitespace normalization
- Flexible line matching
- Useful for timestamps, paths, and dynamic values

## Usage Examples

### Complete Test Setup

```typescript
import { createITestDirectories, createMockProjectConfig, FetchMockHelper } from '@dotfiles/testing-helpers';

describe('MyFeature', () => {
  let testDirs: ITestDirectories;
  let config: ProjectConfig;
  let fetchMock: FetchMockHelper;

  beforeEach(async () => {
    // Setup test directories
    testDirs = await createITestDirectories('my-feature-test');

    // Create config
    config = createMockProjectConfig({
      paths: {
        targetDir: testDirs.workingDir,
      },
    });

    // Setup fetch mock
    fetchMock = new FetchMockHelper();
    fetchMock.setup();
  });

  afterEach(async () => {
    await testDirs.cleanup();
    fetchMock.restore();
  });

  test('my test', async () => {
    // Test implementation
  });
});
```

### Mocking HTTP Responses

```typescript
import { FetchMockHelper } from '@dotfiles/testing-helpers';

test('fetches data from API', async () => {
  const fetchMock = new FetchMockHelper();
  fetchMock.setup();

  fetchMock.mockResponse('https://api.github.com/repos/owner/repo/releases/latest', {
    status: 200,
    body: JSON.stringify({
      tag_name: 'v1.0.0',
      assets: [{ name: 'tool-linux-amd64.tar.gz', browser_download_url: 'https://example.com/download' }],
    }),
  });

  const response = await fetch('https://api.github.com/repos/owner/repo/releases/latest');
  const data = await response.json();

  expect(data.tag_name).toBe('v1.0.0');

  fetchMock.restore();
});
```

## Test Patterns

### Arrange-Act-Assert

```typescript
test('generates shims', async () => {
  // Arrange
  const testDirs = await createITestDirectories('shim-test');
  const config = createMockProjectConfig({
    paths: { targetDir: testDirs.workingDir },
  });
  const generator = new ShimGenerator(logger, fileSystem, config);

  // Act
  const shimPaths = await generator.generate(toolConfigs);

  // Assert
  expect(shimPaths).toHaveLength(3);
  expect(shimPaths[0]).toContain('fzf');

  await testDirs.cleanup();
});
```

### Setup/Teardown

```typescript
describe('Feature', () => {
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = await setupTestContext();
  });

  afterEach(async () => {
    await teardownTestContext(testContext);
  });

  test('test case', async () => {
    // Use testContext
  });
});
```

## Dependencies

### Internal Dependencies

- `@dotfiles/config` - Configuration types
- `@dotfiles/file-system` - Filesystem types
- `@dotfiles/logger` - Logger types
- `@dotfiles/utils` - Utility types

## Testing the Helpers

Run tests with:

```bash
bun test packages/testing-helpers
```

## Design Decisions

### Why Centralize Test Helpers?

Centralizing test utilities:

- Eliminates duplication
- Ensures consistency
- Simplifies maintenance
- Makes tests more readable

### Why Custom Matchers?

Custom matchers:

- Clarify test intent
- Handle complex assertions
- Improve error messages
- Support domain-specific testing

## Best Practices

### Always Clean Up Resources

```typescript
afterEach(async () => {
  await testDirs.cleanup();
  fetchMock.restore();
});
```

### Use Descriptive Test Names

```typescript
test('creates temporary directory with unique name', async () => {
  const dirs1 = await createITestDirectories('test');
  const dirs2 = await createITestDirectories('test');

  expect(dirs1.workingDir).not.toBe(dirs2.workingDir);
});
```

### Isolate Tests

```typescript
// Each test gets its own directories
test('test 1', async () => {
  const dirs = await createITestDirectories('test-1');
  // Use dirs
  await dirs.cleanup();
});

test('test 2', async () => {
  const dirs = await createITestDirectories('test-2');
  // Use dirs
  await dirs.cleanup();
});
```

### Use Fixtures for Complex Data

```typescript
// Store complex test data in fixtures
const FIXTURE_GITHUB_RELEASE = {
  tag_name: 'v1.0.0',
  assets: [
    /* ... */
  ],
};

test('parses GitHub release', () => {
  const release = parseRelease(FIXTURE_GITHUB_RELEASE);
  expect(release.version).toBe('1.0.0');
});
```
