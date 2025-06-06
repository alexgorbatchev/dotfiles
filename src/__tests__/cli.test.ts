/**
 * @file generator/src/__tests__/cli.test.ts
 * @description Tests for the main CLI entry point.
 *
 * ## Development Plan
 * - [x] Create basic test structure.
 * - [x] Test that the `generate` command can be called.
 *   - [x] Verify `GeneratorOrchestrator.generateAll` is called (using spyOn).
 *   - [x] Ensure `setupServices` is called with correct `dryRun` flag.
 *   - [x] Verify `GeneratorOrchestrator.generateAll` is called *without* `dryRun` option.
 *   - [x] Verify correct `IFileSystem` (MemFileSystem/NodeFileSystem) is intended by `setupServices` based on `dryRun` flag.
 * - [x] Test error handling for the `generate` command (Completed).
 * - [ ] Test other commands as they are implemented.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update tests to mock/spy on the real `loadToolConfigs` and verify it's called correctly.
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { expect, test, describe, spyOn, mock, afterEach, beforeEach } from 'bun:test';
import type {
  IGeneratorOrchestrator,
  GenerateAllOptions as OrchestratorGenerateAllOptions,
} from '../modules/generator-orchestrator/IGeneratorOrchestrator';
import type { ToolConfig, GeneratedArtifactsManifest } from '../types';
import type { AppConfig } from '../modules/config';
// IFileSystem import removed as it's unused
import { MemFileSystem } from '../modules/file-system/MemFileSystem';
import { NodeFileSystem } from '../modules/file-system/NodeFileSystem';
import type { IDownloader } from '../modules/downloader/IDownloader';
import type { IGitHubApiCache } from '../modules/github-client/IGitHubApiCache';
import type { IGitHubApiClient } from '../modules/github-client/IGitHubApiClient';
import type { IShimGenerator } from '../modules/generator-shim/IShimGenerator';
import type { IShellInitGenerator } from '../modules/generator-shell-init/IShellInitGenerator';
import type { ISymlinkGenerator } from '../modules/generator-symlink/ISymlinkGenerator';

// Mock the imported functions from cli.ts
const mockGenerateAll = mock(
  async (
    _toolConfigs: Record<string, ToolConfig>,
    _options?: OrchestratorGenerateAllOptions
  ): Promise<GeneratedArtifactsManifest> => {
    return {
      lastGenerated: new Date().toISOString(),
      shims: [],
      shellInit: { path: null },
      symlinks: [],
      generatorVersion: 'mocked-version',
    };
  }
);

const mockGeneratorOrchestrator: IGeneratorOrchestrator = {
  generateAll: mockGenerateAll,
};

// Spies for the imported functions from cli.ts
// Spies for the imported functions from cli.ts
// We import the module as cli to allow spying on its exports.
import * as cliModule from '../cli'; // Renamed to cliModule to avoid conflict
import * as configLoaderModule from '../modules/config-loader/toolConfigLoader'; // Import the actual module

let setupServicesSpy: ReturnType<typeof spyOn<typeof cliModule, 'setupServices'>>;
let actualLoadToolConfigsSpy: ReturnType<
  typeof spyOn<typeof configLoaderModule, 'loadToolConfigs'>
>; // Spy on the real function

describe('CLI', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;
  let programUnderTest: typeof cliModule.program; // Declare here, to be assigned in beforeEach

  beforeEach(async () => {
    // Make beforeEach async
    // Dynamically import the cli module for each test setup
    // This helps ensure that spies are attached to a fresh instance if Bun re-evaluates modules.
    const freshCliModule = await import('../cli');
    programUnderTest = freshCliModule.program; // Assign the fresh program instance

    // Updated spy to reflect new signature and allow checking of fs type
    setupServicesSpy = spyOn(freshCliModule, 'setupServices').mockImplementation(
      async (dryRun?: boolean): Promise<cliModule.Services> => {
        const fsInstance = dryRun ? new MemFileSystem() : new NodeFileSystem();
        // Log constructor name for easier verification if needed, though direct instance check is better
        // console.log(`setupServicesSpy: dryRun=${dryRun}, fs constructor=${fsInstance.constructor.name}`);
        return {
          appConfig: {
            // Provide a minimal AppConfig with necessary properties if cli.ts uses them before orchestrator call
            generatedArtifactsManifestPath: '/mock/manifest.json',
            toolConfigsDir: '/fake/tools', // Add toolConfigsDir for the real loadToolConfigs
          } as AppConfig,
          fs: fsInstance, // Return an actual (mocked) FS type
          downloader: {} as IDownloader,
          githubApiCache: {} as IGitHubApiCache,
          githubApiClient: {} as IGitHubApiClient,
          shimGenerator: {} as IShimGenerator,
          shellInitGenerator: {} as IShellInitGenerator,
          symlinkGenerator: {} as ISymlinkGenerator,
          generatorOrchestrator: mockGeneratorOrchestrator,
        };
      }
    );

    // Spy on the actual imported loadToolConfigs function
    actualLoadToolConfigsSpy = spyOn(configLoaderModule, 'loadToolConfigs').mockResolvedValue({});

    mockGenerateAll.mockClear();

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    setupServicesSpy.mockRestore();
    actualLoadToolConfigsSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('generate command should call setupServices with dryRun false and orchestrator without dryRun option', async () => {
    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(setupServicesSpy).toHaveBeenCalledWith(false); // dryRun is false by default

    // Verify the type of IFileSystem that would have been created
    expect(setupServicesSpy.mock.results[0]).toBeDefined(); // Ensure the spy was called
    const setupServicesResult = (await setupServicesSpy.mock.results[0]!
      .value) as cliModule.Services;
    expect(setupServicesResult.fs).toBeInstanceOf(NodeFileSystem);

    expect(actualLoadToolConfigsSpy).toHaveBeenCalledTimes(1);
    expect(actualLoadToolConfigsSpy).toHaveBeenCalledWith(
      setupServicesResult.appConfig,
      setupServicesResult.fs
    );
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    // generateAll is now called without the dryRun option in its options object
    expect(mockGenerateAll).toHaveBeenCalledWith({}, {}); // Empty options object
  });

  test('generate command with --dry-run should call setupServices with dryRun true and orchestrator without dryRun option', async () => {
    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate', '--dry-run']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(setupServicesSpy).toHaveBeenCalledWith(true); // dryRun is true

    // Verify the type of IFileSystem that would have been created
    expect(setupServicesSpy.mock.results[0]).toBeDefined(); // Ensure the spy was called
    const setupServicesResult = (await setupServicesSpy.mock.results[0]!
      .value) as cliModule.Services;
    expect(setupServicesResult.fs).toBeInstanceOf(MemFileSystem);

    expect(actualLoadToolConfigsSpy).toHaveBeenCalledTimes(1);
    expect(actualLoadToolConfigsSpy).toHaveBeenCalledWith(
      setupServicesResult.appConfig,
      setupServicesResult.fs
    );
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    // generateAll is now called without the dryRun option in its options object
    expect(mockGenerateAll).toHaveBeenCalledWith({}, {}); // Empty options object
  });

  test('generate command should handle errors from orchestrator and exit', async () => {
    const testError = new Error('Orchestrator failed!');
    mockGenerateAll.mockRejectedValueOnce(testError);

    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(actualLoadToolConfigsSpy).toHaveBeenCalledTimes(1);
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during artifact generation:', testError);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('main function should trigger process.exit when an action errors', async () => {
    const testError = new Error('Action failed!');
    // Mock setupServices to throw an error. When program.parseAsync calls the action,
    // this error will be thrown. Commander's internal handling of action errors
    // should lead to console.error and process.exit.
    setupServicesSpy.mockRejectedValueOnce(testError);

    // We call cli.main(), which internally calls program.parseAsync(process.argv).
    // We need to simulate process.argv for the 'generate' command.
    const originalArgv = process.argv;
    process.argv = ['bun', 'cli.ts', 'generate']; // Simulate command line arguments

    await cliModule.main();

    // Commander's default behavior for an unhandled error in an action
    // is to output to console.error and call process.exit.
    // The exact error message format might vary with commander versions or internal handling.
    // We check that console.error was called (our spy on it) and process.exit was called.
    expect(consoleErrorSpy).toHaveBeenCalled(); // Check if it was called
    // Check if the error object itself was part of the console.error call
    // This depends on how commander formats its error output.
    // A more robust check might be for a substring if the exact format is unstable.
    const consoleErrorCall = consoleErrorSpy.mock.calls.find((callArgs: any[]) =>
      callArgs.some((arg) => arg === testError)
    );
    expect(consoleErrorCall).toBeDefined();

    expect(processExitSpy).toHaveBeenCalledWith(1);

    process.argv = originalArgv; // Restore original argv
  });
});
