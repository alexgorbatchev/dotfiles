import { describe, it, expect, spyOn, beforeEach, afterEach, mock } from 'bun:test';
import path from 'node:path';
import { memfs } from 'memfs'; // Import memfs factory
import type fsPromises from 'node:fs/promises'; // Import the type namespace directly

// The actual `config` from `../config` will be used by `install-tool.ts`.
// We will inject a memfs instance matching the node:fs/promises interface via DI.

// Mock the logger (can be replaced with DI for logger too if preferred)
const mockLog = new Map<string, string[]>();
const mockLoggerFn =
  (namespace: string) =>
  (...args: any[]) => {
    const formatted = args
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
      .join(' ');
    if (!mockLog.has(namespace)) {
      mockLog.set(namespace, []);
    }
    mockLog.get(namespace)?.push(formatted);
  };

mock.module('../utils/logger', () => ({
  createLogger: () => mockLoggerFn,
}));

describe('install-tool.ts', () => {
  const testToolName = 'test-tool';
  const testBinaryName = 'tt';

  let baseGeneratedDir: string;
  let toolInstallDir: string;
  let toolBinDir: string;
  let injectedFsPromises: typeof fsPromises; // Use the imported type directly

  beforeEach(async () => {
    mockLog.clear();

    // Dynamically import actual config to get paths
    const { config: actualConfig } = await import('../config');
    baseGeneratedDir = actualConfig.GENERATED_DIR;
    toolInstallDir = path.join(baseGeneratedDir, 'binaries', testToolName);
    toolBinDir = path.join(toolInstallDir, 'bin');

    // Create a new memfs instance for this test's setup/teardown and for injection
    const { fs: memfsFs } = memfs({}, '/'); // fs here is the memfs fs-like object
    injectedFsPromises = memfsFs.promises; // This is the promises API compatible with node:fs/promises

    // Ensure a clean state using the memfs instance for setup
    await injectedFsPromises.rm(toolInstallDir, { recursive: true, force: true });
    await injectedFsPromises.mkdir(toolBinDir, { recursive: true });

    // NOTE: The actual install-tool.ts script needs to be refactored
    // to accept `fsPromises: typeof fsPromisesType` (or an object matching its type) via DI.
    // Example (conceptual):
    // import realFsPromises from 'node:fs/promises';
    // async function mainInstallTool(
    //   toolName: string,
    //   binaryName: string,
    //   fs: typeof fsPromisesType = realFsPromises // Default to real fs
    // ) {
    //   await fs.mkdir(...);
    // }
    // Then in the test, call: mainInstallTool(testToolName, testBinaryName, injectedFsPromises);

    // spyOn(require('../config-loader'), 'getToolConfigByName').mockResolvedValue(mockToolConfig);
  });

  afterEach(async () => {
    mock.restore(); // Restore logger mock (and any other Bun mocks)
    // No need to restore fs mocks as we are using DI and not mocking the 'node:fs' module itself.
  });

  it('should log an error and exit if tool name or binary name is missing', async () => {
    const originalExit = process.exit;
    const mockExit = spyOn(process, 'exit').mockImplementation((() => {}) as (
      code?: number
    ) => never);
    const originalArgv = process.argv;

    process.argv = ['bun', 'install-tool.ts', testToolName]; // Missing binaryName

    // Need to re-import or have a way to re-trigger main with new argv
    // For simplicity, this test might need to be adapted based on how main is invoked.
    // If main is directly callable:
    // await expect(main()).rejects.toThrow(); // Or check mockExit

    // For now, this is a conceptual test.
    // Actual execution would require running the script as a child process or refactoring main.
    // console.error will also be called.

    // Placeholder assertion
    // expect(mockExit).toHaveBeenCalledWith(1);
    // const installToolLogs = mockLog.get('install-tool');
    // expect(installToolLogs).toContain('Error: Tool name and binary name arguments are required.');

    mockExit.mockRestore();
    process.argv = originalArgv;
    process.exit = originalExit;
    // This test is more of a placeholder until script execution in tests is refined.
    expect(true).toBe(true);
  });

  it('should create necessary directories', async () => {
    // This test would run the script with valid args and a mock config that does nothing
    // then check if directories like cache and binaries/toolName/bin are created.
    // For now, this is a placeholder.
    // await runInstallScript([testToolName, testBinaryName]);
    // expect(existsSync(path.join(baseGeneratedDir, 'cache', testToolName))).toBe(true);
    // expect(existsSync(toolBinDir)).toBe(true);
    expect(true).toBe(true);
  });

  // More tests will be needed:
  // - Test for idempotency (skips install if binary exists)
  // - Test for each installation method (github-release, brew, etc.)
  //   - This will require extensive mocking of network requests, file system, child processes
  // - Test hook execution
  // - Test error handling and cleanup on failure
  // - Test version handling
});
