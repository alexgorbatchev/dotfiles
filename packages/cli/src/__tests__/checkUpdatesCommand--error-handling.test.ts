import { beforeEach, describe, mock, test } from 'bun:test';
import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { TestLogger } from '@dotfiles/logger';
import type { ToolConfig } from '@dotfiles/schemas';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('checkUpdatesCommand - Error Handling & Unsupported Methods', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const manualToolConfig: ToolConfig = {
    name: 'manualtool',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/manualtool' },
    binaries: ['manualtool'],
  };

  beforeEach(async () => {
    // Create a configService mock that we can control
    mockConfigService = {
      loadSingleToolConfig: mock(async () => manualToolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-errors',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
      },
    });

    program = setup.program;
    logger = setup.logger;
    mockYamlConfig = setup.mockYamlConfig;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test('should report unsupported installation method', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(manualToolConfig);

    await program.parseAsync(['check-updates', 'manualtool'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand'],
      [messages.commandUnsupportedOperation('check-updates', 'installation method: "manual" for tool "manualtool"')]
    );
  });

  test('should handle tool config not found for specific tool', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);

    await program.parseAsync(['check-updates', 'nonexistenttool'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.toolNotFound('nonexistenttool', mockYamlConfig.paths.toolConfigsDir)]
    );
  });

  test('should handle no tool configurations found when checking all', async () => {
    mockConfigService.loadToolConfigs.mockResolvedValue({});

    await program.parseAsync(['check-updates'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.toolNoConfigurationsFound(mockYamlConfig.paths.toolConfigsDir)]
    );
  });

  test('should handle error during loadToolConfigs', async () => {
    mockConfigService.loadToolConfigs.mockRejectedValue(new Error('FS read error'));

    await program.parseAsync(['check-updates'], { from: 'user' });

    logger.expect(['ERROR'], ['registerCheckUpdatesCommand'], [messages.configLoadFailed('tool configurations')]);
  });

  test('should handle error during loadSingleToolConfig', async () => {
    mockConfigService.loadSingleToolConfig.mockRejectedValue(new Error('FS read error single'));

    await program.parseAsync(['check-updates', 'sometool'], { from: 'user' });

    logger.expect(['ERROR'], ['registerCheckUpdatesCommand'], [messages.configLoadFailed('tool "sometool"')]);
  });
});
