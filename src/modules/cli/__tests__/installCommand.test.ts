import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { exitCli } from '@modules/cli/exitCli';
import type { YamlConfig } from '@modules/config';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  createYamlConfigFromObject,
  getDefaultConfigPath,
} from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IInstaller, InstallResult } from '@modules/installer';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import {
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
} from '@testing-helpers';
import type { ToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { MOCK_DEFAULT_CONFIG } from '../../config-loader/__tests__/fixtures';
import { registerInstallCommand } from '../installCommand';
import {
  createModuleMocker,
  setupTestCleanup,
  clearMockRegistry
} from '@rageltd/bun-test-utils';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

const mockExitCli = mock(exitCli);
const mockLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
const mockLoadToolConfigsFromDirectory = mock(async () => ({}));
const mockCreateClientLogger = mock(actualCreateClientLogger);
const mockCreateLogger = mock(() => mock(() => {}));

describe('installCommand', () => {
  let program: GlobalProgram;
  let mockServices: Services;
  let mockInstaller: IInstaller;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let mockYamlConfig: YamlConfig;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/toolA' },
    binaries: ['toolA'],
  };

  beforeEach(async () => {
    program = createProgram();

    const { mockClientLogger, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;
    mockCreateClientLogger.mockReturnValue(mockClientLogger);

    const { fs } = createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });

    mockYamlConfig = await createYamlConfigFromObject(fs);

    mockInstaller = {
      install: mock(
        async (): Promise<InstallResult> => ({
          success: true,
          binaryPath: '/fake/bin/toolA',
          version: '1.0.0',
        })
      ),
    };

    mockServices = {
      yamlConfig: mockYamlConfig,
      fs: {} as IFileSystem,
      installer: mockInstaller,
    } as Services;

    mockExitCli.mockImplementation((code: number) => {
      throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
    });

    // Set up mocks
    await mockModules.mock('@modules/cli/exitCli', () => ({
      exitCli: mockExitCli,
    }));

    await mockModules.mock('@modules/config-loader', () => ({
      loadSingleToolConfig: mockLoadSingleToolConfig,
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
    }));

    await mockModules.mock('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mockCreateLogger,
    }));

    registerInstallCommand(program, mockServices);
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('should successfully install a tool', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(['install', 'toolA'], { from: 'user' });

    expect(mockLoadSingleToolConfig).toHaveBeenCalledWith(
      'toolA',
      mockYamlConfig.paths.toolConfigsDir,
      mockServices.fs
    );
    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: false,
      verbose: false,
    });
    expect(loggerMocks.info).toHaveBeenCalledWith('Tool "toolA" installed successfully.');
  });

  test('should exit with error if tool config is not found', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['install', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.stringContaining('Error: Tool configuration for "nonexistent" not found.')
    );
    expect(mockExitCli).toHaveBeenCalledWith(1);
  });

  test('should exit with error if installation fails', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);
    (mockInstaller.install as any).mockResolvedValue({
      success: false,
      error: 'Installation failed',
    });

    expect(program.parseAsync(['install', 'toolA'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    expect(loggerMocks.error).toHaveBeenCalledWith('Error installing "toolA": Installation failed');
    expect(mockExitCli).toHaveBeenCalledWith(1);
  });

  test('should pass force option to installer', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(['install', 'toolA', '--force'], { from: 'user' });

    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: true,
      verbose: false,
    });
  });
});
