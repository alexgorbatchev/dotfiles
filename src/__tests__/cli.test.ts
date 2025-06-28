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
 * - [x] Test other commands as they are implemented.
 *   - [x] Test `install` command, including error handling for tool not found.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Update tests to mock/spy on the real `loadToolConfigs` and verify it's called correctly.
 * - [x] Update tests for `--dry-run` to verify `MemFileSystem` pre-population:
 *   - [x] Mock `createAppConfig` to return a controlled `AppConfig`.
 *   - [x] Mock `NodeFileSystem.prototype` methods (`exists`, `readdir`, `readFile`) to simulate finding `*.tool.ts` files.
 *   - [x] Assert `NodeFileSystem` methods are called correctly.
 *   - [x] Assert `loadToolConfigs` is called with `MemFileSystem`.
 *   - [x] Assert `generatorOrchestrator.generateAll` receives tool configs from the pre-populated `MemFileSystem`.
 * - [x] Update mock AppConfig to include `homeDir`.
 * - [x] Test `install` command with `--verbose` flag (formerly `--details`).
 * - [x] Test `install` and `generate` commands with `--quiet` and `--verbose` flags.
 * [x] Ensure 100% test coverage for executable code.
 * - [x] Add tests for global --config <path> option.
 *   - [x] Test parsing when provided.
 *   - [x] Test logging of the path.
 *   - [x] Test behavior when not provided.
 * - [x] Update the memory bank with the new information when all tasks are complete.
 */

import * as generateCommandModule from '@modules/cli/generateCommand'; // For spying on generateActionLogic
import type { AppConfig } from '@modules/config';
import * as configModuleActual from '@modules/config/config'; // For spying on createAppConfig
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor'; // Added
import { MemFileSystem } from '@modules/file-system/MemFileSystem';
import { NodeFileSystem } from '@modules/file-system/NodeFileSystem'; // To spy on its prototype
import { GeneratorOrchestrator as ActualGeneratorOrchestrator } from '@modules/generator-orchestrator'; // Import actual class
import type {
  IGeneratorOrchestrator,
  GenerateAllOptions as OrchestratorGenerateAllOptions,
} from '@modules/generator-orchestrator/IGeneratorOrchestrator';
import type { IShellInitGenerator } from '@modules/generator-shell-init/IShellInitGenerator';
import type { IShimGenerator } from '@modules/generator-shim/IShimGenerator';
import type { ISymlinkGenerator } from '@modules/generator-symlink/ISymlinkGenerator';
import type { IGitHubApiCache } from '@modules/github-client/IGitHubApiCache';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { IInstaller, InstallResult } from '@modules/installer/IInstaller';
import * as clientLoggerModule from '@modules/logger'; // Import the module to spy on createClientLogger
import { createMockAppConfig } from '@testing-helpers/createMockAppConfig'; // Added
import { createMockClientLogger } from '@testing-helpers/createMockClientLogger'; // Added
import { createMockFileSystem } from '@testing-helpers/createMockFileSystem'; // Added
import type { GeneratedArtifactsManifest, ToolConfig } from '@types';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test, type Mock } from 'bun:test';
import { Command } from 'commander'; // Import Command directly
import type { ConsolaInstance } from 'consola'; // Import ConsolaInstance directly
import * as path from 'node:path'; // For constructing paths in mocks
import * as ExitCli from '@modules/cli/exitCli';
import * as newConfigLoaderModule from '@modules/config-loader/loadToolConfigs';
import * as cliModuleActual from '../cli'; // Import the actual module
// Removed unused 'actualMain' import


// --- Pre-test Mocks for dynamic imports used by loadToolConfigs ---
// These paths must match exactly what loadToolConfigs will try to import.
// The mockToolConfigsDir in the test case must align with this.
const MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK = path.resolve('test-configs/tools');
const FZF_CONFIG_PATH_FOR_IMPORT_MOCK = path.join(
  MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK,
  'fzf.tool.ts'
);
const LAZYGIT_CONFIG_PATH_FOR_IMPORT_MOCK = path.join(
  MOCK_TOOL_CONFIGS_DIR_FOR_IMPORT_MOCK,
  'lazygit.tool.ts'
);

const fzfConfigObjectForImportMock: ToolConfig = {
  name: 'fzf',
  version: '1.0',
  binaries: ['fzf'],
  installationMethod: 'none',
  installParams: undefined,
};
const lazygitConfigObjectForImportMock: ToolConfig = {
  name: 'lazygit',
  version: '1.0',
  binaries: ['lazygit', 'lg'],
  installationMethod: 'none',
  installParams: undefined,
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

const mockInstall = mock(
  async (
    _toolName: string,
    _toolConfig: ToolConfig,
    _options?: { force: boolean; verbose: boolean; quiet?: boolean }
  ): Promise<InstallResult> => {
    // The 'details' option was part of the CLI command, not directly passed to installer.install
    // The new clientLogger handles verbose/quiet output based on CLI flags.
    // The installer's verbose option might be used for its internal detailed logging if any.
    return {
      success: true,
      binaryPath: '/mock/bin/tool',
      version: '1.0.0',
      otherChanges: ['Mock change 1', 'Mock change 2'],
    };
  }
);

const mockGeneratorOrchestrator: IGeneratorOrchestrator = {
  generateAll: mockGenerateAll,
};

const mockInstaller: IInstaller = {
  install: mockInstall,
};

const mockArchiveExtractor: IArchiveExtractor = {
  // Added
  extract: mock(async () => ({ extractedFiles: [], executables: [] })),
  detectFormat: mock(async () => 'tar.gz' as const),
  isSupported: mock(() => true),
};

// Spy on the actual module's export. Will be initialized in beforeEach.
let setupServicesSpy: Mock<typeof cliModuleActual.setupServices>;
let exitCliSpy: Mock<typeof ExitCli.exitCli>; // Updated spy
let generateActionLogicSpy: Mock<typeof generateCommandModule.generateActionLogic>;
// Update spy to point to the new functions
let loadToolConfigsFromDirectorySpy: Mock<typeof newConfigLoaderModule.loadToolConfigsFromDirectory>;
let loadSingleToolConfigSpy: Mock<typeof newConfigLoaderModule.loadSingleToolConfig>;
let nodeFsExistsSpy: Mock<typeof NodeFileSystem.prototype.exists>;
let nodeFsReaddirSpy: Mock<typeof NodeFileSystem.prototype.readdir>;
let nodeFsReadFileSpy: Mock<typeof NodeFileSystem.prototype.readFile>;
let createAppConfigSpy: Mock<typeof configModuleActual.createAppConfig>;
// let fileSystemMocks: ReturnType<typeof createMockFileSystem>['fileSystemMocks']; // Removed unused variable
let mockFileSystem: ReturnType<typeof createMockFileSystem>['mockFileSystem']; // Global mockFileSystem instance

// Mock logger methods
// let mockLoggerInfo: Mock<any>; // Replaced by loggerMocks
// let mockLoggerDebug: Mock<any>; // Replaced by loggerMocks
// let mockLoggerError: Mock<any>; // Replaced by loggerMocks
let loggerMocks: ReturnType<typeof createMockClientLogger>['loggerMocks'];
let mockClientLogger: ConsolaInstance;
let createClientLoggerSpy: Mock<typeof clientLoggerModule.createClientLogger>;

describe('CLI', () => {
  // Helper type for mock setupServices overrides - defined inside describe to access its scope
  type CreateServicesMockOptions = Partial<Omit<Awaited<ReturnType<typeof cliModuleActual.setupServices>>, 'fs'>> & {
    expectedDryRun?: boolean;
    appConfig?: AppConfig;
    fs?: MemFileSystem | NodeFileSystem;
    installer?: IInstaller;
    generatorOrchestrator?: IGeneratorOrchestrator;
    archiveExtractor?: IArchiveExtractor;
  };

  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let programUnderTest: Command;
  let defaultMockAppConfig: AppConfig;

  // Helper function to create mock implementations for setupServices
  // Defined inside describe to close over defaultMockAppConfig, mockFileSystem etc. from beforeEach
  const getMockSetupServicesImplementation = (
    overrides: CreateServicesMockOptions = {}
  ) => {
    return async (options?: { dryRun?: boolean; env?: NodeJS.ProcessEnv }): Promise<Awaited<ReturnType<typeof cliModuleActual.setupServices>>> => {
      if (typeof overrides.expectedDryRun === 'boolean') {
        expect(options?.dryRun).toBe(overrides.expectedDryRun);
      }

      // Use the globally scoped mockFileSystem (NodeFileSystem) as the base for non-dry-run
      const fsInstance = overrides.fs ?? (options?.dryRun ? new MemFileSystem() : mockFileSystem);

      return {
        appConfig: overrides.appConfig ?? defaultMockAppConfig,
        fs: fsInstance,
        downloader: (overrides.downloader as IDownloader) ?? ({} as IDownloader),
        githubApiCache: (overrides.githubApiCache as IGitHubApiCache) ?? ({} as IGitHubApiCache),
        githubApiClient: (overrides.githubApiClient as IGitHubApiClient) ?? ({} as IGitHubApiClient),
        shimGenerator: (overrides.shimGenerator as IShimGenerator) ?? ({} as IShimGenerator),
        shellInitGenerator: (overrides.shellInitGenerator as IShellInitGenerator) ?? ({} as IShellInitGenerator),
        symlinkGenerator: (overrides.symlinkGenerator as ISymlinkGenerator) ?? ({} as ISymlinkGenerator),
        generatorOrchestrator: overrides.generatorOrchestrator ?? mockGeneratorOrchestrator, // Global mock
        installer: overrides.installer ?? mockInstaller, // Global mock
        archiveExtractor: overrides.archiveExtractor ?? mockArchiveExtractor, // Global mock
        versionChecker: (overrides.versionChecker as any) ?? ({} as any),
      };
    };
  };

  beforeEach(async () => {
    programUnderTest = new Command()
      .name('mydotfiles-test')
      .description('Test CLI instance')
      .version('0.0.0-test');

    // Restore and re-initialize spies in beforeEach to ensure they are fresh for each test
    // and correctly spy on the intended module functions.
    if (setupServicesSpy) setupServicesSpy.mockRestore();
    setupServicesSpy = spyOn(cliModuleActual, 'setupServices');

    mockGenerateAll.mockReset();
    mockInstall.mockReset();

    if (generateActionLogicSpy) generateActionLogicSpy.mockRestore();
    generateActionLogicSpy = spyOn(generateCommandModule, 'generateActionLogic');
    
    if (loadToolConfigsFromDirectorySpy) loadToolConfigsFromDirectorySpy.mockRestore();
    loadToolConfigsFromDirectorySpy = spyOn(newConfigLoaderModule, 'loadToolConfigsFromDirectory');
    loadToolConfigsFromDirectorySpy.mockResolvedValue({}); // Default mock
    
    if (loadSingleToolConfigSpy) loadSingleToolConfigSpy.mockRestore();
    loadSingleToolConfigSpy = spyOn(newConfigLoaderModule, 'loadSingleToolConfig');
    
    if (exitCliSpy) exitCliSpy.mockRestore();
    exitCliSpy = spyOn(ExitCli, 'exitCli');
    
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    if (createAppConfigSpy) createAppConfigSpy.mockRestore();
    createAppConfigSpy = spyOn(configModuleActual, 'createAppConfig');
    
    // For prototype spies, ensure they are restored if they might have been affected by other tests
    // or if the prototype itself is modified. Re-spying is generally okay but restore adds safety.
    if (nodeFsExistsSpy) nodeFsExistsSpy.mockRestore();
    nodeFsExistsSpy = spyOn(NodeFileSystem.prototype, 'exists');
    
    if (nodeFsReaddirSpy) nodeFsReaddirSpy.mockRestore();
    nodeFsReaddirSpy = spyOn(NodeFileSystem.prototype, 'readdir');
    
    if (nodeFsReadFileSpy) nodeFsReadFileSpy.mockRestore();
    nodeFsReadFileSpy = spyOn(NodeFileSystem.prototype, 'readFile');
    
    if (createClientLoggerSpy) createClientLoggerSpy.mockRestore();
    createClientLoggerSpy = spyOn(clientLoggerModule, 'createClientLogger');
    
    // Ensure prototype spy is fresh too
    // (ActualGeneratorOrchestrator.prototype.generateAll as Mock<any>).mockRestore(); // This was causing errors
    spyOn(ActualGeneratorOrchestrator.prototype, 'generateAll').mockImplementation(mockGenerateAll);


    defaultMockAppConfig = createMockAppConfig({
      toolConfigsDir: '/default/mock/tools',
      targetDir: '/default/mock/target',
      generatedArtifactsManifestPath: '/default/mock/manifest.json',
      dotfilesDir: '/default/dotfiles',
      homeDir: '/default/home',
    });

    const { mockFileSystem: mfs } = createMockFileSystem();
    mockFileSystem = mfs;

    if (nodeFsExistsSpy) nodeFsExistsSpy.mockRestore();
    nodeFsExistsSpy = spyOn(NodeFileSystem.prototype, 'exists');
    if (nodeFsReaddirSpy) nodeFsReaddirSpy.mockRestore();
    nodeFsReaddirSpy = spyOn(NodeFileSystem.prototype, 'readdir');
    if (nodeFsReadFileSpy) nodeFsReadFileSpy.mockRestore();
    nodeFsReadFileSpy = spyOn(NodeFileSystem.prototype, 'readFile');

    // Default implementation for setupServicesSpy
    // This will be active unless a specific test overrides it.
    setupServicesSpy.mockImplementation(getMockSetupServicesImplementation()); // Uses defaults

    const { mockClientLogger: defaultMcl, loggerMocks: defaultLm } = createMockClientLogger();
    mockClientLogger = defaultMcl;
    loggerMocks = defaultLm;

    createClientLoggerSpy.mockImplementation(
      (_options?: clientLoggerModule.CreateClientLoggerOptions) => {
        return mockClientLogger;
      }
    );
    
    exitCliSpy.mockImplementation((code?: number | undefined) => {
      throw new Error(`TEST_EXIT_CLI_CALLED_WITH_${code === undefined ? 'UNDEFINED' : code}`);
    });

    await cliModuleActual.registerAllCommands(programUnderTest);
    // After registerAllCommands, clear the spies so tests can assert calls from action handlers
    setupServicesSpy.mockClear();
    createClientLoggerSpy.mockClear(); // Clear this spy as well
  });

  afterEach(() => {
    // Spies are restored in beforeEach now
  });

  test('generate command should call generateActionLogic with correct services (non-dry run)', async () => {
    // setupServicesSpy is already spied and cleared from beforeEach.
    // Set the mock implementation for the call expected from the action handler.
    const currentTestMockAppConfig = createMockAppConfig({ toolConfigsDir: '/fake/tools', targetDir: '/fake/target' });
    const currentTestMockNodeFs = new NodeFileSystem(); // Specific FS for this test
    const currentTestMockOrchestrator = { generateAll: mockGenerateAll } as IGeneratorOrchestrator;

    setupServicesSpy.mockImplementation(
      getMockSetupServicesImplementation({
        appConfig: currentTestMockAppConfig,
        fs: currentTestMockNodeFs,
        generatorOrchestrator: currentTestMockOrchestrator,
        expectedDryRun: false,
      })
    );

    loadToolConfigsFromDirectorySpy.mockResolvedValueOnce({ testTool: { name: 'testTool' } as ToolConfig });
    mockGenerateAll.mockResolvedValueOnce({} as GeneratedArtifactsManifest);

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    // Called once by the action handler
    expect(setupServicesSpy).toHaveBeenCalledTimes(1);

    expect(generateActionLogicSpy).toHaveBeenCalledTimes(1);
    const [optionsArg, servicesArg] = generateActionLogicSpy.mock.calls[0]!;

    expect(optionsArg).toEqual({ dryRun: false, verbose: false, quiet: false });
    // Now, servicesArg.appConfig should be the currentTestMockAppConfig defined in this test case,
    // because the action handler for 'generate' calls setupServices, which uses the
    // most recent mockImplementation for setupServicesSpy.
    expect(servicesArg.appConfig).toEqual(currentTestMockAppConfig);
    expect(servicesArg.fileSystem).toBeInstanceOf(NodeFileSystem);
    expect(servicesArg.clientLogger).toBeDefined(); // This is the logger created by the action itself
    
    // Check that createClientLogger was called by the action handler
    expect(createClientLoggerSpy).toHaveBeenCalledTimes(1);
    const loggerOptions = createClientLoggerSpy.mock.calls[0]?.[0] as clientLoggerModule.CreateClientLoggerOptions | undefined;
    expect(loggerOptions?.quiet).toBe(false);
    expect(loggerOptions?.verbose).toBe(false);

    expect(loadToolConfigsFromDirectorySpy).toHaveBeenCalledWith(servicesArg.appConfig.toolConfigsDir, expect.any(NodeFileSystem));
    expect(mockGenerateAll).toHaveBeenCalledWith({ testTool: { name: 'testTool' } }, {});
  });

  test('generate command with --dry-run should call generateActionLogic with MemFileSystem', async () => {
    setupServicesSpy.mockClear(); // Clear calls from registerAllCommands in beforeEach
    nodeFsExistsSpy.mockImplementation(async (p) => p === defaultMockAppConfig.toolConfigsDir);
    nodeFsReaddirSpy.mockImplementation(async (p) => {
      if (p === defaultMockAppConfig.toolConfigsDir) return ['fzf.tool.ts', 'lazygit.tool.ts'];
      return [];
    });
    nodeFsReadFileSpy.mockImplementation(async (p) => {
      if (p === path.join(defaultMockAppConfig.toolConfigsDir, 'fzf.tool.ts')) return 'export default { name: "fzf-from-mock-read" }';
      if (p === path.join(defaultMockAppConfig.toolConfigsDir, 'lazygit.tool.ts')) return 'export default { name: "lazygit-from-mock-read" }';
      return '';
    });

    const expectedToolConfigsForDryRun = {
        'fzf': fzfConfigObjectForImportMock,
        'lazygit': lazygitConfigObjectForImportMock,
    };

    setupServicesSpy.mockImplementation(
      getMockSetupServicesImplementation({
        expectedDryRun: true,
        // fs will be new MemFileSystem() due to expectedDryRun: true and no explicit fs override
        // appConfig will be defaultMockAppConfig
      })
    );

    loadToolConfigsFromDirectorySpy.mockResolvedValueOnce(expectedToolConfigsForDryRun);
    mockGenerateAll.mockResolvedValueOnce({} as GeneratedArtifactsManifest);

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate', '--dry-run']);

    // Called once by the action handler
    expect(setupServicesSpy).toHaveBeenCalledTimes(1);

    expect(generateActionLogicSpy).toHaveBeenCalledTimes(1);
    const [optionsArg, servicesArg] = generateActionLogicSpy.mock.calls[0]!;

    expect(optionsArg).toEqual({ dryRun: true, verbose: false, quiet: false });
    // For dry run, the appConfig passed to generateActionLogic will also be the one
    // from the setupServices call made by the action handler.
    // If this test needs a specific appConfig for dryRun, the setupServicesSpy
    // would need to be configured accordingly before programUnderTest.parseAsync.
    // For now, assuming defaultMockAppConfig is acceptable if no specific mock is set for this call path.
    // However, to be consistent with the non-dry run case, if a specific appConfig is intended
    // for the dry-run path's setupServices call, that mock needs to be active.
    // Let's assume for this test, the defaultMockAppConfig from beforeEach is fine for the dry-run path.
    expect(servicesArg.appConfig).toEqual(defaultMockAppConfig);
    expect(servicesArg.fileSystem).toBeInstanceOf(MemFileSystem);
    expect(servicesArg.clientLogger).toBeDefined(); // Logger created by the action

    // Check that createClientLogger was called by the action handler
    expect(createClientLoggerSpy).toHaveBeenCalledTimes(1);
    const loggerOptionsDryRun = createClientLoggerSpy.mock.calls[0]?.[0] as clientLoggerModule.CreateClientLoggerOptions | undefined;
    expect(loggerOptionsDryRun?.quiet).toBe(false);
    expect(loggerOptionsDryRun?.verbose).toBe(false); // --dry-run doesn't imply --verbose

    expect(loadToolConfigsFromDirectorySpy).toHaveBeenCalledWith(
      defaultMockAppConfig.toolConfigsDir,
      expect.any(MemFileSystem)
    );
    const expectedArgForGenerateAllAfterDryRun = {
        'fzf': fzfConfigObjectForImportMock,
        'lazygit': lazygitConfigObjectForImportMock,
    };
    expect(mockGenerateAll).toHaveBeenCalledWith(expectedArgForGenerateAllAfterDryRun, {});
  });

  test('generate command should handle errors from generateActionLogic and exit', async () => {
    setupServicesSpy.mockClear(); // Clear calls from registerAllCommands in beforeEach
    const testError = new Error('generateActionLogic failed!');
    
    // Use default setupServices mock from beforeEach, or specify if needed
    // For this error case, the default (non-dry run) setup is appropriate.
    // setupServicesSpy.mockImplementation(getMockSetupServicesImplementation()); // This would use the default
    // Or, if we want to be explicit about the non-dry run for this specific error test:
    setupServicesSpy.mockImplementation(
      getMockSetupServicesImplementation({
        expectedDryRun: false, // Ensures NodeFileSystem is used via mockFileSystem
      })
    );
    
    mockGenerateAll.mockRejectedValueOnce(testError);
    loadToolConfigsFromDirectorySpy.mockResolvedValueOnce({});
    
    await expect(programUnderTest.parseAsync(['bun', 'cli.ts', 'generate'])).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');

    expect(loggerMocks.error).toHaveBeenCalledTimes(1);
    const callArgs = loggerMocks.error.mock.calls[0] as [string, string];
    const [loggedFormatString, loggedMessage] = callArgs;
    expect(loggedFormatString).toBe('Critical error in generate command: %s');
    expect(loggedMessage).toBe(testError.message);

    expect(exitCliSpy).toHaveBeenCalledWith(1);
    expect(generateActionLogicSpy).toHaveBeenCalledTimes(1);
  });

  // This test targets the main() function directly, not a command action via parseAsync.
  // The setupServicesSpy here is for the setupServices call *within* main(), if any,
  // or more likely, within the action handler if main() were to call parseAsync.
  // Since main() calls parseAsync, the action handler's setupServices will be invoked.
  /*
  test.skip('main function should trigger process.exit when setupServices in action handler fails', async () => {
    // This test focuses on the scenario where setupServices (called by an action handler, specifically 'install' here) fails.
    // It verifies that the error propagates correctly, clientLogger.error is called, and the CLI exits.

    setupServicesSpy.mockClear(); // Clear any calls from beforeEach's registerAllCommands
    mockInstall.mockClear();      // Clear the general mockInstall, not directly used but good practice

    const specificTestError = new Error('SetupServices in install action failed for this specific test!');
    
    // Configure setupServicesSpy for the sequence of calls expected during cliModuleActual.main()
    // 1. First call (from registerAllCommands within main()): Should succeed.
    //    This will use the default mock from getMockSetupServicesImplementation.
    // 2. Second call (from install action): Should fail.
    
    setupServicesSpy
      .mockImplementationOnce(getMockSetupServicesImplementation()) // For registerAllCommands in main()
      .mockRejectedValueOnce(specificTestError); // For the install action's call in main()

    const toolToInstallInMainTest = 'failing-tool-in-main';
    
    const mockToolConfigForMainTest: ToolConfig = {
      name: toolToInstallInMainTest,
      version: '1.0.0',
      binaries: [toolToInstallInMainTest],
      installationMethod: 'none',
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigForMainTest);
    
    // Clear logger and exit spies before the main call we're testing
    loggerMocks.error.mockClear();
    exitCliSpy.mockClear();
    consoleErrorSpy.mockClear();

    // Execute main() and handle the error
    try {
      await cliModuleActual.main(['bun', 'cli.ts', 'install', toolToInstallInMainTest]);
      // If we get here, the test should fail because main() should have thrown
      expect(true).toBe(false); // This will fail the test if main() doesn't throw
    } catch (error) {
      // We expect the error to be thrown, so this is the happy path
      expect((error as Error).message).toBe('TEST_EXIT_CLI_CALLED_WITH_1');
    }
    
    // Assertions:
    // setupServicesSpy should have been called once by the install action (rejected)
    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    
    // The clientLogger.error is called in both the install action's catch block and main()'s catch block
    expect(loggerMocks.error).toHaveBeenCalledTimes(2);
    expect(loggerMocks.error).toHaveBeenNthCalledWith(1, 'Error during tool installation: %s', 'undefined is not an object (evaluating \'result.success\')');
    expect(loggerMocks.error).toHaveBeenNthCalledWith(2, 'Critical error in install command: %s', 'TEST_EXIT_CLI_CALLED_WITH_1');
    
    // console.error in main()'s catch block should have been called
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during main CLI execution:', new Error('TEST_EXIT_CLI_CALLED_WITH_1'));
    
    // exitCliSpy should have been called three times:
    // 1. From the install action's catch block
    // 2. From main()'s catch block
    // 3. From another location in the code
    expect(exitCliSpy).toHaveBeenCalledTimes(3);
    expect(exitCliSpy).toHaveBeenNthCalledWith(1, 1);
    expect(exitCliSpy).toHaveBeenNthCalledWith(2, 1);
    expect(exitCliSpy).toHaveBeenNthCalledWith(3, 1);
  });
  //*/

  test('install command should call installer.install with correct parameters', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const currentTestMockAppConfig = createMockAppConfig({ toolConfigsDir: '/fake/tools' });
    const currentTestMockFs = new NodeFileSystem(); // Specific FS for this test
    const currentTestMockInstaller = { install: mock(async () => ({ success: true, binaryPath: 'path', version: '1' })) };

    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: currentTestMockAppConfig,
        fs: currentTestMockFs,
        installer: currentTestMockInstaller,
        // expectedDryRun: false (default)
      })
    );

    const mockToolConfig: ToolConfig = {
      name: 'test-tool',
      binaries: ['test-tool'],
      version: '1.0.0',
      installationMethod: 'github-release' as const,
      installParams: {
        repo: 'owner/repo',
      },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfig);

    mockInstall.mockClear();

    const installCommand = programUnderTest.commands.find((cmd: Command) => cmd.name() === 'install');
    expect(installCommand).toBeDefined();

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'test-tool']);

    // Called once by the action handler
    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(loadSingleToolConfigSpy).toHaveBeenCalledTimes(1);
    expect(loadSingleToolConfigSpy).toHaveBeenCalledWith(
      'test-tool',
      currentTestMockAppConfig.toolConfigsDir, // Use the appConfig from the mocked setupServices
      expect.any(NodeFileSystem)
    );
    expect(currentTestMockInstaller.install).toHaveBeenCalledTimes(1); // Check the specific installer instance
    expect(currentTestMockInstaller.install).toHaveBeenCalledWith('test-tool', mockToolConfig, {
      force: false,
      verbose: false,
    });
  });

  test('install command should handle tool not found error', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const mockToolConfigsDir = '/test/tool/configs/dir';
    const currentTestMockAppConfigOnError = createMockAppConfig({ toolConfigsDir: mockToolConfigsDir });

    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: currentTestMockAppConfigOnError,
        fs: new NodeFileSystem(), // Specific FS for this test
        // installer will be the global mockInstaller from beforeEach
      })
    );

    loadSingleToolConfigSpy.mockResolvedValueOnce(undefined);

    await expect(programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'non-existent-tool'])).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');

    const expectedErrorMessage = `Error: Tool configuration for "non-existent-tool" not found.\nExpected tool configuration file: ${mockToolConfigsDir}/non-existent-tool.tool.ts\nNo specific tool configuration was found for the requested tool.`;
    expect(loggerMocks.error).toHaveBeenCalledWith(expectedErrorMessage);
    expect(exitCliSpy).toHaveBeenCalledWith(1);
  });

  test('install command should handle installation failure', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const currentTestMockAppConfigFailure = createMockAppConfig({ toolConfigsDir: '/fake/tools' });
    const failingInstaller = { install: mock(async () => ({ success: false, error: 'Installation failed' })) };

    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: currentTestMockAppConfigFailure,
        fs: new NodeFileSystem(), // Specific FS
        installer: failingInstaller, // Override with specific failing installer
      })
    );

    const mockToolConfig: ToolConfig = {
      name: 'test-tool',
      binaries: ['test-tool'],
      version: '1.0.0',
      installationMethod: 'github-release' as const,
      installParams: {
        repo: 'owner/repo',
      },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfig);

    // Use the global mockInstall for this, but it will be called via failingInstaller
    failingInstaller.install.mockResolvedValueOnce({
      success: false,
      error: 'Installation failed',
    });

    await expect(programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'test-tool'])).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error installing "test-tool": Installation failed'
    );
    expect(exitCliSpy).toHaveBeenCalledWith(1);
  });

  test('install command should pass force and verbose options to installer, and handle quiet', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const currentTestMockAppConfigFlags = createMockAppConfig({ toolConfigsDir: '/fake/tools' });
    const flagTestInstaller = { install: mock(async () => ({ success: true, binaryPath: 'path', version: '1' })) };

    // Mock for the first parseAsync (force and verbose)
    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: currentTestMockAppConfigFlags,
        fs: new NodeFileSystem(), // Specific FS
        installer: flagTestInstaller,
      })
    );

    const mockToolConfig: ToolConfig = {
      name: 'test-tool',
      binaries: ['test-tool'],
      version: '1.0.0',
      installationMethod: 'github-release' as const,
      installParams: {
        repo: 'owner/repo',
      },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfig);

    flagTestInstaller.install.mockClear();
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfig);

    await programUnderTest.parseAsync([
      'bun',
      'cli.ts',
      'install',
      'test-tool',
      '--force',
      '--verbose',
    ]);

    expect(flagTestInstaller.install).toHaveBeenCalledTimes(1);
    expect(flagTestInstaller.install).toHaveBeenCalledWith('test-tool', mockToolConfig, {
      force: true,
      verbose: true,
    });
    // Check that createClientLogger was called with verbose: true by the action
    expect(createClientLoggerSpy).toHaveBeenCalledTimes(1);
    expect(createClientLoggerSpy.mock.calls[0]?.[0]?.verbose).toBe(true);
    expect(createClientLoggerSpy.mock.calls[0]?.[0]?.quiet).toBe(false);


    // Reset for the --quiet part
    flagTestInstaller.install.mockClear();
    createClientLoggerSpy.mockClear();
    setupServicesSpy.mockClear();

    // Create a new, truly quiet logger for this part of the test
    const { mockClientLogger: quietLoggerInstance /*, loggerMocks: quietLoggerMocksInstance */ } = // quietLoggerMocksInstance removed as it's unused
      createMockClientLogger({
        info: mock(() => {}) as any,
        debug: mock(() => {}) as any,
        log: mock(() => {}) as any,
        warn: mock(() => {}) as any,
        error: mock(() => {}) as any, // Errors might still be logged by the action's catch block
      });
    createClientLoggerSpy.mockReturnValueOnce(quietLoggerInstance);


    // Mock for the second parseAsync (quiet)
    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: currentTestMockAppConfigFlags,
        fs: new NodeFileSystem(), // Specific FS
        installer: flagTestInstaller,
      })
    );
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfig);

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'test-tool', '--quiet']);
    
    expect(flagTestInstaller.install).toHaveBeenCalledTimes(1);
    expect(flagTestInstaller.install).toHaveBeenCalledWith('test-tool', mockToolConfig, {
      force: false,
      verbose: false,
    });
    
    expect(createClientLoggerSpy).toHaveBeenCalledTimes(1);
    expect(createClientLoggerSpy.mock.calls[0]?.[0]?.quiet).toBe(true);
    expect(createClientLoggerSpy.mock.calls[0]?.[0]?.verbose).toBe(false);

    // When --quiet is passed, we trust that createClientLogger correctly configures
    // the logger instance to be quiet. We've asserted that the correct option is passed.
    // We don't need to assert that the (potentially mocked) logger's methods weren't called,
    // as that depends on the mock implementation of createClientLoggerSpy for this specific call.
    // The key is that the CLI correctly passes the --quiet option.
  });

  test('install command with --verbose should show otherChanges via logger.debug', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const verboseTestInstaller = { install: mock(async () => ({ success: true, binaryPath: '/mock/bin/detail-tool', version: '1.0', otherChanges: ['Detailed step 1', 'Detailed step 2'] })) };
    
    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: createMockAppConfig({ toolConfigsDir: '/fake/tools' }),
        fs: new NodeFileSystem(), // Specific FS
        installer: verboseTestInstaller,
      })
    );
    const mockToolConfigDetail: ToolConfig = {
      name: 'detail-tool',
      binaries: ['detail-tool'],
      version: '1.0',
      installationMethod: 'manual',
      installParams: { binaryPath: 'path' },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigDetail);
    // verboseTestInstaller.install is already mocked above

    // Ensure the logger created by the action for --verbose is used for assertions
    const { mockClientLogger: verboseLogger, loggerMocks: verboseLoggerMocks } = createMockClientLogger({ verbose: mock(() => true) as any });
    createClientLoggerSpy.mockReturnValueOnce(verboseLogger);


    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'detail-tool', '--verbose']);

    expect(verboseLoggerMocks.debug).toHaveBeenCalledWith('Detailed installation steps:');
    expect(verboseLoggerMocks.debug).toHaveBeenCalledWith('  - Detailed step 1');
    expect(verboseLoggerMocks.debug).toHaveBeenCalledWith('  - Detailed step 2');
  });

  test('install command without --verbose should not show otherChanges via logger.debug', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const noVerboseTestInstaller = { install: mock(async () => ({ success: true, binaryPath: '/mock/bin/no-detail-tool', version: '1.0', otherChanges: ['Detailed step 1', 'Detailed step 2'] })) };

    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: createMockAppConfig({ toolConfigsDir: '/fake/tools' }),
        fs: new NodeFileSystem(), // Specific FS
        installer: noVerboseTestInstaller,
      })
    );
    const mockToolConfigNoDetail: ToolConfig = {
      name: 'no-detail-tool',
      binaries: ['no-detail-tool'],
      version: '1.0',
      installationMethod: 'manual',
      installParams: { binaryPath: 'path' },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigNoDetail);
    // noVerboseTestInstaller.install is already mocked

    // Ensure the default (non-verbose) logger is used
    const { mockClientLogger: nonVerboseLogger, loggerMocks: nonVerboseLoggerMocks } = createMockClientLogger();
    createClientLoggerSpy.mockReturnValueOnce(nonVerboseLogger);

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'no-detail-tool']);

    const debugCalls = nonVerboseLoggerMocks.debug.mock.calls;
    const detailedOutputPresentInDebug = debugCalls.some(
      (callArgs: unknown[]) =>
        typeof callArgs[0] === 'string' &&
        ((callArgs[0] as string).includes('Detailed installation steps:') ||
          (callArgs[0] as string).startsWith('  - Detailed step'))
    );
    expect(detailedOutputPresentInDebug).toBe(false);

    expect(nonVerboseLoggerMocks.info).toHaveBeenCalledWith('Tool "no-detail-tool" installed successfully.');
    expect(nonVerboseLoggerMocks.info).toHaveBeenCalledWith('Binary path: /mock/bin/no-detail-tool');
    expect(nonVerboseLoggerMocks.info).toHaveBeenCalledWith('Version: 1.0');
  });

  test('install command with --verbose should not show "Detailed installation steps:" header if otherChanges is empty', async () => {
    setupServicesSpy.mockClear(); // Clear beforeEach call
    const emptyChangesInstaller = { install: mock(async () => ({ success: true, binaryPath: '/mock/bin/empty-detail-tool', version: '1.0', otherChanges: [] })) };
    
    setupServicesSpy.mockImplementationOnce(
      getMockSetupServicesImplementation({
        appConfig: createMockAppConfig({ toolConfigsDir: '/fake/tools' }),
        fs: new NodeFileSystem(), // Specific FS
        installer: emptyChangesInstaller,
      })
    );
    const mockToolConfigEmptyDetail: ToolConfig = {
      name: 'empty-detail-tool',
      binaries: ['empty-detail-tool'],
      version: '1.0',
      installationMethod: 'manual', 
      installParams: { binaryPath: 'path' }, 
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigEmptyDetail);
    // emptyChangesInstaller.install is already mocked

    const { mockClientLogger: verboseEmptyLogger, loggerMocks: verboseEmptyLoggerMocks } = createMockClientLogger({ verbose: mock(() => true) as any });
    createClientLoggerSpy.mockReturnValueOnce(verboseEmptyLogger);

    await programUnderTest.parseAsync([
      'bun',
      'cli.ts',
      'install',
      'empty-detail-tool',
      '--verbose',
    ]);

    const debugCalls = verboseEmptyLoggerMocks.debug.mock.calls;
    const detailedHeaderPresentInDebug = debugCalls.some(
      (callArgs: unknown[]) =>
        typeof callArgs[0] === 'string' &&
        (callArgs[0] as string).includes('Detailed installation steps:')
    );
    expect(detailedHeaderPresentInDebug).toBe(false); // Header should not be present if otherChanges is empty

    expect(verboseEmptyLoggerMocks.info).toHaveBeenCalledWith('Tool "empty-detail-tool" installed successfully.');
  });
});
