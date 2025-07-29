import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { exitCli } from '@modules/cli/exitCli';
import type { YamlConfig } from '@modules/config';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  createYamlConfigFromObject,
} from '@modules/config-loader';
import type { IInstaller, InstallResult } from '@modules/installer';
import {
  createMemFileSystem,
  type MemFileSystemReturn,
  TestLogger,
} from '@testing-helpers';
import type { ToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
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

describe('installCommand', () => {
  let program: GlobalProgram;
  let mockServices: Services;
  let mockInstaller: IInstaller;
  let mockYamlConfig: YamlConfig;
  let mockFs: MemFileSystemReturn;
  let testLogger: TestLogger;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/toolA' },
    binaries: ['toolA'],
  };

  beforeEach(async () => {
    program = createProgram();
    testLogger = new TestLogger();

    mockFs = await createMemFileSystem({
    });

    mockYamlConfig = await createYamlConfigFromObject(testLogger, mockFs.fs);

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
      fs: mockFs.fs.asIFileSystem,
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

    registerInstallCommand(testLogger, program, mockServices);
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
      expect.any(Object),
      'toolA',
      mockYamlConfig.paths.toolConfigsDir,
      mockServices.fs
    );
    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: false,
      verbose: false,
    });
    const logs = testLogger.getLogs(['*'], ['registerInstallCommand']);
    expect(logs.some(log => {
      const message = log[0] as unknown as string;
      return typeof message === 'string' && message.includes('Tool "toolA" installed successfully.');
    })).toBe(true);
  });

  test('should exit with error if tool config is not found', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['install', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    const logs = testLogger.getLogs(['*'], ['registerInstallCommand']);
    expect(logs.some(log => {
      const message = log[0] as unknown as string;
      return typeof message === 'string' && message.includes('Error: Tool configuration for "nonexistent" not found.');
    })).toBe(true);
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

    const logs = testLogger.getLogs(['*'], ['registerInstallCommand']);
    expect(logs.some(log => {
      const message = log[0] as unknown as string;
      return typeof message === 'string' && message.includes('Error installing "toolA": Installation failed');
    })).toBe(true);
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
