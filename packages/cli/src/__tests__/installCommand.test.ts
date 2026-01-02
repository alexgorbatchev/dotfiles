import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import type { IGeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import type { IInstaller, InstallResult } from '@dotfiles/installer';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { createInstallFunction } from '@dotfiles/tool-config-builder';
import { registerInstallCommand } from '../installCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram, IServices } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

const createMockConfigService = (): MockedInterface<IConfigService> => {
  const result: MockedInterface<IConfigService> = {
    loadSingleToolConfig: mock(async () => undefined),
    loadToolConfigs: mock(async () => ({})),
  };
  return result;
};

describe('installCommand', () => {
  let program: IGlobalProgram;
  let mockInstaller: MockedInterface<IInstaller>;
  let mockProjectConfig: ProjectConfig;
  let testLogger: TestLogger;
  let mockServices: IServices;
  let mockConfigService: MockedInterface<IConfigService>;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;

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
          installationMethod: 'brew',
          metadata: {
            method: 'brew',
            formula: 'test',
            isCask: false,
          },
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
    mockProjectConfig = setup.mockProjectConfig;
    mockServices = setup.createServices();

    // Set up mocks
    mockConfigService = createMockConfigService();

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => {}),
      generateCompletionsForTool: mock(async () => {}),
      cleanupToolArtifacts: mock(async () => {}),
    };

    registerInstallCommand(testLogger, program, async () => ({
      ...mockServices,
      configService: mockConfigService,
      generatorOrchestrator: mockGeneratorOrchestrator,
    }));
  });

  afterEach(() => {
    // Reset all mocks
    mockConfigService.loadSingleToolConfig.mockReset();
    mockConfigService.loadToolConfigs.mockReset();
  });

  test('should successfully install a tool', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(['install', 'toolA'], { from: 'user' });

    expect(mockConfigService.loadSingleToolConfig).toHaveBeenCalledWith(
      expect.any(Object),
      'toolA',
      mockProjectConfig.paths.toolConfigsDir,
      mockServices.fs,
      mockProjectConfig,
      expect.objectContaining({
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: mockProjectConfig.paths.homeDir,
      })
    );
    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: false,
      verbose: false,
      shimMode: false,
    });
    testLogger.expect(['INFO'], ['registerInstallCommand'], [messages.toolInstalled('toolA', '1.0.0', 'brew')]);
  });

  test('should skip installation for configuration-only tool configs', async () => {
    const install = createInstallFunction(testLogger, 'config-tool');
    const configOnlyToolConfig = install()
      .zsh((shell) => shell.environment({ CONFIG_ONLY: '1' }))
      .build();

    mockConfigService.loadSingleToolConfig.mockResolvedValue(configOnlyToolConfig);

    await program.parseAsync(['install', 'config-tool'], { from: 'user' });

    expect(mockInstaller.install).not.toHaveBeenCalled();
    expect(mockGeneratorOrchestrator.generateCompletionsForTool).not.toHaveBeenCalled();
  });

  test('should exit silently in shim mode when installation succeeds', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);

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
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);
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
    mockConfigService.loadSingleToolConfig.mockRejectedValue(new Error('Config file corrupted'));

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
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['install', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    testLogger.expect(
      ['ERROR'],
      ['registerInstallCommand'],
      [messages.toolNotFound('nonexistent', mockProjectConfig.paths.toolConfigsDir)]
    );
  });

  test('should exit with error if installation fails', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);
    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValue({
      success: false,
      error: 'Installation failed',
    });

    expect(program.parseAsync(['install', 'toolA'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    testLogger.expect(
      ['ERROR'],
      ['registerInstallCommand'],
      [messages.toolInstallFailed('unknown', 'toolA', 'Installation failed')]
    );
  });

  test('should pass force option to installer', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(['install', 'toolA', '--force'], { from: 'user' });

    expect(mockInstaller.install).toHaveBeenCalledWith('toolA', toolAConfig, {
      force: true,
      verbose: false,
      shimMode: false,
    });
  });
});
