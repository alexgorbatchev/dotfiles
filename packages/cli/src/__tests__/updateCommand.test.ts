import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { IInstallerPlugin, ToolConfig, UpdateResult } from '@dotfiles/core';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { registerUpdateCommand } from '../updateCommand';
import { createCliTestSetup } from './createCliTestSetup';

describe('updateCommand', () => {
  let program: IGlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let mockPlugin: IInstallerPlugin;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const fzfToolConfig: GithubReleaseToolConfig = {
    name: 'fzf',
    version: '0.40.0',
    installationMethod: 'github-release',
    installParams: { repo: 'junegunn/fzf' },
    binaries: ['fzf'],
  };

  const manualToolConfig: ToolConfig = {
    name: 'manualtool',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/manualtool' },
    binaries: ['manualtool'],
  };

  beforeEach(async () => {
    mockConfigService = {
      loadSingleToolConfig: mock(async () => fzfToolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    mockPlugin = {
      supportsUpdate: mock(() => true),
      updateTool: mock(
        async (): Promise<UpdateResult> => ({
          success: true,
          oldVersion: '0.40.0',
          newVersion: '0.41.0',
        })
      ),
    } as unknown as IInstallerPlugin;

    const setup = await createCliTestSetup({
      testName: 'update-command',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        pluginRegistry: {
          get: mock((method: string) => (method === 'github-release' ? mockPlugin : undefined)),
          // biome-ignore lint/suspicious/noExplicitAny: Partial mock for testing
        } as any,
      },
    });

    program = setup.program;
    logger = setup.logger;
    mockProjectConfig = setup.mockProjectConfig;

    registerUpdateCommand(logger, program, async () => setup.createServices());
  });

  afterEach(() => {
    // Clean up any test state if needed
  });

  afterAll(() => {
    // Clean up any global test state if needed
  });

  test('tool is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
    mockUpdateTool.mockResolvedValue({
      success: true,
      oldVersion: '0.40.0',
      newVersion: '0.40.0',
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [messages.commandCheckingUpdatesFor('fzf'), messages.toolUpdated('fzf', '0.40.0', '0.40.0')]
    );

    expect(mockPlugin.updateTool).toHaveBeenCalled();
  });

  test('update available, successful installation', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
    mockUpdateTool.mockResolvedValue({
      success: true,
      oldVersion: '0.40.0',
      newVersion: '0.41.0',
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [messages.commandCheckingUpdatesFor('fzf'), messages.toolUpdated('fzf', '0.40.0', '0.41.0')]
    );
    expect(mockPlugin.updateTool).toHaveBeenCalled();
  });

  test('update available, installation fails', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
    mockUpdateTool.mockResolvedValue({
      success: false,
      error: 'Install failed miserably',
    });

    expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(['ERROR'], ['registerUpdateCommand'], [messages.toolUpdateFailed('fzf', 'Install failed miserably')]);
  });

  test('tool config not found', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['update', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    logger.expect(
      ['ERROR'],
      ['registerUpdateCommand'],
      [messages.toolNotFound('nonexistent', mockProjectConfig.paths.toolConfigsDir)]
    );
  });

  test('unsupported installation method', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(manualToolConfig);

    await program.parseAsync(['update', 'manualtool'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [
        messages.commandCheckingUpdatesFor('manualtool'),
        messages.commandUnsupportedOperation('Update', 'installation method: "manual" for tool "manualtool"'),
      ]
    );
    expect(mockPlugin.updateTool).not.toHaveBeenCalled();
  });

  test('GitHub API error when fetching latest release', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
    mockUpdateTool.mockResolvedValue({
      success: false,
      error: 'GitHub API failed',
    });

    expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(['ERROR'], ['registerUpdateCommand'], [messages.toolUpdateFailed('fzf', 'GitHub API failed')]);
  });

  test('tool configured with "latest" version', async () => {
    const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
    mockUpdateTool.mockResolvedValue({
      success: true,
      oldVersion: 'latest',
      newVersion: '0.50.0',
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [messages.commandCheckingUpdatesFor('fzf'), messages.toolUpdated('fzf', 'latest', '0.50.0')]
    );
    expect(mockPlugin.updateTool).toHaveBeenCalled();
  });

  describe('shim mode', () => {
    test('should use concise output when --shim-mode flag is provided', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
      mockUpdateTool.mockResolvedValue({
        success: true,
        oldVersion: '0.40.0',
        newVersion: '0.41.0',
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(
        ['INFO'],
        ['registerUpdateCommand'],
        [messages.toolShimUpdateStarting('fzf', '0.40.0', '0.41.0'), messages.toolShimUpdateSuccess('fzf', '0.41.0')]
      );
    });

    test('should show concise message when tool is already latest in shim mode', async () => {
      const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
      const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
      mockUpdateTool.mockResolvedValue({
        success: true,
        oldVersion: 'latest',
        newVersion: '0.41.0',
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(
        ['INFO'],
        ['registerUpdateCommand'],
        [messages.toolShimUpdateStarting('fzf', 'latest', '0.41.0'), messages.toolShimUpdateSuccess('fzf', '0.41.0')]
      );
      expect(mockPlugin.updateTool).toHaveBeenCalled();
    });

    test('should show concise message when tool is already up to date in shim mode', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
      mockUpdateTool.mockResolvedValue({
        success: true,
        oldVersion: '0.40.0',
        newVersion: '0.40.0',
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(['INFO'], ['registerUpdateCommand'], [messages.toolShimUpToDate('fzf', '0.40.0')]);
      expect(mockPlugin.updateTool).toHaveBeenCalled();
    });

    test('should skip "checking updates" message in shim mode', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const mockUpdateTool = mockPlugin.updateTool! as ReturnType<typeof mock>;
      mockUpdateTool.mockResolvedValue({
        success: true,
        oldVersion: '0.40.0',
        newVersion: '0.40.0',
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(['INFO'], ['registerUpdateCommand'], [messages.toolShimUpToDate('fzf', '0.40.0')]);

      const updateCommandInfoLogs = logger.logs.filter((log) => {
        const meta = log['_meta'];
        return meta && meta.logLevelName === 'INFO' && meta.name === 'registerUpdateCommand';
      });
      expect(updateCommandInfoLogs).toHaveLength(1);
    });
  });
});
