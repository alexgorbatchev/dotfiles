import { exitCli } from '@modules/cli/exitCli';
import type { AppConfig } from '@modules/config';
import { loadSingleToolConfig as actualLoadSingleToolConfig } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IInstaller, InstallResult } from '@modules/installer';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import {
  createMockClientLogger,
  type CreateMockClientLoggerResult,
  createMockAppConfig,
} from '@testing-helpers';
import type { ToolConfig } from '@types';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { GlobalProgram, Services } from '@cli';
import { registerInstallCommand } from '../installCommand';
import { createProgram } from '@cli';

// Mock dependencies
const mockExitCli = mock(exitCli);
mock.module('@modules/cli/exitCli', () => ({
  exitCli: mockExitCli,
}));

const mockLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
mock.module('@modules/config-loader', () => ({
  loadSingleToolConfig: mockLoadSingleToolConfig,
  loadToolConfigsFromDirectory: mock(async () => ({})),
}));

const mockCreateClientLogger = mock(actualCreateClientLogger);
mock.module('@modules/logger', () => ({
  createClientLogger: mockCreateClientLogger,
  createLogger: mock(() => mock(() => {})),
}));

describe('installCommand', () => {
  let program: GlobalProgram;
  let mockServices: Services;
  let mockInstaller: IInstaller;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let mockAppConfig: AppConfig;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/toolA' },
    binaries: ['toolA'],
  };

  beforeEach(() => {
    program = createProgram();
    const { mockClientLogger, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;
    mockCreateClientLogger.mockReturnValue(mockClientLogger);

    mockAppConfig = createMockAppConfig({
      toolConfigsDir: '/fake/tools',
    });

    mockInstaller = {
      install: mock(
        async (): Promise<InstallResult> => ({
          success: true,
          binaryPath: '/fake/bin/toolA',
          version: '1.0.0',
        }),
      ),
    };

    mockServices = {
      appConfig: mockAppConfig,
      fs: {} as IFileSystem,
      installer: mockInstaller,
    } as Services;

    mockExitCli.mockImplementation((code: number) => {
      throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
    });

    registerInstallCommand(program, mockServices);
  });

  afterEach(() => {
    mock.restore();
  });

  test('should successfully install a tool', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(['install', 'toolA'], { from: 'user' });

    expect(mockLoadSingleToolConfig).toHaveBeenCalledWith(
      'toolA',
      mockAppConfig.toolConfigsDir,
      mockServices.fs,
    );
    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: false,
      verbose: false,
    });
    expect(loggerMocks.info).toHaveBeenCalledWith('Tool "toolA" installed successfully.');
  });

  test('should exit with error if tool config is not found', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);

    await expect(program.parseAsync(['install', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1',
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.stringContaining('Error: Tool configuration for "nonexistent" not found.'),
    );
    expect(mockExitCli).toHaveBeenCalledWith(1);
  });

  test('should exit with error if installation fails', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);
    (mockInstaller.install as any).mockResolvedValue({
      success: false,
      error: 'Installation failed',
    });

    await expect(program.parseAsync(['install', 'toolA'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1',
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