import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { YamlConfig } from '@dotfiles/config';
import { loadToolConfigs as actualLoadToolConfigs } from '@dotfiles/config';
import type { MemFileSystemReturn } from '@dotfiles/file-system';
import type { IGeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import type { TestLogger } from '@dotfiles/logger';
import type { ToolConfig } from '@dotfiles/schemas';
import { createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import { registerGenerateCommand } from '../generateCommand';
import { cliLogMessages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

setupTestCleanup();

describe('generateCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let logger: TestLogger;
  let mockFs: MemFileSystemReturn;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;
  const mockModules = createModuleMocker();
  const createMockLoadToolConfigs = () => mock(actualLoadToolConfigs);
  let mockLoadToolConfigs: ReturnType<typeof createMockLoadToolConfigs>;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    binaries: ['toolA-bin'],
    symlinks: [{ source: 'toolA/.config', target: '.config/toolA' }],
  } as ToolConfig;

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'generate-command',
    });

    program = setup.program;
    logger = setup.logger;
    mockFs = setup.mockFs;
    mockYamlConfig = setup.mockYamlConfig;

    mockLoadToolConfigs = createMockLoadToolConfigs();
    mockLoadToolConfigs.mockResolvedValue({ toolA: toolAConfig });

    await mockModules.mock('@dotfiles/config', () => ({
      loadToolConfigs: mockLoadToolConfigs,
      loadSingleToolConfig: mock(async () => ({})),
    }));

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => {}),
    };

    // Update the mockServices with our custom implementation
    setup.mockServices.generatorOrchestrator = mockGeneratorOrchestrator;

    registerGenerateCommand(logger, program, async () => setup.createServices());
  });

  afterEach(() => {
    mockModules.restoreAll();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('should successfully generate artifacts', async () => {
    await program.parseAsync(['generate'], { from: 'user' });

    expect(mockLoadToolConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      mockYamlConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockYamlConfig
    );

    // Should log DONE message at the end
    logger.expect(['INFO'], ['registerGenerateCommand'], [cliLogMessages.commandCompleted(false)]);
  });

  test('should successfully generate artifacts in dry run mode', async () => {
    await program.parseAsync(['generate', '--dry-run'], { from: 'user' });

    expect(mockLoadToolConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      mockYamlConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockYamlConfig
    );

    // Should log DONE (dry run) message at the end
    logger.expect(['INFO'], ['registerGenerateCommand'], [cliLogMessages.commandCompleted(true)]);
  });

  test('should handle errors during artifact generation', async () => {
    const generationError = new Error('Generation failed');
    const mockGenerateAll = mockGeneratorOrchestrator.generateAll as ReturnType<typeof mock>;
    mockGenerateAll.mockRejectedValue(generationError);

    expect(program.parseAsync(['generate'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(
      ['ERROR'],
      ['registerGenerateCommand'],
      [cliLogMessages.commandExecutionFailed('generate', 1, 'Generation failed')]
    );
  });
});
