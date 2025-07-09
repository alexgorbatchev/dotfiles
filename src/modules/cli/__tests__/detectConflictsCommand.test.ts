import { exitCli } from '@modules/cli/exitCli';
import type { AppConfig } from '@modules/config';
import { loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IDownloader } from '@modules/downloader';
import type { IArchiveExtractor } from '@modules/extractor';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import type { IShellInitGenerator } from '@modules/generator-shell-init';
import type { IShimGenerator } from '@modules/generator-shim';
import type { ISymlinkGenerator } from '@modules/generator-symlink';
import type { IGitHubApiCache, IGitHubApiClient } from '@modules/github-client';
import type { IInstaller } from '@modules/installer';
import type { IVersionChecker } from '@modules/version-checker';
import {
  createMemFileSystem,
  createMockAppConfig,
  createMockClientLogger,
  type FileSystemSpies,
  type CreateMockClientLoggerResult,
} from '@testing-helpers';
import type { GithubReleaseToolConfig, ManualToolConfig } from '@types';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerDetectConflictsCommand } from '../detectConflictsCommand';
import type { GlobalProgram, Services } from '@cli';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import { createProgram } from '@cli';

// Mock function factories - these create fresh mocks each time they're called
const createMockExitCli = () => mock((code: number) => {
  throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
});

const createMockLoadToolConfigsFromDirectory = () => mock(actualLoadToolConfigsFromDirectory);
const createMockCreateClientLogger = () => mock(actualCreateClientLogger);

// Instances to be set in beforeEach
let mockExitCli: ReturnType<typeof createMockExitCli>;
let mockLoadToolConfigsFromDirectory: ReturnType<typeof createMockLoadToolConfigsFromDirectory>;
let mockCreateClientLogger: ReturnType<typeof createMockCreateClientLogger>;

describe('detectConflictsCommand', () => {
  let program: GlobalProgram;
  let mockAppConfig: AppConfig;
  let fileSystemSpies: FileSystemSpies;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let mockServices: Services;
  let memFs: IFileSystem;

  const toolAConfig: ManualToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    binaries: ['toolA-bin'],
    symlinks: [{ source: 'toolA/.config', target: '.config/toolA' }],
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/toolA-bin' },
  };

  const toolBConfig: GithubReleaseToolConfig = {
    name: 'toolB',
    version: '2.0.0',
    binaries: ['toolB-bin'],
    symlinks: [{ source: 'toolB/.settings', target: '.settings/toolB' }],
    installationMethod: 'github-release',
    installParams: { repo: 'user/toolB' },
  };

  beforeEach(() => {
    // Reset all mocks
    mock.restore();
    
    // Create fresh mocks for each test
    mockExitCli = createMockExitCli();
    mockLoadToolConfigsFromDirectory = createMockLoadToolConfigsFromDirectory();
    mockCreateClientLogger = createMockCreateClientLogger();
    
    // Set up module mocks with the fresh instances
    mock.module('@modules/cli/exitCli', () => ({
      exitCli: mockExitCli,
    }));

    mock.module('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      loadSingleToolConfig: mock(async () => ({})),
    }));

    mock.module('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mock(() => mock(() => {})),
    }));

    program = createProgram();
    mockAppConfig = createMockAppConfig({
      homeDir: '/Users/testuser',
      dotfilesDir: '/Users/testuser/.dotfiles',
      targetDir: '/Users/testuser/.local/bin',
      toolConfigsDir: '/Users/testuser/.dotfiles/generator/tool-configs',
    });

    const fsHelperReturn = createMemFileSystem();
    memFs = fsHelperReturn.fs;
    fileSystemSpies = fsHelperReturn.spies;

    const loggerHelperReturn = createMockClientLogger();
    loggerMocks = loggerHelperReturn.loggerMocks;
    mockCreateClientLogger.mockReturnValue(loggerHelperReturn.mockClientLogger);

    mockServices = {
      appConfig: mockAppConfig,
      fs: memFs,
      downloader: {} as IDownloader,
      archiveExtractor: {} as IArchiveExtractor,
      generatorOrchestrator: {} as IGeneratorOrchestrator,
      shellInitGenerator: {} as IShellInitGenerator,
      shimGenerator: {} as IShimGenerator,
      symlinkGenerator: {} as ISymlinkGenerator,
      githubApiCache: {} as IGitHubApiCache,
      githubApiClient: {} as IGitHubApiClient,
      installer: {} as IInstaller,
      versionChecker: {} as IVersionChecker,
    };

    registerDetectConflictsCommand(program, mockServices);
  });

  test('should register detect-conflicts command', () => {
    const command = program.commands.find((cmd) => cmd.name() === 'detect-conflicts');
    expect(command).toBeDefined();
    expect(command?.description()).toBe(
      'Detects conflicts between potential generated artifacts and existing system files.',
    );
  });

  describe('Action Logic', () => {
    test('No tool configs found - should log info and exit 0', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({});
      
      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0',
      );

      expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(
        mockAppConfig.toolConfigsDir,
        memFs,
      );
      expect(loggerMocks.info).toHaveBeenCalledWith(
        'No tool configurations found. Nothing to check for conflicts.',
      );
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Error during loadToolConfigsFromDirectory - should log error and exit 1', async () => {
      const loadError = new Error('Failed to load configs');
      mockLoadToolConfigsFromDirectory.mockRejectedValue(loadError);

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      expect(loggerMocks.error).toHaveBeenCalledWith(
        `Error loading tool configurations: ${loadError.message}`,
      );
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('No conflicts found - should log info and exit 0', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      fileSystemSpies.exists.mockResolvedValue(false);
      fileSystemSpies.lstat.mockImplementation(async (_path: string) => {
        throw { code: 'ENOENT' };
      });

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0',
      );

      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Shim path conflict (not a generator shim) - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockAppConfig.targetDir}/toolA-bin`;
      fileSystemSpies.exists.mockImplementation(async (p: string) => p === shimPath);
      fileSystemSpies.readFile.mockImplementation(async (p: string) => {
        if (p === shimPath) return 'some other content';
        throw new Error('File not found in mock');
      });
      fileSystemSpies.lstat.mockImplementation(async (_path: string) => {
        throw { code: 'ENOENT' };
      });

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const expectedMessageShim = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPath} (exists but is not a generator shim)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageShim);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Shim path exists and IS a generator shim - should NOT log warning for this shim', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockAppConfig.targetDir}/toolA-bin`;
      fileSystemSpies.exists.mockImplementation(async (p: string) => p === shimPath);
      fileSystemSpies.readFile.mockImplementation(async (p: string) => {
        if (p === shimPath)
          return '#!/usr/bin/env bash\n# Generated by Dotfiles Management Tool\n# ...rest of shim...';
        throw new Error('File not found in mock');
      });
      fileSystemSpies.lstat.mockImplementation(async (_path: string) => {
        throw { code: 'ENOENT' };
      });

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0',
      );
      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(loggerMocks.warn).not.toHaveBeenCalled();
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Symlink target exists as a file - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
      fileSystemSpies.exists.mockResolvedValue(false);
      fileSystemSpies.lstat.mockImplementation(async (p: string) => {
        if (p === symlinkTargetPath) {
          return {
            isSymbolicLink: () => false,
            isFile: () => true,
            isDirectory: () => false,
          } as any;
        }
        throw { code: 'ENOENT' };
      });

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const expectedMessageSymlinkFile = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${symlinkTargetPath} (exists but is not a symlink)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageSymlinkFile);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Symlink target exists as a symlink to a different source - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
      const expectedSourcePath = `${mockAppConfig.dotfilesDir}/toolA/.config`;
      const pointsToWrongAbsolutePath = '/some/other/absolute/path';

      fileSystemSpies.exists.mockResolvedValue(false);
      fileSystemSpies.lstat.mockImplementation(async (p: string) => {
        if (p === symlinkTargetPath) return { isSymbolicLink: () => true } as any;
        throw { code: 'ENOENT' };
      });
      fileSystemSpies.readlink.mockResolvedValue(pointsToWrongAbsolutePath);

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const expectedMessage = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${symlinkTargetPath} (points to '${pointsToWrongAbsolutePath}', expected '${expectedSourcePath}')`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessage);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Multiple conflicts (shim and symlink) - should log all warnings and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({
        toolA: toolAConfig,
        toolB: toolBConfig,
      });

      const shimPathA = `${mockAppConfig.targetDir}/toolA-bin`;
      const symlinkPathB = `${mockAppConfig.homeDir}/.settings/toolB`;

      fileSystemSpies.exists.mockImplementation(async (p: string) => p === shimPathA);
      fileSystemSpies.lstat.mockImplementation(async (p: string) => {
        if (p === symlinkPathB) {
          return { isSymbolicLink: () => false } as any;
        }
        throw { code: 'ENOENT' };
      });
      fileSystemSpies.readFile.mockImplementation(async (p: string) => {
        if (p === shimPathA) return 'some other content';
        throw new Error('File not found in mock for other paths');
      });

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const expectedMessageMultiple = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPathA} (exists but is not a generator shim)\n  - [toolB]: ${symlinkPathB} (exists but is not a symlink)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageMultiple);
      expect(exitCli).toHaveBeenCalledWith(1);
    });
  });
});