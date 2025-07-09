import type { YamlConfig } from '@modules/config';
import {
  createYamlConfigFromObject,
  getDefaultConfigPath,
} from '@modules/config-loader';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';
import type { IFileSystem } from '@modules/file-system';
import { createMemFileSystem, type FileSystemSpies } from '@testing-helpers';
import type { ToolConfig } from '@types';
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import path from 'node:path';
import { ShimGenerator } from '../ShimGenerator';

describe('ShimGenerator', () => {
  let mockConfig: YamlConfig;
  let shimGenerator: ShimGenerator;
  let fsMocks: FileSystemSpies;
  let mfs: IFileSystem;

  const MOCK_TARGET_DIR = '/test/shims';

  beforeEach(async () => {
    const { fs, spies } = createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });
    mfs = fs;
    fsMocks = spies;

    mockConfig = await createYamlConfigFromObject(
      mfs,
      {
        paths: {
          targetDir: MOCK_TARGET_DIR,
          dotfilesDir: '/test/dotfiles',
          generatedDir: '/test/dotfiles/.generated',
          binariesDir: '/test/dotfiles/.generated/binaries',
          toolConfigsDir: '/test/dotfiles/generator/configs/tools',
          completionsDir: '/test/dotfiles/.generated/completions',
          manifestPath: '/test/dotfiles/.generated/manifest.json',
        },
        cli: {
          generatorShimName: 'dotfiles-shim-generator',
        },
      },
      { platform: 'linux', arch: 'x64' },
      {},
    );

    shimGenerator = new ShimGenerator(mfs, mockConfig);
  });

  describe('constructor', () => {
    it('should initialize correctly', () => {
      expect(shimGenerator).toBeInstanceOf(ShimGenerator);
    });
  });

  describe('generateForTool', () => {
    const toolName = 'my-tool';
    const toolConfig: ToolConfig = {
      name: toolName,
      binaries: ['my-tool-binary'],
      version: '1.0.0',
      installationMethod: 'none',
      installParams: undefined,
    };
    let expectedShimPath: string;
    let expectedBinaryPath: string;
    let expectedGeneratorCliShimPathInToolShim: string;

    beforeEach(() => {
      expectedShimPath = path.join(MOCK_TARGET_DIR, toolName);
      expectedBinaryPath = path.join(
        mockConfig.paths.binariesDir,
        toolConfig.name,
        toolConfig.binaries![0]!
      );
      expectedGeneratorCliShimPathInToolShim = path.join(
        mockConfig.paths.targetDir,
        'shim'
      );
    });

    it('should generate correct shim content, write file, and return shim path', async () => {
      const result = await shimGenerator.generateForTool(toolName, toolConfig);

      expect(result).toEqual([expectedShimPath]);
      expect(fsMocks.ensureDir).toHaveBeenCalledWith(MOCK_TARGET_DIR);
      expect(fsMocks.writeFile).toHaveBeenCalledTimes(1);
      expect(fsMocks.writeFile.mock.calls[0]).toBeDefined();
      const writtenContent = fsMocks.writeFile.mock.calls[0]![1];
      expect(writtenContent).toContain(`#!/usr/bin/env bash`);
      expect(writtenContent).toContain(`# Shim for ${toolName}`);
      expect(writtenContent).toContain(`TOOL_NAME="${toolName}"`);
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPath}"`);
      expect(writtenContent).toContain(
        `GENERATOR_CLI_SHIM_NAME="${expectedGeneratorCliShimPathInToolShim}"`
      );
      expect(writtenContent).toContain(
        `"\${GENERATOR_CLI_SHIM_NAME}" install "\${TOOL_NAME}" --quiet`
      );
      expect(fsMocks.chmod).toHaveBeenCalledWith(expectedShimPath, 0o755);
    });

    it('should use toolName as binary name if toolConfig.binaries is empty and return path', async () => {
      const configNoBinaries: ToolConfig = {
        name: toolName,
        version: '1.0.0',
        binaries: [],
        installationMethod: 'none',
        installParams: undefined,
      };
      const expectedBinaryPathFallback = path.join(
        mockConfig.paths.binariesDir,
        configNoBinaries.name,
        toolName
      );
      const result = await shimGenerator.generateForTool(toolName, configNoBinaries);

      expect(result).toEqual([expectedShimPath]);
      expect(fsMocks.writeFile).toHaveBeenCalledTimes(1);
      expect(fsMocks.writeFile.mock.calls[0]).toBeDefined();
      const writtenContent = fsMocks.writeFile.mock.calls[0]![1];
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPathFallback}"`);
    });

    it('should use toolName as binary name if toolConfig.binaries is undefined', async () => {
      const configUndefinedBinaries: ToolConfig = {
        name: toolName,
        version: '1.0.0',
        binaries: undefined,
        installationMethod: 'none',
        installParams: undefined,
      };
      const expectedBinaryPathFallback = path.join(
        mockConfig.paths.binariesDir,
        configUndefinedBinaries.name,
        toolName
      );
      const result = await shimGenerator.generateForTool(toolName, configUndefinedBinaries);

      expect(result).toEqual([expectedShimPath]);
      expect(fsMocks.writeFile).toHaveBeenCalledTimes(1);
      expect(fsMocks.writeFile.mock.calls[0]).toBeDefined();
      const writtenContent = fsMocks.writeFile.mock.calls[0]![1];
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPathFallback}"`);
    });

    it('should attempt file operations and return path (simulating dry run with mock FS)', async () => {
      const result = await shimGenerator.generateForTool(toolName, toolConfig, {});

      expect(result).toEqual([expectedShimPath]);
      expect(fsMocks.ensureDir).toHaveBeenCalledWith(MOCK_TARGET_DIR);
      expect(fsMocks.writeFile).toHaveBeenCalledTimes(1);
      expect(fsMocks.chmod).toHaveBeenCalledWith(expectedShimPath, 0o755);
    });

    it('should skip if shim exists and overwrite is false, returning empty array', async () => {
      fsMocks.exists.mockResolvedValue(true);
      const result = await shimGenerator.generateForTool(toolName, toolConfig, {
        overwrite: false,
      });

      expect(result).toEqual([]);
      expect(fsMocks.writeFile).not.toHaveBeenCalled();
      expect(fsMocks.chmod).not.toHaveBeenCalled();
    });

    it('should overwrite if shim exists and overwrite is true, returning path', async () => {
      fsMocks.exists.mockResolvedValue(true);
      const result = await shimGenerator.generateForTool(toolName, toolConfig, { overwrite: true });

      expect(result).toEqual([expectedShimPath]);
      expect(fsMocks.writeFile).toHaveBeenCalledTimes(1);
      expect(fsMocks.chmod).toHaveBeenCalledTimes(1);
    });
  });

  describe('generate', () => {
    let generatedShimPath: string;

    beforeEach(() => {
      generatedShimPath = path.join(MOCK_TARGET_DIR, 'shim');
    });

    it('should call generateForTool for each tool config and return all paths including generator shim', async () => {
      const configs: Record<string, ToolConfig> = {
        'tool-a': {
          name: 'tool-a',
          binaries: ['tool-a-bin'],
          version: '1.0',
          installationMethod: 'none',
          installParams: undefined,
        },
        'tool-b': {
          name: 'tool-b',
          binaries: ['tool-b-bin'],
          version: '2.0',
          installationMethod: 'none',
          installParams: undefined,
        },
      };
      const expectedPathA = path.join(MOCK_TARGET_DIR, 'tool-a');
      const expectedPathB = path.join(MOCK_TARGET_DIR, 'tool-b');

      const generateForToolSpy = spyOn(shimGenerator, 'generateForTool')
        .mockResolvedValueOnce([expectedPathA])
        .mockResolvedValueOnce([expectedPathB]);
      const generateGeneratorCliShimSpy = spyOn(
        shimGenerator,
        'generateShim'
      ).mockResolvedValue(generatedShimPath);

      const result = await shimGenerator.generate(configs);

      expect(result).toEqual([generatedShimPath, expectedPathA, expectedPathB]);
      expect(generateGeneratorCliShimSpy).toHaveBeenCalledTimes(1);
      expect(generateForToolSpy).toHaveBeenCalledTimes(2);
      expect(generateForToolSpy).toHaveBeenCalledWith('tool-a', configs['tool-a'], undefined);
      expect(generateForToolSpy).toHaveBeenCalledWith('tool-b', configs['tool-b'], undefined);

      generateForToolSpy.mockRestore();
      generateGeneratorCliShimSpy.mockRestore();
    });

    it('should handle empty toolConfigs object and return only generator shim path', async () => {
      const generateForToolSpy = spyOn(shimGenerator, 'generateForTool');
      const generateGeneratorCliShimSpy = spyOn(
        shimGenerator,
        'generateShim'
      ).mockResolvedValue(generatedShimPath);

      const result = await shimGenerator.generate({});
      expect(result).toEqual([generatedShimPath]);
      expect(generateGeneratorCliShimSpy).toHaveBeenCalledTimes(1);
      expect(generateForToolSpy).not.toHaveBeenCalled();

      generateForToolSpy.mockRestore();
      generateGeneratorCliShimSpy.mockRestore();
    });

    it('should pass options (like overwrite) to generateForTool and generateShim, returning all paths', async () => {
      const configs: Record<string, ToolConfig> = {
        'tool-a': {
          name: 'tool-a',
          binaries: ['tool-a-bin'],
          version: '1.0',
          installationMethod: 'none',
          installParams: undefined,
        },
      };
      const options = { overwrite: true };
      const expectedPathA = path.join(MOCK_TARGET_DIR, 'tool-a');

      const generateForToolSpy = spyOn(shimGenerator, 'generateForTool').mockResolvedValueOnce([
        expectedPathA,
      ]);
      const generateGeneratorCliShimSpy = spyOn(
        shimGenerator,
        'generateShim'
      ).mockResolvedValue(generatedShimPath);

      const result = await shimGenerator.generate(configs, options);

      expect(result).toEqual([generatedShimPath, expectedPathA]);
      expect(generateGeneratorCliShimSpy).toHaveBeenCalledWith(options);
      expect(generateForToolSpy).toHaveBeenCalledWith('tool-a', configs['tool-a'], options);

      generateForToolSpy.mockRestore();
      generateGeneratorCliShimSpy.mockRestore();
    });
  });
});
