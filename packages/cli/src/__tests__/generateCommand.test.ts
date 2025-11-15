import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import type { MemFileSystemReturn } from '@dotfiles/file-system';
import type { IGeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { registerGenerateCommand } from '../generateCommand';
import { messages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

const createMockConfigService = (): MockedInterface<IConfigService> => ({
  loadSingleToolConfig: mock(async () => undefined),
  loadToolConfigs: mock(async () => ({})),
});

describe('generateCommand', () => {
  let program: GlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let logger: TestLogger;
  let mockFs: MemFileSystemReturn;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;
  let mockConfigService: MockedInterface<IConfigService>;

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
    mockProjectConfig = setup.mockProjectConfig;

    mockConfigService = createMockConfigService();
    mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => {}),
    };

    registerGenerateCommand(logger, program, async () => ({
      ...setup.createServices(),
      configService: mockConfigService,
      generatorOrchestrator: mockGeneratorOrchestrator,
    }));
  });

  afterEach(() => {
    // Reset all mocks
    mockConfigService.loadToolConfigs.mockReset();
    mockConfigService.loadSingleToolConfig.mockReset();
  });

  test('should successfully generate artifacts', async () => {
    await program.parseAsync(['generate'], { from: 'user' });

    expect(mockConfigService.loadToolConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      mockProjectConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockProjectConfig
    );

    // Should log DONE message at the end
    logger.expect(['INFO'], ['registerGenerateCommand'], [messages.commandCompleted(false)]);
  });

  test('should successfully generate artifacts in dry run mode', async () => {
    await program.parseAsync(['generate', '--dry-run'], { from: 'user' });

    expect(mockConfigService.loadToolConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      mockProjectConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockProjectConfig
    );

    // Should log DONE (dry run) message at the end
    logger.expect(['INFO'], ['registerGenerateCommand'], [messages.commandCompleted(true)]);
  });

  test('should handle errors during artifact generation', async () => {
    const generationError = new Error('Generation failed');
    const mockGenerateAll = mockGeneratorOrchestrator.generateAll as ReturnType<typeof mock>;
    mockGenerateAll.mockRejectedValue(generationError);

    expect(program.parseAsync(['generate'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(['ERROR'], ['registerGenerateCommand'], [messages.commandExecutionFailed('generate', 1)]);
  });
});
