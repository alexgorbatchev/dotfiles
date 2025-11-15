# @dotfiles/testing-helpers

Testing utilities and helpers for the dotfiles generator system. Provides mock implementations, test fixtures, and helper functions to simplify testing across all packages.

## Overview

The testing-helpers package centralizes common testing utilities used across the dotfiles system. It provides mock servers, filesystem helpers, test fixtures, and custom matchers to make tests more maintainable and consistent.

## Features

- **Mock API Server**: Express-based server for mocking external APIs (GitHub, crates.io, etc.)
- **Test Directories**: Utilities for creating temporary test directories with cleanup
- **Fetch Mocking**: Helper for mocking global fetch in tests
- **Mock Configurations**: Factory functions for creating test configurations
- **Tool Config Builders**: Helpers for creating tool configuration fixtures
- **Custom Matchers**: Extended Jest/Bun matchers for flexible assertions
- **File Creation**: Utilities for creating test files with permissions

## API

### `createMockApiServer(options?: ServerOptions): MockApiServer`

Creates an Express server for mocking external APIs.

```typescript
import { createMockApiServer } from '@dotfiles/testing-helpers';

const server = createMockApiServer();

// Add routes
server.get('/api/releases/latest', (req, res) => {
  res.json({
    tag_name: 'v1.0.0',
    assets: [
      { name: 'tool-linux-amd64.tar.gz', browser_download_url: '/download/1' }
    ]
  });
});

// Serve binary files
server.get('/download/:id', (req, res) => {
  res.sendFile('/path/to/test/binary.tar.gz');
});

// Start server
const { url, port } = await server.listen();

// Use in tests
const response = await fetch(`${url}/api/releases/latest`);

// Cleanup
await server.close();
```

### `createTestDirectories(testName: string): TestDirectories`

Creates temporary test directories with automatic cleanup.

```typescript
import { createTestDirectories } from '@dotfiles/testing-helpers';

const { workingDir, homeDir, cleanup } = await createTestDirectories('my-test');

// Use directories in test
await fs.writeFile(path.join(workingDir, 'config.yaml'), '...');

// Cleanup automatically runs after test
// Or call manually: await cleanup();
```

**Returns:**
```typescript
interface TestDirectories {
  workingDir: string;    // Temporary working directory
  homeDir: string;       // Temporary home directory
  cleanup: () => Promise<void>;  // Cleanup function
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

test('fetch works', async () => {
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  expect(data.key).toBe('value');
});
```

### `createMockProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig`

Creates a mock project configuration with default values.

```typescript
import { createMockProjectConfig } from '@dotfiles/testing-helpers';

const config = createMockProjectConfig({
  paths: {
    targetDir: '/custom/bin',
    binariesDir: '/custom/binaries',
  },
});

// Use in tests
const generator = new ShimGenerator(logger, fileSystem, config);
```

### `createToolConfig(content: string, filename?: string): Promise<string>`

Creates a temporary tool configuration file.

```typescript
import { createToolConfig } from '@dotfiles/testing-helpers';

const toolConfigPath = await createToolConfig(`
  export default async (c) => {
    c.bin('fzf')
      .version('latest')
      .install('github-release', {
        repo: 'junegunn/fzf',
      });
  };
`, 'fzf.tool.ts');

// Load and use config
const toolConfigs = await loadToolConfigs(path.dirname(toolConfigPath), logger);
```

### `createFile(fs: IFileSystem, filePath: string, content: string, executable?: boolean): Promise<void>`

Creates a file with optional executable permissions.

```typescript
import { createFile } from '@dotfiles/testing-helpers';

// Create regular file
await createFile(fileSystem, '/path/to/file.txt', 'content');

// Create executable file
await createFile(fileSystem, '/path/to/script.sh', '#!/bin/bash\necho "hello"', true);
```

### `createMock$(options?: MockShellOptions): MockShell`

Creates a mock Bun shell executor for testing.

```typescript
import { createMock$ } from '@dotfiles/testing-helpers';

const mock$ = createMock$();

// Configure mock responses
mock$.mockCommand('git --version', {
  stdout: 'git version 2.40.0',
  exitCode: 0,
});

// Use in code under test
const result = await mock$`git --version`;
expect(result.stdout).toContain('git version');

// Verify commands were called
expect(mock$.wasCommandCalled('git --version')).toBe(true);
```

## Custom Matchers

### `toMatchLooseInlineSnapshot(snapshot: string)`

Custom matcher for flexible snapshot testing with regex patterns.

```typescript
import '@dotfiles/testing-helpers/matchers';

test('loose snapshot matching', () => {
  const output = `
    Tool: fzf
    Version: 0.43.0
    Path: /home/user/.dotfiles/tools/fzf
    Size: 1234567 bytes
  `;
  
  expect(output).toMatchLooseInlineSnapshot(`
    Tool: fzf
    Version: \\d+\\.\\d+\\.\\d+
    Path: /.*/.dotfiles/tools/fzf
    Size: \\d+ bytes
  `);
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
import { 
  createTestDirectories, 
  createMockProjectConfig,
  FetchMockHelper,
  createMockApiServer 
} from '@dotfiles/testing-helpers';

describe('MyFeature', () => {
  let testDirs: TestDirectories;
  let config: ProjectConfig;
  let fetchMock: FetchMockHelper;
  let apiServer: MockApiServer;
  
  beforeEach(async () => {
    // Setup test directories
    testDirs = await createTestDirectories('my-feature-test');
    
    // Create config
    config = createMockProjectConfig({
      paths: {
        targetDir: testDirs.workingDir,
      },
    });
    
    // Setup fetch mock
    fetchMock = new FetchMockHelper();
    fetchMock.setup();
    
    // Setup API server
    apiServer = createMockApiServer();
    apiServer.get('/api/data', (req, res) => {
      res.json({ data: 'test' });
    });
    await apiServer.listen();
  });
  
  afterEach(async () => {
    await testDirs.cleanup();
    fetchMock.restore();
    await apiServer.close();
  });
  
  test('my test', async () => {
    // Test implementation
  });
});
```

### Testing Tool Installation

```typescript
import { 
  createMockApiServer,
  createMockProjectConfig,
  createTestDirectories 
} from '@dotfiles/testing-helpers';

test('installs tool from GitHub release', async () => {
  const server = createMockApiServer();
  const testDirs = await createTestDirectories('install-test');
  
  // Mock GitHub API
  server.get('/repos/:owner/:repo/releases/latest', (req, res) => {
    res.json({
      tag_name: 'v1.0.0',
      assets: [{
        name: 'tool-linux-amd64.tar.gz',
        browser_download_url: `${server.url}/download/asset`,
      }],
    });
  });
  
  // Serve binary
  server.get('/download/asset', (req, res) => {
    res.sendFile('/fixtures/tool.tar.gz');
  });
  
  const { url } = await server.listen();
  
  // Test installation
  const installer = new Installer(/* ... */);
  const result = await installer.install('tool', {
    installationMethod: 'github-release',
    installParams: {
      repo: 'owner/repo',
      githubApiUrl: url,
    },
  });
  
  expect(result.success).toBe(true);
  
  await server.close();
  await testDirs.cleanup();
});
```

### Testing with Fixtures

```typescript
import { createToolConfig } from '@dotfiles/testing-helpers';
import path from 'node:path';

test('loads tool configuration', async () => {
  const configPath = await createToolConfig(`
    export default async (c) => {
      c.bin('ripgrep')
        .version('14.0.0')
        .install('github-release', {
          repo: 'BurntSushi/ripgrep',
          assetPattern: '*linux*amd64*.tar.gz',
        });
    };
  `, 'ripgrep.tool.ts');
  
  const configDir = path.dirname(configPath);
  const toolConfigs = await loadToolConfigs(configDir, logger);
  
  expect(toolConfigs.ripgrep).toBeDefined();
  expect(toolConfigs.ripgrep.version).toBe('14.0.0');
});
```

## Test Patterns

### Arrange-Act-Assert

```typescript
test('generates shims', async () => {
  // Arrange
  const testDirs = await createTestDirectories('shim-test');
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
- `@dotfiles/schemas` - Schema types
- `@dotfiles/utils` - Utility types

### External Dependencies
- `express` - HTTP server for mocking APIs

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

### Why Mock Servers Instead of Stubs?
Mock servers provide:
- Realistic network behavior
- HTTP-level testing
- Easy debugging
- Reusable fixtures

### Why Custom Matchers?
Custom matchers:
- Express test intent clearly
- Handle complex assertions
- Improve error messages
- Support domain-specific testing

## Best Practices

### Always Clean Up Resources

```typescript
afterEach(async () => {
  await testDirs.cleanup();
  await server.close();
  fetchMock.restore();
});
```

### Use Descriptive Test Names

```typescript
test('creates temporary directory with unique name', async () => {
  const dirs1 = await createTestDirectories('test');
  const dirs2 = await createTestDirectories('test');
  
  expect(dirs1.workingDir).not.toBe(dirs2.workingDir);
});
```

### Isolate Tests

```typescript
// Each test gets its own directories
test('test 1', async () => {
  const dirs = await createTestDirectories('test-1');
  // Use dirs
  await dirs.cleanup();
});

test('test 2', async () => {
  const dirs = await createTestDirectories('test-2');
  // Use dirs
  await dirs.cleanup();
});
```

### Use Fixtures for Complex Data

```typescript
// Store complex test data in fixtures
const FIXTURE_GITHUB_RELEASE = {
  tag_name: 'v1.0.0',
  assets: [/* ... */],
};

test('parses GitHub release', () => {
  const release = parseRelease(FIXTURE_GITHUB_RELEASE);
  expect(release.version).toBe('1.0.0');
});
```

## Future Enhancements

Potential improvements:
- Snapshot testing utilities
- Performance testing helpers
- Database mocking utilities
- Network condition simulation
- Time manipulation utilities
- Memory leak detection
- Test data generators
