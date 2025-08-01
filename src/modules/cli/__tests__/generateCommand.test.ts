import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import {
  createYamlConfigFromObject,
  loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory,
} from '@modules/config-loader';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import { ErrorTemplates } from '@modules/shared/ErrorTemplates';
import { TestLogger } from '@testing-helpers';
import { createMemFileSystem, type MemFileSystemReturn } from '@testing-helpers';
import type { GeneratedArtifactsManifest, ToolConfig } from '@types';
import { createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerGenerateCommand } from '../generateCommand';

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
    program = createProgram();
    logger = new TestLogger();
    mockFs = await createMemFileSystem({});
    mockYamlConfig = await createYamlConfigFromObject(logger, mockFs.fs);

    mockLoadToolConfigsFromDirectory = createMockLoadToolConfigsFromDirectory();
    mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });

    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      loadSingleToolConfig: mock(async () => ({})),
      createYamlConfigFromObject,
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

    registerGenerateCommand(logger, program, {
      yamlConfig: mockYamlConfig,
      fs: mockFs.fs.asIFileSystem,
      generatorOrchestrator: mockGeneratorOrchestrator,
    } as Services);
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
      mockFs.fs.asIFileSystem
    );

    logger.expect(
      ['INFO'],
      ['registerGenerateCommand'],
      [
        'Artifact generation complete.',
        `Generated 1 shims in ${mockYamlConfig.paths.targetDir}`,
        'Generated shims by tool:',
        `  - toolA -> toolA-bin`,
        `Shell init file generated at: ${mockYamlConfig.paths.generatedDir}/init.sh`,
        'Processed 1 symlink operations.',
      ]
    );
  });

  test('should handle errors during artifact generation', async () => {
    const generationError = new Error('Generation failed');
    (mockGeneratorOrchestrator.generateAll as any).mockRejectedValue(generationError);

    expect(program.parseAsync(['generate'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    logger.expect(['ERROR'], ['registerGenerateCommand'], [ErrorTemplates.command.executionFailed('generate', 1, 'Generation failed')]);
  });
});
