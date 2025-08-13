import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { GlobalProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import { loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory } from '@modules/config-loader';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import { logs } from '@modules/logger';
import { createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import type { MemFileSystemReturn, TestLogger } from '@testing-helpers';
import type { GeneratedArtifactsManifest, ToolConfig } from '@types';
import { registerGenerateCommand } from '../generateCommand';
import { createCliTestSetup } from './createCliTestSetup';

setupTestCleanup();

describe('generateCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let logger: TestLogger;
  let mockFs: MemFileSystemReturn;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;
  const mockModules = createModuleMocker();
  const createMockLoadToolConfigsFromDirectory = () => mock(actualLoadToolConfigsFromDirectory);
  let mockLoadToolConfigsFromDirectory: ReturnType<typeof createMockLoadToolConfigsFromDirectory>;

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

    mockLoadToolConfigsFromDirectory = createMockLoadToolConfigsFromDirectory();
    mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });

    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      loadSingleToolConfig: mock(async () => ({})),
    }));

    const mockManifest: GeneratedArtifactsManifest = {
      shims: ['/test/target/toolA-bin'],
      shellInit: { path: `${mockYamlConfig.paths.generatedDir}/init.sh` },
      symlinks: [
        {
          sourcePath: '/test/dotfiles/toolA/.config',
          targetPath: '/test/home/.config/toolA',
          status: 'created',
        },
      ],
      lastGenerated: new Date().toISOString(),
    };

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => mockManifest),
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

    expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(
      expect.any(Object),
      mockYamlConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockYamlConfig
    );

    // Should log DONE message at the end
    logger.expect(['INFO'], ['registerGenerateCommand'], ['DONE']);
  });

  test('should successfully generate artifacts in dry run mode', async () => {
    await program.parseAsync(['generate', '--dry-run'], { from: 'user' });

    expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(
      expect.any(Object),
      mockYamlConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockYamlConfig
    );

    // Should log DONE (dry run) message at the end
    logger.expect(['INFO'], ['registerGenerateCommand'], ['DONE (dry run)']);
  });

  test('should handle errors during artifact generation', async () => {
    const generationError = new Error('Generation failed');
    const mockGenerateAll = mockGeneratorOrchestrator.generateAll as ReturnType<typeof mock>;
    mockGenerateAll.mockRejectedValue(generationError);

    expect(program.parseAsync(['generate'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(
      ['ERROR'],
      ['registerGenerateCommand'],
      [logs.command.error.executionFailed('generate', 1, 'Generation failed')]
    );
  });
});
