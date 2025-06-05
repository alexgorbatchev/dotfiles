/**
 * @file generator/src/__tests__/cli.test.ts
 * @description Tests for the main CLI entry point.
 *
 * ## Development Plan
 * - [x] Create basic test structure.
 * - [x] Test that the `generate` command can be called.
 * - [x] Verify `GeneratorOrchestrator.generateAll` is called (using spyOn).
 *   - [x] Ensure `--dry-run` option is passed correctly.
 * - [x] Test error handling for the `generate` command (Completed).
 * - [ ] Test other commands as they are implemented.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
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
import type { IFileSystem } from '../modules/file-system/IFileSystem';
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
import * as cli from '../cli';

let setupServicesSpy: ReturnType<typeof spyOn<typeof cli, 'setupServices'>>;
let loadToolConfigsSpy: ReturnType<typeof spyOn<typeof cli, 'loadToolConfigs'>>;

describe('CLI', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;
  let programUnderTest: typeof cli.program; // Declare here, to be assigned in beforeEach

  beforeEach(async () => {
    // Make beforeEach async
    // Dynamically import the cli module for each test setup
    // This helps ensure that spies are attached to a fresh instance if Bun re-evaluates modules.
    const freshCliModule = await import('../cli');
    programUnderTest = freshCliModule.program; // Assign the fresh program instance

    setupServicesSpy = spyOn(freshCliModule, 'setupServices').mockImplementation(
      async (): Promise<cli.Services> => ({
        appConfig: {} as AppConfig,
        fs: {} as IFileSystem,
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
      })
    );

    loadToolConfigsSpy = spyOn(freshCliModule, 'loadToolConfigs').mockImplementation(
      async (): Promise<Record<string, ToolConfig>> => {
        return {};
      }
    );

    mockGenerateAll.mockClear();

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    setupServicesSpy.mockRestore();
    loadToolConfigsSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('generate command should call GeneratorOrchestrator.generateAll with correct options', async () => {
    // programUnderTest is now set in beforeEach
    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(loadToolConfigsSpy).toHaveBeenCalledTimes(1);
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    expect(mockGenerateAll).toHaveBeenCalledWith({}, { dryRun: false });
  });

  test('generate command with --dry-run should call GeneratorOrchestrator.generateAll with dryRun true', async () => {
    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate', '--dry-run']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(loadToolConfigsSpy).toHaveBeenCalledTimes(1);
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    expect(mockGenerateAll).toHaveBeenCalledWith({}, { dryRun: true });
  });

  test('generate command should handle errors from orchestrator and exit', async () => {
    const testError = new Error('Orchestrator failed!');
    mockGenerateAll.mockRejectedValueOnce(testError);

    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(loadToolConfigsSpy).toHaveBeenCalledTimes(1);
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

    await cli.main();

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
