import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { GlobalProgram, Services } from '@cli';
import { cliLogMessages } from '@modules/cli/log-messages';
import type { YamlConfig } from '@modules/config';
import { loadSingleToolConfig as actualLoadSingleToolConfig } from '@modules/config-loader';
import type { IInstaller, InstallResult } from '@modules/installer';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import type { TestLogger } from '@testing-helpers';
import type { ToolConfig } from '@types';
import { registerInstallCommand } from '../installCommand';
import { createCliTestSetup } from './createCliTestSetup';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

const mockLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
const mockLoadToolConfigsFromDirectory = mock(async () => ({}));

describe('installCommand', () => {
  let program: GlobalProgram;
  let mockInstaller: IInstaller;
  let mockYamlConfig: YamlConfig;
  let testLogger: TestLogger;
  let mockServices: Services;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/toolA' },
    binaries: ['toolA'],
  };

  beforeEach(async () => {
    // Create custom installer mock with specific behavior
    mockInstaller = {
      install: mock(
        async (): Promise<InstallResult> => ({
          success: true,
          binaryPaths: ['/fake/bin/toolA'],
          version: '1.0.0',
        })
      ),
    };

    const setup = await createCliTestSetup({
      testName: 'install-command',
      services: {
        installer: mockInstaller,
      },
    });

    program = setup.program;
    testLogger = setup.logger;
    mockYamlConfig = setup.mockYamlConfig;
    mockServices = setup.createServices();

    // Set up mocks
    await mockModules.mock('@modules/config-loader', () => ({
      loadSingleToolConfig: mockLoadSingleToolConfig,
      loadToolConfigs: mockLoadToolConfigsFromDirectory,
    }));

    registerInstallCommand(testLogger, program, async () => mockServices);
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
      mockServices.fs,
      mockYamlConfig
    );
    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: false,
      verbose: false,
      shimMode: false,
    });
    testLogger.expect(['INFO'], ['registerInstallCommand'], [cliLogMessages.toolInstalled('toolA', '1.0.0', 'CLI')]);
  });

  test('should exit silently in shim mode when installation succeeds', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);

    expect(program.parseAsync(['install', 'toolA', '--shim-mode'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_0'
    );

    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: false,
      verbose: false,
      shimMode: true,
    });

    // Should not log success message in shim mode
    expect(() => testLogger.expect(['INFO'], ['registerInstallCommand'], [/installed successfully/])).toThrow();
  });

  test('should output error to stderr in shim mode when installation fails', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);
    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValueOnce({
      success: false,
      error: 'Download failed: Network timeout',
    });

    const mockStderrWrite = mock((_chunk: string | Uint8Array) => true);
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = mockStderrWrite as typeof process.stderr.write;

    try {
      expect(program.parseAsync(['install', 'toolA', '--shim-mode'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1'
      );

      // Should output user-friendly error to stderr
      expect(mockStderrWrite).toHaveBeenCalledWith("Failed to install 'toolA': Download failed: Network timeout\n");
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  test('should output unhandled error to stderr in shim mode', async () => {
    mockLoadSingleToolConfig.mockRejectedValue(new Error('Config file corrupted'));

    const mockStderrWrite = mock((_chunk: string | Uint8Array) => true);
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = mockStderrWrite as typeof process.stderr.write;

    try {
      expect(program.parseAsync(['install', 'toolA', '--shim-mode'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1'
      );

      // Should output user-friendly error to stderr
      expect(mockStderrWrite).toHaveBeenCalledWith("Failed to install 'toolA': Config file corrupted\n");
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  test('should exit with error if tool config is not found', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['install', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    testLogger.expect(
      ['ERROR'],
      ['registerInstallCommand'],
      [cliLogMessages.toolNotFound('nonexistent', mockYamlConfig.paths.toolConfigsDir)]
    );
  });

  test('should exit with error if installation fails', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);
    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValue({
      success: false,
      error: 'Installation failed',
    });

    expect(program.parseAsync(['install', 'toolA'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    testLogger.expect(
      ['ERROR'],
      ['registerInstallCommand'],
      [cliLogMessages.toolInstallFailed('unknown', 'toolA', 'Installation failed')]
    );
  });

  test('should pass force option to installer', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(['install', 'toolA', '--force'], { from: 'user' });

    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: true,
      verbose: false,
      shimMode: false,
    });
  });
});
