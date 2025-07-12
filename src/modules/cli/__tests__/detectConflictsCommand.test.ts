import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { exitCli } from '@modules/cli/exitCli';
import { type YamlConfig } from '@modules/config';
import {
  loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory,
  createYamlConfigFromObject,
  getDefaultConfigPath,
} from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import {
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
  type FileSystemSpies,
} from '@testing-helpers';
import type { GithubReleaseToolConfig, ManualToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';
import { registerDetectConflictsCommand } from '../detectConflictsCommand';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';

// Set up test cleanup
setupTestCleanup();

// Create module mocker
const mockModules = createModuleMocker();

// Mock function factories - these create fresh mocks each time they're called
const createMockExitCli = () =>
  mock((code: number) => {
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
  let mockYamlConfig: YamlConfig;
  let fileSystemSpies: FileSystemSpies;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
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

  beforeEach(async () => {
    mock.restore();
    clearMockRegistry();

    mockExitCli = createMockExitCli();
    mockLoadToolConfigsFromDirectory = createMockLoadToolConfigsFromDirectory();
    mockCreateClientLogger = createMockCreateClientLogger();

    await mockModules.mock('@modules/cli/exitCli', () => ({
      exitCli: mockExitCli,
    }));

    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      loadSingleToolConfig: mock(async () => ({})),
    }));

    await mockModules.mock('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mock(() => mock(() => {})),
    }));

    program = createProgram();

    const fsHelperReturn = createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });

    memFs = fsHelperReturn.fs;
    fileSystemSpies = fsHelperReturn.spies;

    mockYamlConfig = await createYamlConfigFromObject(
      memFs,
      {},
      { platform: 'darwin', arch: 'x64', homeDir: '/Users/testuser' },
      {}
    );

    const loggerHelperReturn = createMockClientLogger();
    loggerMocks = loggerHelperReturn.loggerMocks;
    mockCreateClientLogger.mockReturnValue(loggerHelperReturn.mockClientLogger);

    registerDetectConflictsCommand(program, {
      yamlConfig: mockYamlConfig,
      fs: memFs,
    } as Services);
  });

  test('should register detect-conflicts command', () => {
    const command = program.commands.find((cmd) => cmd.name() === 'detect-conflicts');
    expect(command).toBeDefined();
    expect(command?.description()).toBe(
      'Detects conflicts between potential generated artifacts and existing system files.'
    );
  });

  describe('Action Logic', () => {
    test('No tool configs found - should log info and exit 0', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({});

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0'
      );

      expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(
        mockYamlConfig.paths.toolConfigsDir,
        memFs
      );
      expect(loggerMocks.info).toHaveBeenCalledWith(
        'No tool configurations found. Nothing to check for conflicts.'
      );
      expect(exitCli).toHaveBeenCalledWith(0);
    });
  
    afterEach(() => {
      clearMockRegistry();
    });
  
    afterAll(() => {
      mockModules.restore();
    });

    test('Error during loadToolConfigsFromDirectory - should log error and exit 1', async () => {
      const loadError = new Error('Failed to load configs');
      mockLoadToolConfigsFromDirectory.mockRejectedValue(loadError);

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1'
      );

      expect(loggerMocks.error).toHaveBeenCalledWith(
        `Error loading tool configurations: ${loadError.message}`
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
        'MOCK_EXIT_CLI_CALLED_WITH_0'
      );

      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Shim path conflict (not a generator shim) - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockYamlConfig.paths.targetDir}/toolA-bin`;
      fileSystemSpies.exists.mockImplementation(async (p: string) => p === shimPath);
      fileSystemSpies.readFile.mockImplementation(async (p: string) => {
        if (p === shimPath) return 'some other content';
        throw new Error('File not found in mock');
      });
      fileSystemSpies.lstat.mockImplementation(async (_path: string) => {
        throw { code: 'ENOENT' };
      });

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1'
      );

      const expectedMessageShim = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPath} (exists but is not a generator shim)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageShim);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Shim path exists and IS a generator shim - should NOT log warning for this shim', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockYamlConfig.paths.targetDir}/toolA-bin`;
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
        'MOCK_EXIT_CLI_CALLED_WITH_0'
      );
      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(loggerMocks.warn).not.toHaveBeenCalled();
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Symlink target exists as a file - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockYamlConfig.paths.dotfilesDir.split('/').slice(0, -2).join('/')}/.config/toolA`;
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
        'MOCK_EXIT_CLI_CALLED_WITH_1'
      );

      const expectedMessageSymlinkFile = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${symlinkTargetPath} (exists but is not a symlink)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageSymlinkFile);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Symlink target exists as a symlink to a different source - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockYamlConfig.paths.dotfilesDir.split('/').slice(0, -2).join('/')}/.config/toolA`;
      const expectedSourcePath = `${mockYamlConfig.paths.dotfilesDir}/toolA/.config`;
      const pointsToWrongAbsolutePath = '/some/other/absolute/path';

      fileSystemSpies.exists.mockResolvedValue(false);
      fileSystemSpies.lstat.mockImplementation(async (p: string) => {
        if (p === symlinkTargetPath) return { isSymbolicLink: () => true } as any;
        throw { code: 'ENOENT' };
      });
      fileSystemSpies.readlink.mockResolvedValue(pointsToWrongAbsolutePath);

      await expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1'
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

      const shimPathA = `${mockYamlConfig.paths.targetDir}/toolA-bin`;
      const symlinkPathB = `${mockYamlConfig.paths.dotfilesDir.split('/').slice(0, -2).join('/')}/.settings/toolB`;

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
        'MOCK_EXIT_CLI_CALLED_WITH_1'
      );

      const expectedMessageMultiple = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPathA} (exists but is not a generator shim)\n  - [toolB]: ${symlinkPathB} (exists but is not a symlink)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageMultiple);
      expect(exitCli).toHaveBeenCalledWith(1);
    });
  });
});
