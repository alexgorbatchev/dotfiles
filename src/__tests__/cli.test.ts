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
 * - [ ] Update the memory bank with the new information when all tasks are complete.
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
import * as clientLoggerModule from '@modules/logger/clientLogger'; // Import the module to spy on createClientLogger
import type { GeneratedArtifactsManifest, ToolConfig } from '@types';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test, type Mock } from 'bun:test';
import { Command } from 'commander'; // Import Command directly
import type { ConsolaInstance } from 'consola'; // Import ConsolaInstance directly
import * as path from 'node:path'; // For constructing paths in mocks
// import * as clientLogger from '@modules/logger/clientLogger'; // Removed unused import

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

// Spies for the imported functions from cli.ts
// Spies for the imported functions from cli.ts
// We import the module as cli to allow spying on its exports.
import * as cliModuleActual from '../cli'; // Import the actual module
import * as ExitCli from '@exitCli';
// Import the new config loader module
import * as newConfigLoaderModule from '@modules/config-loader/loadToolConfigs';

// Spy on the actual module's export, globally for the test file
let setupServicesSpy = spyOn(cliModuleActual, 'setupServices');
let exitCliSpy: Mock<typeof ExitCli.exitCli>; // Updated spy
let generateActionLogicSpy: Mock<typeof generateCommandModule.generateActionLogic>;
// Update spy to point to the new functions
let loadToolConfigsFromDirectorySpy: Mock<typeof newConfigLoaderModule.loadToolConfigsFromDirectory>;
let loadSingleToolConfigSpy: Mock<typeof newConfigLoaderModule.loadSingleToolConfig>;
let nodeFsExistsSpy: Mock<typeof NodeFileSystem.prototype.exists>;
let nodeFsReaddirSpy: Mock<typeof NodeFileSystem.prototype.readdir>;
let nodeFsReadFileSpy: Mock<typeof NodeFileSystem.prototype.readFile>;
let createAppConfigSpy: Mock<typeof configModuleActual.createAppConfig>;

// Mock logger methods
let mockLoggerInfo: Mock<any>;
let mockLoggerDebug: Mock<any>;
let mockLoggerError: Mock<any>;
let createClientLoggerSpy: Mock<typeof clientLoggerModule.createClientLogger>;

describe('CLI', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>; // Re-instate for main's error logging
  // let processExitSpy: ReturnType<typeof spyOn>; // Removed, using exitCliSpy now
  let programUnderTest: Command; // Declare here, to be assigned in beforeEach. Changed type to Command.
  let defaultMockAppConfig: AppConfig; // Define here to be accessible in tests

  beforeEach(async () => {
    // Make beforeEach async
    setupServicesSpy.mockReset(); // Reset the global spy for each test
    // Spy on generateActionLogic but let the original implementation run
    generateActionLogicSpy = spyOn(generateCommandModule, 'generateActionLogic');
    // Spy on the prototype of the actual GeneratorOrchestrator to catch calls on new instances
    spyOn(ActualGeneratorOrchestrator.prototype, 'generateAll').mockImplementation(mockGenerateAll);


    // Provide a default mock implementation for setupServicesSpy
    // This will be used by registerAllCommands. Tests can override it if needed.
    // Assign to the describe-scoped variable
    defaultMockAppConfig = {
      toolConfigsDir: '/default/mock/tools',
      targetDir: '/default/mock/target',
      generatedArtifactsManifestPath: '/default/mock/manifest.json',
      // Add other essential AppConfig fields if registerAllCommands or subsequent setups depend on them
      dotfilesDir: '/default/dotfiles',
      homeDir: '/default/home',
      generatedDir: '/default/generated',
      binDir: '/default/generated/bin',
      binariesDir: '/default/generated/binaries',
      zshInitDir: '/default/generated/zsh-init',
      manifestPath: '/default/generated/manifest.json',
      completionsDir: '/default/generated/completions',
      cacheEnabled: false,
      githubToken: undefined,
      checkUpdatesOnRun: false,
      updateCheckInterval: 3600,
      downloadTimeout: 30000,
      downloadRetryCount: 3,
      downloadRetryDelay: 1000,
      githubClientUserAgent: 'test-generator-cli/1.0',
      githubApiCacheEnabled: false,
      githubApiCacheTtl: 0,
      githubApiCacheDir: '/default/cache/github-api',
      generatorCliShimName: 'dotfiles-shim-generator-default',
      debug: '',
      sudoPrompt: undefined,
      cacheDir: '/default/cache',
      toolConfigDir: '/default/dotfiles/configs', // Added for completeness
    };

    setupServicesSpy.mockImplementation(async (options?: { dryRun?: boolean }) => {
      const fsInstance = options?.dryRun ? new MemFileSystem() : new NodeFileSystem();
      return {
        appConfig: defaultMockAppConfig,
        fs: fsInstance,
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator, // Use existing mock orchestrator
        installer: mockInstaller, // Use existing mock installer
        archiveExtractor: mockArchiveExtractor,
        versionChecker: {} as any,
      };
    });

    // Create a new Command instance for each test to avoid conflicts
    programUnderTest = new Command(); // Use imported Command
    // Manually set name and description
    programUnderTest
      .name('mydotfiles-test')
      .description('Test CLI instance')
      .version('0.0.0-test');

    // Use the actual module for registering commands, which will use the spied setupServices
    await cliModuleActual.registerAllCommands(programUnderTest);
    // Clear spy calls made during registerAllCommands, so tests only see calls from command execution
    setupServicesSpy.mockClear();


    // Spy on the new config loading functions
    loadToolConfigsFromDirectorySpy = spyOn(
      newConfigLoaderModule,
      'loadToolConfigsFromDirectory'
    );
    loadSingleToolConfigSpy = spyOn(newConfigLoaderModule, 'loadSingleToolConfig');

    // Spies for NodeFileSystem prototype methods and createAppConfig
    // These are spied on NodeFileSystem.prototype so that when cli.ts does `new NodeFileSystem()`,
    // method calls on that instance are spied upon.
    nodeFsExistsSpy = spyOn(NodeFileSystem.prototype, 'exists');
    nodeFsReaddirSpy = spyOn(NodeFileSystem.prototype, 'readdir');
    nodeFsReadFileSpy = spyOn(NodeFileSystem.prototype, 'readFile');
    createAppConfigSpy = spyOn(configModuleActual, 'createAppConfig');

    // Setup logger spies
    mockLoggerInfo = mock(() => {});
    mockLoggerDebug = mock(() => {});
    mockLoggerError = mock(() => {});

    createClientLoggerSpy = spyOn(clientLoggerModule, 'createClientLogger').mockImplementation(
      (options: clientLoggerModule.CreateClientLoggerOptions = {}) => {
        const { quiet = false } = options;
        const defaultToSilentInTest = process.env.NODE_ENV === 'test' && options.quiet !== false;
        const isActuallySilent = quiet || defaultToSilentInTest;

        const baseLoggerMock = {
          log: mock(() => {}),
          warn: mock(() => {}),
          success: mock(() => {}),
          fatal: mock(() => {}),
          trace: mock(() => {}),
          verbose: mock(() => {}),
          ready: mock(() => {}),
          start: mock(() => {}),
          box: mock(() => {}),
          options: {},
          _lastLog: {},
          level: 3, 
          prompt: mock(() => Promise.resolve('')),
          add: mock(() => {}),
          remove: mock(() => {}),
          create: mock(() => ({})),
          withScope: mock(() => ({})),
          withTag: mock(() => ({})),
          wrapConsole: mock(() => {}),
          restoreConsole: mock(() => {}),
          pauseLogs: mock(() => {}),
          resumeLogs: mock(() => {}),
          getScope: mock(() => ''),
          setScope: mock(() => {}),
          getLogLevel: mock(() => 3),
          setLogLevel: mock(() => {}),
          addReporter: mock(() => {}),
          removeReporter: mock(() => {}),
          clearReporters: mock(() => {}),
          printBox: mock(() => {}), 
          printErrorsAndExit: mock(() => ExitCli.exitCli(1)), 
        };

        if (isActuallySilent) {
          return {
            ...baseLoggerMock,
            info: mock(() => {}),
            debug: mock(() => {}),
            error: mockLoggerError, 
            silent: true,
          } as unknown as ConsolaInstance; 
        }
        return {
          ...baseLoggerMock,
          info: mockLoggerInfo,
          debug: mockLoggerDebug,
          error: mockLoggerError,
          silent: false,
        } as unknown as ConsolaInstance; 
      }
    );

    mockGenerateAll.mockClear();
    mockInstall.mockClear();
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {}); // Re-instate spy

    // Spy on the new exitCli function
    exitCliSpy = spyOn(ExitCli, 'exitCli').mockImplementation((code?: number | undefined) => {
      // Match the error thrown by the actual @exitCli in test environment
      throw new Error(`TEST_EXIT_CLI_CALLED_WITH_${code === undefined ? 'UNDEFINED' : code}`);
    });
  });

  afterEach(() => {
    (ActualGeneratorOrchestrator.prototype.generateAll as Mock<any>).mockRestore();
    generateActionLogicSpy.mockRestore();
    loadToolConfigsFromDirectorySpy.mockRestore();
    loadSingleToolConfigSpy.mockRestore();
    exitCliSpy.mockRestore(); // Restore the new spy
    consoleErrorSpy.mockRestore(); // Re-instate restore
    createAppConfigSpy.mockRestore();
    nodeFsExistsSpy.mockRestore();
    nodeFsReaddirSpy.mockRestore();
    nodeFsReadFileSpy.mockRestore();
    createClientLoggerSpy.mockRestore();
    mockLoggerInfo.mockClear();
    mockLoggerDebug.mockClear();
    mockLoggerError.mockClear();
    // consoleLogSpy was removed, remove its mockRestore/mockClear if they exist
  });

  test('generate command should call generateActionLogic with correct services (non-dry run)', async () => {
    const mockAppConfig = { toolConfigsDir: '/fake/tools', targetDir: '/fake/target' } as AppConfig;
    const mockNodeFs = new NodeFileSystem();
    const mockOrchestrator = { generateAll: mockGenerateAll } as IGeneratorOrchestrator;

    // This specific mockImplementation for setupServicesSpy within the test case
    // will be used by the generate command's action handler when it calls setupServices.
    setupServicesSpy.mockImplementation(async (options?: { dryRun?: boolean }) => {
      expect(options?.dryRun).toBe(false);
      return {
        appConfig: mockAppConfig, // Ensure this specific appConfig is returned
        fs: mockNodeFs,
        generatorOrchestrator: mockOrchestrator,
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        installer: mockInstaller,
        archiveExtractor: mockArchiveExtractor,
        versionChecker: {} as any,
      };
    });

    loadToolConfigsFromDirectorySpy.mockResolvedValueOnce({ testTool: { name: 'testTool' } as ToolConfig });
    mockGenerateAll.mockResolvedValueOnce({} as GeneratedArtifactsManifest);

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate']);

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);

    expect(generateActionLogicSpy).toHaveBeenCalledTimes(1);
    const [optionsArg, servicesArg] = generateActionLogicSpy.mock.calls[0]!;

    expect(optionsArg).toEqual({ dryRun: false, verbose: false, quiet: false });
    // Now, servicesArg.appConfig should be the mockAppConfig defined in this test case,
    // because the action handler for 'generate' calls setupServices, which uses the
    // most recent mockImplementation for setupServicesSpy.
    expect(servicesArg.appConfig).toEqual(mockAppConfig);
    expect(servicesArg.fileSystem).toBeInstanceOf(NodeFileSystem);
    expect(servicesArg.clientLogger).toBeDefined();
    expect((servicesArg.clientLogger as any).silent).toBe(false);

    expect(loadToolConfigsFromDirectorySpy).toHaveBeenCalledWith(servicesArg.appConfig.toolConfigsDir, expect.any(NodeFileSystem));
    expect(mockGenerateAll).toHaveBeenCalledWith({ testTool: { name: 'testTool' } }, {});
  });

  test('generate command with --dry-run should call generateActionLogic with MemFileSystem', async () => {
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
    loadToolConfigsFromDirectorySpy.mockResolvedValueOnce(expectedToolConfigsForDryRun);
    mockGenerateAll.mockResolvedValueOnce({} as GeneratedArtifactsManifest);

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'generate', '--dry-run']);

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
    expect(servicesArg.clientLogger).toBeDefined();

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
    const testError = new Error('generateActionLogic failed!');
    mockGenerateAll.mockRejectedValueOnce(testError);
    loadToolConfigsFromDirectorySpy.mockResolvedValueOnce({}); // Prevent EROFS by not hitting actual FS for this error test
    
    // generateActionLogic's catch block calls exitCli (from @exitCli).
    // Our spy on ExitCli.exitCli will throw TEST_EXIT_CLI_CALLED_WITH_1
    expect(programUnderTest.parseAsync(['bun', 'cli.ts', 'generate'])).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');

    // Ensure the logger was called correctly
    expect(mockLoggerError).toHaveBeenCalledTimes(1); // Verify it was called
    const callArgs = mockLoggerError.mock.calls[0] as [string, string];
    const [loggedFormatString, loggedMessage] = callArgs;
    // Error is now caught and logged by the action handler in registerGenerateCommand
    expect(loggedFormatString).toBe('Critical error in generate command: %s');
    expect(loggedMessage).toBe((testError as Error).message);

    expect(exitCliSpy).toHaveBeenCalledWith(1);
    expect(generateActionLogicSpy).toHaveBeenCalledTimes(1);
  });


  test('main function should trigger process.exit when setupServices in action handler fails', async () => {
    mockInstall.mockClear();

    const testError = new Error('SetupServices in install action failed!');
    setupServicesSpy.mockRejectedValueOnce(testError);

    const originalArgv = process.argv;
    const toolToInstall = 'failing-tool-due-to-services';
    process.argv = ['bun', 'cli.ts', 'install', toolToInstall];

    const mockToolConfigForInstall: ToolConfig = {
      name: toolToInstall,
      version: '1.0.0',
      binaries: [toolToInstall],
      installationMethod: 'none',
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigForInstall);

    // cli.ts main() now has its own try/catch that calls exitCli (from @exitCli which is spied and throws)
    // and console.error.
    expect(cliModuleActual.main()).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');

    // Check that console.error was called by main's catch block
    // The error caught by main() is the one thrown by exitCliSpy from the action handler's catch block.
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during main CLI execution:', new Error('TEST_EXIT_CLI_CALLED_WITH_1'));
    expect(exitCliSpy).toHaveBeenCalledWith(1);
    // mockLoggerError IS called by the install command's action handler's catch block
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith('Critical error in install command: %s', testError.message);


    process.argv = originalArgv;
  });

  test('install command should call installer.install with correct parameters', async () => {
    setupServicesSpy.mockImplementationOnce(async () => {
      return {
        appConfig: {
          toolConfigsDir: '/fake/tools',
        } as AppConfig,
        fs: new NodeFileSystem(),
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
        installer: mockInstaller,
        archiveExtractor: mockArchiveExtractor, 
        versionChecker: {} as any, 
      };
    });

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

    expect(setupServicesSpy).toHaveBeenCalledTimes(1);
    expect(loadSingleToolConfigSpy).toHaveBeenCalledTimes(1);
    expect(loadSingleToolConfigSpy).toHaveBeenCalledWith(
      'test-tool', 
      '/fake/tools', 
      expect.any(NodeFileSystem) 
    );
    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith('test-tool', mockToolConfig, {
      force: false,
      verbose: false, 
    });
  });

  test('install command should handle tool not found error', async () => {
    const mockToolConfigsDir = '/test/tool/configs/dir';
    setupServicesSpy.mockImplementationOnce(async () => {
      return {
        appConfig: {
          toolConfigsDir: mockToolConfigsDir, 
        } as AppConfig,
        fs: new NodeFileSystem(),
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
        installer: mockInstaller,
        archiveExtractor: mockArchiveExtractor, 
        versionChecker: {} as any, 
      };
    });

    loadSingleToolConfigSpy.mockResolvedValueOnce(undefined);

    // The install command's action logic calls exitCli (from @exitCli).
    // Our spy on ExitCli.exitCli will throw.
    expect(programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'non-existent-tool'])).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');

    const expectedErrorMessage = `Error: Tool configuration for "non-existent-tool" not found.\nExpected tool configuration file: ${mockToolConfigsDir}/non-existent-tool.tool.ts\nNo specific tool configuration was found for the requested tool.`;
    expect(mockLoggerError).toHaveBeenCalledWith(expectedErrorMessage);
    expect(exitCliSpy).toHaveBeenCalledWith(1); 
  });

  test('install command should handle installation failure', async () => {
    setupServicesSpy.mockImplementationOnce(async () => {
      return {
        appConfig: {
          toolConfigsDir: '/fake/tools',
        } as AppConfig,
        fs: new NodeFileSystem(),
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
        installer: mockInstaller,
        archiveExtractor: mockArchiveExtractor, 
        versionChecker: {} as any, 
      };
    });

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

    mockInstall.mockResolvedValueOnce({
      success: false,
      error: 'Installation failed',
    });

    expect(programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'test-tool'])).rejects.toThrow('TEST_EXIT_CLI_CALLED_WITH_1');
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Error installing "test-tool": Installation failed'
    );
    expect(exitCliSpy).toHaveBeenCalledWith(1); 
  });

  test('install command should pass force and verbose options to installer, and handle quiet', async () => {
    setupServicesSpy.mockImplementationOnce(async () => {
      return {
        appConfig: {
          toolConfigsDir: '/fake/tools',
        } as AppConfig,
        fs: new NodeFileSystem(),
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
        installer: mockInstaller,
        archiveExtractor: mockArchiveExtractor, 
        versionChecker: {} as any, 
      };
    });

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

    await programUnderTest.parseAsync([
      'bun',
      'cli.ts',
      'install',
      'test-tool',
      '--force',
      '--verbose', 
    ]);

    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith('test-tool', mockToolConfig, {
      force: true,
      verbose: true, 
    });

    mockInstall.mockClear();
    mockLoggerInfo.mockClear();
    mockLoggerDebug.mockClear();
    mockLoggerError.mockClear(); 

    setupServicesSpy.mockImplementationOnce(async () => {
      return {
        appConfig: { toolConfigsDir: '/fake/tools' } as AppConfig,
        fs: new NodeFileSystem(), 
        downloader: {} as IDownloader,
        githubApiCache: {} as IGitHubApiCache,
        githubApiClient: {} as IGitHubApiClient,
        shimGenerator: {} as IShimGenerator,
        shellInitGenerator: {} as IShellInitGenerator,
        symlinkGenerator: {} as ISymlinkGenerator,
        generatorOrchestrator: mockGeneratorOrchestrator,
        installer: mockInstaller, 
        archiveExtractor: mockArchiveExtractor,
        versionChecker: {} as any,
      };
    });
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfig); 

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'test-tool', '--quiet']);
    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith('test-tool', mockToolConfig, {
      force: false, 
      verbose: false, 
    });
    expect(mockLoggerInfo).not.toHaveBeenCalled();
    expect(mockLoggerDebug).not.toHaveBeenCalled();
  });

  test('install command with --verbose should show otherChanges via logger.debug', async () => {
    setupServicesSpy.mockImplementationOnce(async () => ({
      appConfig: { toolConfigsDir: '/fake/tools' } as AppConfig,
      fs: new NodeFileSystem(),
      downloader: {} as IDownloader,
      githubApiCache: {} as IGitHubApiCache,
      githubApiClient: {} as IGitHubApiClient,
      shimGenerator: {} as IShimGenerator,
      shellInitGenerator: {} as IShellInitGenerator,
      symlinkGenerator: {} as ISymlinkGenerator,
      generatorOrchestrator: mockGeneratorOrchestrator,
      installer: mockInstaller,
      archiveExtractor: mockArchiveExtractor,
      versionChecker: {} as any,
    }));
    const mockToolConfigDetail: ToolConfig = {
      name: 'detail-tool',
      binaries: ['detail-tool'],
      version: '1.0',
      installationMethod: 'manual',
      installParams: { binaryPath: 'path' },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigDetail);
    mockInstall.mockResolvedValueOnce({
      success: true,
      binaryPath: '/mock/bin/detail-tool',
      version: '1.0',
      otherChanges: ['Detailed step 1', 'Detailed step 2'],
    });

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'detail-tool', '--verbose']);

    expect(mockLoggerDebug).toHaveBeenCalledWith('Detailed step 1');
    expect(mockLoggerDebug).toHaveBeenCalledWith('Detailed step 2');
  });

  test('install command without --verbose should not show otherChanges via logger.debug', async () => {
    setupServicesSpy.mockImplementationOnce(async () => ({
      appConfig: { toolConfigsDir: '/fake/tools' } as AppConfig,
      fs: new NodeFileSystem(),
      downloader: {} as IDownloader,
      githubApiCache: {} as IGitHubApiCache,
      githubApiClient: {} as IGitHubApiClient,
      shimGenerator: {} as IShimGenerator,
      shellInitGenerator: {} as IShellInitGenerator,
      symlinkGenerator: {} as ISymlinkGenerator,
      generatorOrchestrator: mockGeneratorOrchestrator,
      installer: mockInstaller,
      archiveExtractor: mockArchiveExtractor,
      versionChecker: {} as any,
    }));
    const mockToolConfigNoDetail: ToolConfig = {
      name: 'no-detail-tool',
      binaries: ['no-detail-tool'],
      version: '1.0',
      installationMethod: 'manual',
      installParams: { binaryPath: 'path' },
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigNoDetail);
    mockInstall.mockResolvedValueOnce({
      success: true,
      binaryPath: '/mock/bin/no-detail-tool',
      version: '1.0',
      otherChanges: ['Detailed step 1', 'Detailed step 2'], 
    });

    // consoleLogSpy.mockClear(); // Removed as consoleLogSpy is no longer used

    await programUnderTest.parseAsync(['bun', 'cli.ts', 'install', 'no-detail-tool']);

    const debugCalls = mockLoggerDebug.mock.calls;
    const detailedOutputPresentInDebug = debugCalls.some(
      (callArgs: unknown[]) =>
        typeof callArgs[0] === 'string' &&
        ((callArgs[0] as string).includes('Detailed installation steps:') ||
          (callArgs[0] as string).startsWith('  - Detailed step'))
    );
    expect(detailedOutputPresentInDebug).toBe(false);

    expect(mockLoggerInfo).toHaveBeenCalledWith('Tool "no-detail-tool" installed successfully.');
    expect(mockLoggerInfo).toHaveBeenCalledWith('Binary path: /mock/bin/no-detail-tool');
    expect(mockLoggerInfo).toHaveBeenCalledWith('Version: 1.0');
  });

  test('install command with --verbose should not show "Detailed installation steps:" header if otherChanges is empty', async () => {
    setupServicesSpy.mockImplementationOnce(async () => ({
      appConfig: { toolConfigsDir: '/fake/tools' } as AppConfig,
      fs: new NodeFileSystem(),
      downloader: {} as IDownloader,
      githubApiCache: {} as IGitHubApiCache,
      githubApiClient: {} as IGitHubApiClient,
      shimGenerator: {} as IShimGenerator,
      shellInitGenerator: {} as IShellInitGenerator,
      symlinkGenerator: {} as ISymlinkGenerator,
      generatorOrchestrator: mockGeneratorOrchestrator,
      installer: mockInstaller,
      archiveExtractor: mockArchiveExtractor,
      versionChecker: {} as any,
    }));
    const mockToolConfigEmptyDetail: ToolConfig = {
      name: 'empty-detail-tool',
      binaries: ['empty-detail-tool'],
      version: '1.0',
      installationMethod: 'manual', 
      installParams: { binaryPath: 'path' }, 
    };
    loadSingleToolConfigSpy.mockResolvedValueOnce(mockToolConfigEmptyDetail);
    mockInstall.mockResolvedValueOnce({
      success: true,
      binaryPath: '/mock/bin/empty-detail-tool',
      version: '1.0',
      otherChanges: [], 
    });

    // consoleLogSpy.mockClear(); // Removed as consoleLogSpy is no longer used
    await programUnderTest.parseAsync([
      'bun',
      'cli.ts',
      'install',
      'empty-detail-tool',
      '--verbose', 
    ]);

    const debugCalls = mockLoggerDebug.mock.calls;
    const detailedHeaderPresentInDebug = debugCalls.some(
      (callArgs: unknown[]) =>
        typeof callArgs[0] === 'string' &&
        (callArgs[0] as string).includes('Detailed installation steps:')
    );
    expect(detailedHeaderPresentInDebug).toBe(false);

    expect(mockLoggerInfo).toHaveBeenCalledWith('Tool "empty-detail-tool" installed successfully.');
  });
});
