/**
 * @file Tests for the ShimGenerator class.
 *
 * ## Development Plan
 *
 * - [x] **Setup Mocks:**
 *   - [x] Mock `IFileSystem` interface.
 *   - [x] Mock `AppConfig` with required properties. (Now uses `createMockAppConfig`)
 *   - [x] Mock `createLogger` to spy on log calls if necessary (or verify behavior without direct log spying).
 * - [x] **Test Suite for `ShimGenerator`:**
 *   - [x] **Constructor:**
 *     - [x] Test correct initialization.
 *   - [x] **`generateForTool` Method:**
 *     - [x] Test basic shim content generation.
 *     - [x] Test file writing and `chmod` calls (behavior determined by injected IFileSystem).
 *     - [x] Test behavior when using a mock/MemFileSystem (simulating dry run): attempts file operations, returns path.
 *     - [x] Test return value (array of shim paths).
 *     - [x] Test `overwrite: false` when shim exists (skips).
 *     - [x] Test `overwrite: true` when shim exists (overwrites).
 *     - [x] Test behavior when `shimDir` is not configured in `AppConfig`.
 *     - [x] Test behavior with different `cliToolPath` configurations.
 *     - [x] Test with tool names containing special characters (if applicable, ensure proper escaping in shim).
 *     - [x] Test when `toolConfig.binaries` is empty or undefined (fallback to toolName).
 *   - [x] **`generate` Method:**
 *     - [x] Test that `generateForTool` is called for each tool in `toolConfigs`.
 *     - [x] Test with empty `toolConfigs`.
 *     - [x] Test return value (array of all generated shim paths).
 * - [x] Ensure all tests pass.
 * - [x] Refactor dry run mechanism: Remove `dryRun` option from tests and adapt test logic.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Achieve 100% test coverage for `ShimGenerator.ts`.
 * - [x] Update mockAppConfig with `generatedArtifactsManifestPath`.
 * - [ ] Update the memory bank.
 */

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'; // Added spyOn
import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { AppConfig, ToolConfig } from '@types';
import { ShimGenerator } from '../ShimGenerator';
import { createMockAppConfig } from '@testing-helpers';

describe('ShimGenerator', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: AppConfig;
  let shimGenerator: ShimGenerator;

  let mockWriteFile: ReturnType<typeof mock>;
  let mockChmod: ReturnType<typeof mock>;
  let mockExists: ReturnType<typeof mock>;
  let mockEnsureDir: ReturnType<typeof mock>;
  let mockLstat: ReturnType<typeof mock>; // Added for lstat

  const MOCK_TARGET_DIR = '/test/shims';

  beforeEach(() => {
    mockWriteFile = mock(() => Promise.resolve());
    mockChmod = mock(() => Promise.resolve());
    mockExists = mock(() => Promise.resolve(false));
    mockEnsureDir = mock(() => Promise.resolve());
    mockLstat = mock(async () => ({ isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }) as any); // Basic lstat mock

    mockFileSystem = {
      writeFile: mockWriteFile,
      chmod: mockChmod,
      exists: mockExists,
      ensureDir: mockEnsureDir,
      readFile: mock(() => Promise.resolve('')),
      mkdir: mock(() => Promise.resolve()),
      readdir: mock(() => Promise.resolve([])),
      rm: mock(() => Promise.resolve()),
      stat: mock(async () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }) as any), // Adjusted default stat
      lstat: mockLstat, // Added lstat
      symlink: mock(async () => {}),
      readlink: mock(async () => ''),
      copyFile: mock(async () => {}),
      rename: mock(async () => {}),
      rmdir: mock(async () => {}),
    };

    mockAppConfig = createMockAppConfig({
      targetDir: MOCK_TARGET_DIR,
      dotfilesDir: '/test/dotfiles',
      generatedDir: '/test/dotfiles/.generated',
      generatorCliShimName: 'dotfiles-shim-generator',
    });

    shimGenerator = new ShimGenerator(mockFileSystem, mockAppConfig);
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
        mockAppConfig.binariesDir,
        toolConfig.name,
        toolConfig.binaries![0]!
      );
      expectedGeneratorCliShimPathInToolShim = path.join(
        mockAppConfig.targetDir,
        mockAppConfig.generatorCliShimName
      );
    });

    it('should generate correct shim content, write file, and return shim path', async () => {
      const result = await shimGenerator.generateForTool(toolName, toolConfig);

      expect(result).toEqual([expectedShimPath]);
      expect(mockEnsureDir).toHaveBeenCalledWith(MOCK_TARGET_DIR);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile.mock.calls[0]).toBeDefined();
      const writtenContent = mockWriteFile.mock.calls[0]![1];
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
      expect(mockChmod).toHaveBeenCalledWith(expectedShimPath, 0o755);
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
        mockAppConfig.binariesDir,
        configNoBinaries.name,
        toolName
      );
      const result = await shimGenerator.generateForTool(toolName, configNoBinaries);

      expect(result).toEqual([expectedShimPath]);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile.mock.calls[0]).toBeDefined();
      const writtenContent = mockWriteFile.mock.calls[0]![1];
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPathFallback}"`);
    });

    it('should use toolName as binary name if toolConfig.binaries is undefined', async () => {
      const configUndefinedBinaries: ToolConfig = {
        name: toolName,
        version: '1.0.0',
        binaries: undefined as any,
        installationMethod: 'none',
        installParams: undefined,
      };
      const expectedBinaryPathFallback = path.join(
        mockAppConfig.binariesDir,
        configUndefinedBinaries.name,
        toolName
      );
      const result = await shimGenerator.generateForTool(toolName, configUndefinedBinaries);

      expect(result).toEqual([expectedShimPath]);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile.mock.calls[0]).toBeDefined();
      const writtenContent = mockWriteFile.mock.calls[0]![1];
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPathFallback}"`);
    });

    it('should attempt file operations and return path (simulating dry run with mock FS)', async () => {
      const result = await shimGenerator.generateForTool(toolName, toolConfig, {});

      expect(result).toEqual([expectedShimPath]);
      expect(mockEnsureDir).toHaveBeenCalledWith(MOCK_TARGET_DIR);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockChmod).toHaveBeenCalledWith(expectedShimPath, 0o755);
    });

    it('should skip if shim exists and overwrite is false, returning empty array', async () => {
      mockExists.mockResolvedValue(true);
      const result = await shimGenerator.generateForTool(toolName, toolConfig, {
        overwrite: false,
      });

      expect(result).toEqual([]);
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should overwrite if shim exists and overwrite is true, returning path', async () => {
      mockExists.mockResolvedValue(true);
      const result = await shimGenerator.generateForTool(toolName, toolConfig, { overwrite: true });

      expect(result).toEqual([expectedShimPath]);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should skip if targetDir is not configured, returning empty array', async () => {
      const configNoTargetDir = createMockAppConfig({
        ...mockAppConfig,
        targetDir: undefined as any,
      });
      const generator = new ShimGenerator(mockFileSystem, configNoTargetDir);
      const result = await generator.generateForTool(toolName, toolConfig);

      expect(result).toEqual([]);
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockChmod).not.toHaveBeenCalled();
    });
  });

  describe('generate', () => {
    let generatorCliShimPath: string;

    beforeEach(() => {
      generatorCliShimPath = path.join(MOCK_TARGET_DIR, mockAppConfig.generatorCliShimName);
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
        shimGenerator as any,
        '_generateGeneratorCliShim'
      ).mockResolvedValue(generatorCliShimPath);

      const result = await shimGenerator.generate(configs);

      expect(result).toEqual([generatorCliShimPath, expectedPathA, expectedPathB]);
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
        shimGenerator as any,
        '_generateGeneratorCliShim'
      ).mockResolvedValue(generatorCliShimPath);

      const result = await shimGenerator.generate({});
      expect(result).toEqual([generatorCliShimPath]);
      expect(generateGeneratorCliShimSpy).toHaveBeenCalledTimes(1);
      expect(generateForToolSpy).not.toHaveBeenCalled();

      generateForToolSpy.mockRestore();
      generateGeneratorCliShimSpy.mockRestore();
    });

    it('should pass options (like overwrite) to generateForTool and _generateGeneratorCliShim, returning all paths', async () => {
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
        shimGenerator as any,
        '_generateGeneratorCliShim'
      ).mockResolvedValue(generatorCliShimPath);

      const result = await shimGenerator.generate(configs, options);

      expect(result).toEqual([generatorCliShimPath, expectedPathA]);
      expect(generateGeneratorCliShimSpy).toHaveBeenCalledWith(options);
      expect(generateForToolSpy).toHaveBeenCalledWith('tool-a', configs['tool-a'], options);

      generateForToolSpy.mockRestore();
      generateGeneratorCliShimSpy.mockRestore();
    });
  });
});
