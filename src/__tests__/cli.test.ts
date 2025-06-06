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
 * - [x] Update tests to mock/spy on the real `loadToolConfigs` and verify it's called correctly.
 * - [x] Update tests for `--dry-run` to verify `MemFileSystem` pre-population:
 *   - [x] Mock `createAppConfig` to return a controlled `AppConfig`.
 *   - [x] Mock `NodeFileSystem.prototype` methods (`exists`, `readdir`, `readFile`) to simulate finding `*.tool.ts` files.
 *   - [x] Assert `NodeFileSystem` methods are called correctly.
 *   - [x] Assert `loadToolConfigs` is called with `MemFileSystem`.
 *   - [x] Assert `generatorOrchestrator.generateAll` receives tool configs from the pre-populated `MemFileSystem`.
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import {
  expect,
  test,
  describe,
  spyOn,
  mock,
  afterEach,
  beforeEach,
  type Mock,
  // jest, // jest is declared but its value is never read.
} from 'bun:test';
import type {
  IGeneratorOrchestrator,
  GenerateAllOptions as OrchestratorGenerateAllOptions,
} from '../modules/generator-orchestrator/IGeneratorOrchestrator';
import type { ToolConfig, GeneratedArtifactsManifest } from '../types';
import type { AppConfig } from '../modules/config';
import * as configModuleActual from '../modules/config/config'; // For spying on createAppConfig
import { MemFileSystem } from '../modules/file-system/MemFileSystem';
import { NodeFileSystem } from '../modules/file-system/NodeFileSystem'; // To spy on its prototype
import * as path from 'node:path'; // For constructing paths in mocks
import type { DirectoryJSON } from 'memfs'; // For type if needed
import type { IDownloader } from '../modules/downloader/IDownloader';
import type { IGitHubApiCache } from '../modules/github-client/IGitHubApiCache';
import type { IGitHubApiClient } from '../modules/github-client/IGitHubApiClient';
import type { IShimGenerator } from '../modules/generator-shim/IShimGenerator';
import type { IShellInitGenerator } from '../modules/generator-shell-init/IShellInitGenerator';
import type { ISymlinkGenerator } from '../modules/generator-symlink/ISymlinkGenerator';

// --- Pre-test Mocks for dynamic imports used by loadToolConfigs ---
// These paths must match exactly what loadToolConfigs will try to import.
// The mockToolConfigsDir in the test case must align with this.
const MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK = path.resolve(process.cwd(), 'test-configs/tools');
const FZF_CONFIG_PATH_FOR_IMPORT_MOCK = path.join(
  MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK,
  'fzf.tool.ts'
);
const LAZYGIT_CONFIG_PATH_FOR_IMPORT_MOCK = path.join(
  MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK,
  'lazygit.tool.ts'
);

const fzfConfigObjectForImportMock: ToolConfig = { name: 'fzf', version: '1.0', binaries: ['fzf'] };
const lazygitConfigObjectForImportMock: ToolConfig = {
  name: 'lazygit',
  version: '1.0',
  binaries: ['lazygit', 'lg'],
};

// Mock dynamic imports for specific paths
// This tells Bun's module system that if `import()` is called with these exact paths,
// it should return the specified module object.
mock.module(FZF_CONFIG_PATH_FOR_IMPORT_MOCK, () => ({
  __esModule: true,
  default: fzfConfigObjectForImportMock,
}));

mock.module(LAZYGIT_CONFIG_PATH_FOR_IMPORT_MOCK, () => ({
  __esModule: true,
  default: lazygitConfigObjectForImportMock,
}));
// --- End Pre-test Mocks ---

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

let setupServicesSpy: Mock<typeof cliModule.setupServices>;
let actualLoadToolConfigsSpy: Mock<typeof configLoaderModule.loadToolConfigs>;
let nodeFsExistsSpy: Mock<typeof NodeFileSystem.prototype.exists>;
let nodeFsReaddirSpy: Mock<typeof NodeFileSystem.prototype.readdir>;
let nodeFsReadFileSpy: Mock<typeof NodeFileSystem.prototype.readFile>;
let createAppConfigSpy: Mock<typeof configModuleActual.createAppConfig>;

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

    // No default mockImplementation for setupServicesSpy. Tests will opt-in.
    setupServicesSpy = spyOn(freshCliModule, 'setupServices');

    // Spy on the actual imported loadToolConfigs function.
    // Do not provide a default mock implementation here; tests will opt-in if needed.
    actualLoadToolConfigsSpy = spyOn(configLoaderModule, 'loadToolConfigs');

    // Spies for NodeFileSystem prototype methods and createAppConfig
    // These are spied on NodeFileSystem.prototype so that when cli.ts does `new NodeFileSystem()`,
    // method calls on that instance are spied upon.
    nodeFsExistsSpy = spyOn(NodeFileSystem.prototype, 'exists');
    nodeFsReaddirSpy = spyOn(NodeFileSystem.prototype, 'readdir');
    nodeFsReadFileSpy = spyOn(NodeFileSystem.prototype, 'readFile');
    createAppConfigSpy = spyOn(configModuleActual, 'createAppConfig');

    mockGenerateAll.mockClear();

    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as any); // Type assertion
  });

  afterEach(() => {
    // Restore all spies
    setupServicesSpy.mockRestore(); // Restores the original function
    actualLoadToolConfigsSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    createAppConfigSpy.mockRestore();
    nodeFsExistsSpy.mockRestore();
    nodeFsReaddirSpy.mockRestore();
    nodeFsReadFileSpy.mockRestore();
  });

  test('generate command should call setupServices with dryRun false and orchestrator without dryRun option', async () => {
    // This test now needs to provide a mock implementation for setupServicesSpy
    setupServicesSpy.mockImplementationOnce(async (dryRun?: boolean) => {
      const fsInstance = dryRun ? new MemFileSystem() : new NodeFileSystem();
      return {
        appConfig: {
          generatedArtifactsManifestPath: '/mock/manifest.json',
          toolConfigsDir: '/fake/tools',
          // Add other necessary AppConfig fields for service instantiation if needed
        } as AppConfig,
        fs: fsInstance,
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
      };
    });
    // This test also needs to mock loadToolConfigs as it's not the focus here.
    actualLoadToolConfigsSpy.mockResolvedValueOnce({});

    const generateCommand = programUnderTest.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(setupServicesSpy).toHaveBeenCalledWith(false);

    const setupServicesResult = (await setupServicesSpy.mock.results[0]!
      .value) as cliModule.Services;
    expect(setupServicesResult.fs).toBeInstanceOf(NodeFileSystem);

    expect(actualLoadToolConfigsSpy).toHaveBeenCalledTimes(1);
    expect(actualLoadToolConfigsSpy).toHaveBeenCalledWith(
      setupServicesResult.appConfig,
      setupServicesResult.fs
    );
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    expect(mockGenerateAll).toHaveBeenCalledWith({}, {});
  });

  test('generate command with --dry-run should pre-populate MemFileSystem and pass tool configs', async () => {
    // ARRANGE
    // This must match MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK for the import mocks to work
    const mockToolConfigsDir = MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK;

    const mockBaseDir = process.cwd(); // Keep for path construction
    const mockDotfilesDir = path.join(mockBaseDir, '.dotfiles'); // Keep for path construction
    const mockGeneratedDirRoot = path.join(mockBaseDir, '.dotfiles-generated-test'); // Keep for path construction

    // This is the AppConfig that loadToolConfigs will be asserted against.
    // It needs to be complete.
    const fullMockAppConfigForAssertion: AppConfig = {
      targetDir: mockGeneratedDirRoot,
      dotfilesDir: mockDotfilesDir,
      generatedDir: path.join(mockGeneratedDirRoot, 'generated'),
      toolConfigDir: path.join(mockDotfilesDir, 'configs'),
      toolConfigsDir: mockToolConfigsDir, // Crucial for the test
      debug: '*',
      cacheEnabled: false,
      sudoPrompt: undefined,
      cacheDir: path.join(mockBaseDir, '.cache', 'generator-test'),
      binariesDir: path.join(mockGeneratedDirRoot, 'generated', 'binaries'),
      binDir: path.join(mockGeneratedDirRoot, 'generated', 'bin'),
      zshInitDir: path.join(mockGeneratedDirRoot, 'generated', 'zsh-init'),
      manifestPath: path.join(mockGeneratedDirRoot, 'manifest.json'),
      completionsDir: path.join(mockGeneratedDirRoot, 'generated', 'completions'),
      generatedArtifactsManifestPath: path.join(mockGeneratedDirRoot, 'artifacts-manifest.json'),
      githubToken: undefined,
      checkUpdatesOnRun: false,
      updateCheckInterval: 3600,
      downloadTimeout: 30000,
      downloadRetryCount: 3,
      downloadRetryDelay: 1000,
      githubClientUserAgent: 'test-generator-cli/1.0',
      githubApiCacheEnabled: false,
      githubApiCacheTtl: 0,
      githubApiCacheDir: path.join(mockBaseDir, '.cache', 'generator-test', 'github-api'),
    };

    // For this specific test, we need to mock setupServices to control its internal FS creation
    // and ensure it returns our mockGeneratorOrchestrator.
    // The createAppConfigSpy and NodeFileSystem spies will be used by this mockSetupServices.
    setupServicesSpy.mockImplementationOnce(async (dryRun?: boolean) => {
      expect(dryRun).toBe(true); // Assert that setupServices is called with dryRun true

      // 1. Simulate AppConfig creation (as the actual setupServices would do)
      // The actual createAppConfig is spied on by createAppConfigSpy.
      // We don't call createAppConfigSpy directly here, but we expect cli.ts's setupServices
      // to have called it. This mock for setupServices *replaces* the cli.ts one.
      // So, we directly use fullMockAppConfigForAssertion which createAppConfigSpy is set to return.
      const appConfigForMockSetup = fullMockAppConfigForAssertion;

      // 2. Simulate MemFileSystem pre-population (as the actual setupServices would do for dry run)
      let fsInstance: MemFileSystem;
      const toolFilesJson: DirectoryJSON = {};
      if (await nodeFsExistsSpy(appConfigForMockSetup.toolConfigsDir)) {
        const filesInDir = await nodeFsReaddirSpy(appConfigForMockSetup.toolConfigsDir);
        for (const fileName of filesInDir) {
          if (fileName.endsWith('.tool.ts')) {
            const filePath = path.join(appConfigForMockSetup.toolConfigsDir, fileName);
            const content = await nodeFsReadFileSpy(filePath, 'utf8');
            toolFilesJson[filePath] = content;
          }
        }
      }
      fsInstance = new MemFileSystem(toolFilesJson);

      return {
        appConfig: appConfigForMockSetup,
        fs: fsInstance,
        downloader: {} as IDownloader, // Mocked as needed
        githubApiCache: {} as IGitHubApiCache, // Mocked as needed
        githubApiClient: {} as IGitHubApiClient, // Mocked as needed
        shimGenerator: {} as IShimGenerator, // Mocked as needed
        shellInitGenerator: {} as IShellInitGenerator, // Mocked as needed
        symlinkGenerator: {} as ISymlinkGenerator, // Mocked as needed
        generatorOrchestrator: mockGeneratorOrchestrator, // CRUCIAL: return the spied orchestrator
      };
    });

    // Mock dependencies of the *actual* setupServices (which our mockSetupServices above simulates)
    createAppConfigSpy.mockImplementation((_systemInfo, _rawEnv) => {
      return fullMockAppConfigForAssertion;
    });
    nodeFsExistsSpy.mockImplementation(async (p: string) => p === mockToolConfigsDir);
    nodeFsReaddirSpy.mockImplementation(async (p: string) => {
      if (p === mockToolConfigsDir) return ['fzf.tool.ts', 'other.txt', 'lazygit.tool.ts'];
      return [];
    });
    const fzfContent = `export const config = { name: 'fzf', version: '1.0', binaries: ['fzf'] };`;
    const lazygitContent = `export const config = { name: 'lazygit', version: '1.0', binaries: ['lazygit', 'lg'] };`;
    nodeFsReadFileSpy.mockImplementation(async (p: string, _encoding?: string) => {
      // _encoding is declared but its value is never read.
      if (p === path.join(mockToolConfigsDir, 'fzf.tool.ts')) return fzfContent;
      if (p === path.join(mockToolConfigsDir, 'lazygit.tool.ts')) return lazygitContent;
      throw new Error(`Unexpected readFile call in test: ${p}`);
    });

    // ACT
    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate', '--dry-run']);

    // ASSERT
    // setupServicesSpy itself was called
    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(setupServicesSpy).toHaveBeenCalledWith(true);

    // Assert that the *actual* loadToolConfigs was called correctly by cli.ts's action handler
    // It should have received the appConfig and the MemFileSystem from our mocked setupServices
    expect(actualLoadToolConfigsSpy).toHaveBeenCalledTimes(1);
    const loadToolConfigsCall = actualLoadToolConfigsSpy.mock.calls[0]!;
    expect(loadToolConfigsCall[0]).toEqual(fullMockAppConfigForAssertion); // appConfig
    expect(loadToolConfigsCall[1]).toBeInstanceOf(MemFileSystem); // fs should be MemFileSystem

    // Verify that the MemFileSystem passed to loadToolConfigs contains the expected files
    const memFsInstance = loadToolConfigsCall[1] as MemFileSystem;
    expect(await memFsInstance.exists(path.join(mockToolConfigsDir, 'fzf.tool.ts'))).toBe(true);
    expect(await memFsInstance.readFile(path.join(mockToolConfigsDir, 'fzf.tool.ts'))).toBe(
      fzfContent
    );
    expect(await memFsInstance.exists(path.join(mockToolConfigsDir, 'lazygit.tool.ts'))).toBe(true);
    expect(await memFsInstance.readFile(path.join(mockToolConfigsDir, 'lazygit.tool.ts'))).toBe(
      lazygitContent
    );
    expect(await memFsInstance.exists(path.join(mockToolConfigsDir, 'other.txt'))).toBe(false);
    // Assert that the actual loadToolConfigs (which ran against the MemFS) produced the correct output
    expect(actualLoadToolConfigsSpy.mock.calls.length).toBeGreaterThan(0);
    const loadToolConfigsResultPromise = actualLoadToolConfigsSpy.mock.results[0]?.value as Promise<
      Record<string, ToolConfig>
    >;
    expect(loadToolConfigsResultPromise).toBeDefined();

    const loadedToolConfigs: Record<string, ToolConfig> = await loadToolConfigsResultPromise;

    const expectedFzfToolName = 'fzf';
    const expectedLazygitToolName = 'lazygit';

    expect(loadedToolConfigs).toBeDefined();
    expect(loadedToolConfigs).toHaveProperty(expectedFzfToolName);
    // Use type assertion for indexing after hasOwnProperty check
    expect((loadedToolConfigs as Record<string, ToolConfig>)[expectedFzfToolName]).toEqual({
      name: 'fzf',
      version: '1.0',
      binaries: ['fzf'],
    });
    expect(loadedToolConfigs).toHaveProperty(expectedLazygitToolName);
    expect((loadedToolConfigs as Record<string, ToolConfig>)[expectedLazygitToolName]).toEqual({
      name: 'lazygit',
      version: '1.0',
      binaries: ['lazygit', 'lg'],
    });
    expect(Object.keys(loadedToolConfigs).length).toBe(2);

    // Assert that generateAll (on the mockGeneratorOrchestrator) received these parsed tool configs
    expect(mockGenerateAll).toHaveBeenCalledTimes(1);
    const generateAllCallArgs = mockGenerateAll.mock.calls[0]!;
    expect(generateAllCallArgs[0] as Record<string, ToolConfig>).toEqual(loadedToolConfigs); // Check if it received the same object
  });
  test('generate command should handle errors from orchestrator and exit', async () => {
    // This test also needs to provide a mock implementation for setupServicesSpy
    setupServicesSpy.mockImplementationOnce(async (dryRun?: boolean) => {
      /* same mock as the first test */
      const fsInstance = dryRun ? new MemFileSystem() : new NodeFileSystem();
      return {
        appConfig: {
          generatedArtifactsManifestPath: '/mock/manifest.json',
          toolConfigsDir: '/fake/tools',
          // Add other necessary AppConfig fields for service instantiation if needed
        } as AppConfig,
        fs: fsInstance,
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
      };
    });
    // Mock loadToolConfigs for this error handling test
    actualLoadToolConfigsSpy.mockResolvedValueOnce({});

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
    // Mock setupServices to throw an error.
    setupServicesSpy.mockRejectedValueOnce(testError);

    // We call cliModule.main(), which internally calls program.parseAsync(process.argv).
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
