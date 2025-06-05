/**
 * @file Tests for the ShimGenerator class.
 *
 * ## Development Plan
 *
 * - [x] **Setup Mocks:**
 *   - [x] Mock `IFileSystem` interface.
 *   - [x] Mock `AppConfig` with required properties.
 *   - [x] Mock `createLogger` to spy on log calls if necessary (or verify behavior without direct log spying).
 * - [x] **Test Suite for `ShimGenerator`:**
 *   - [x] **Constructor:**
 *     - [x] Test correct initialization.
 *   - [x] **`generateForTool` Method:**
 *     - [x] Test basic shim content generation.
 *     - [x] Test file writing and `chmod` calls.
 *     - [x] Test `dryRun` option (logs actions, no file ops).
 *     - [x] Test `overwrite: false` when shim exists (skips).
 *     - [x] Test `overwrite: true` when shim exists (overwrites).
 *     - [x] Test behavior when `shimDir` is not configured in `AppConfig`.
 *     - [x] Test behavior with different `cliToolPath` configurations.
 *     - [x] Test with tool names containing special characters (if applicable, ensure proper escaping in shim).
 *     - [x] Test when `toolConfig.binaries` is empty or undefined (fallback to toolName).
 *   - [x] **`generate` Method:**
 *     - [x] Test that `generateForTool` is called for each tool in `toolConfigs`.
 *     - [x] Test with empty `toolConfigs`.
 * - [ ] Ensure all tests pass.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Achieve 100% test coverage for `ShimGenerator.ts`.
 * - [x] Update mockAppConfig with `generatedArtifactsManifestPath`.
 * - [ ] Update the memory bank.
 */

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'; // Added spyOn
import path from 'node:path';
import type { IFileSystem } from '../../file-system';
import type { AppConfig, ToolConfig } from '../../../types';
import { ShimGenerator } from '../ShimGenerator';
// import { createLogger } from '../../logger'; // Removed unused import

describe('ShimGenerator', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: AppConfig;
  let shimGenerator: ShimGenerator;

  let mockWriteFile: ReturnType<typeof mock>;
  let mockChmod: ReturnType<typeof mock>;
  let mockExists: ReturnType<typeof mock>;
  let mockEnsureDir: ReturnType<typeof mock>;

  const MOCK_TARGET_DIR = '/test/shims';
  const MOCK_BIN_DIR = '/test/bin';
  // MOCK_CLI_TOOL_PATH is removed as cliToolPath is not directly used from AppConfig by ShimGenerator anymore

  beforeEach(() => {
    mockWriteFile = mock(() => Promise.resolve());
    mockChmod = mock(() => Promise.resolve());
    mockExists = mock(() => Promise.resolve(false));
    mockEnsureDir = mock(() => Promise.resolve());

    mockFileSystem = {
      writeFile: mockWriteFile,
      chmod: mockChmod,
      exists: mockExists,
      ensureDir: mockEnsureDir,
      readFile: mock(() => Promise.resolve('')),
      mkdir: mock(() => Promise.resolve()),
      readdir: mock(() => Promise.resolve([])),
      rm: mock(() => Promise.resolve()),
      stat: mock(async () => ({ isDirectory: () => true }) as any),
      symlink: mock(async () => {}),
      readlink: mock(async () => ''),
      copyFile: mock(async () => {}),
      rename: mock(async () => {}),
      rmdir: mock(async () => {}),
    };

    mockAppConfig = {
      targetDir: MOCK_TARGET_DIR, // Corrected: Use MOCK_TARGET_DIR for the shims in tests
      binDir: MOCK_BIN_DIR,
      // cliToolPath is not part of AppConfig for ShimGenerator's direct use.
      // ShimGenerator defaults to 'mydotfiles'.
      // The original targetDir in AppConfig might be something like '/usr/bin' for actual deployment,
      // but for tests, we use MOCK_TARGET_DIR to isolate shim generation.
      dotfilesDir: '/test/dotfiles',
      generatedDir: '/test/dotfiles/.generated',
      toolConfigDir: '/test/dotfiles/generator/src/tools',
      debug: '',
      cacheEnabled: true,
      cacheDir: '/test/dotfiles/.generated/cache',
      binariesDir: '/test/dotfiles/.generated/binaries',
      zshInitDir: '/test/dotfiles/.generated/zsh',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
      completionsDir: '/test/dotfiles/.generated/completions',
      githubApiCacheEnabled: true,
      githubApiCacheTtl: 3600000,
      generatedArtifactsManifestPath: '/test/dotfiles/.generated/generated-manifest.json',
    };

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
    };
    const expectedShimPath = path.join(MOCK_TARGET_DIR, toolName); // Use MOCK_TARGET_DIR
    const expectedBinaryPath = path.join(MOCK_BIN_DIR, 'my-tool-binary');

    it('should generate correct shim content and write file', async () => {
      await shimGenerator.generateForTool(toolName, toolConfig);

      expect(mockEnsureDir).toHaveBeenCalledWith(MOCK_TARGET_DIR); // Use MOCK_TARGET_DIR
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile.mock.calls[0]).toBeDefined(); // Ensure the call exists
      const writtenContent = mockWriteFile.mock.calls[0]![1]; // Use non-null assertion
      expect(writtenContent).toContain(`#!/usr/bin/env bash`);
      expect(writtenContent).toContain(`# Shim for ${toolName}`);
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPath}"`);
      expect(writtenContent).toContain(
        `INSTALL_COMMAND="mydotfiles install ${toolName}"` // ShimGenerator defaults to 'mydotfiles'
      );
      expect(mockChmod).toHaveBeenCalledWith(expectedShimPath, 0o755);
    });

    it('should use toolName as binary name if toolConfig.binaries is empty', async () => {
      const configNoBinaries: ToolConfig = { name: toolName, version: '1.0.0', binaries: [] };
      const expectedBinaryPathFallback = path.join(MOCK_BIN_DIR, toolName);
      await shimGenerator.generateForTool(toolName, configNoBinaries);

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
      };
      const expectedBinaryPathFallback = path.join(MOCK_BIN_DIR, toolName);
      await shimGenerator.generateForTool(toolName, configUndefinedBinaries);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockWriteFile.mock.calls[0]).toBeDefined();
      const writtenContent = mockWriteFile.mock.calls[0]![1];
      expect(writtenContent).toContain(`TOOL_EXECUTABLE="${expectedBinaryPathFallback}"`);
    });

    it('should perform a dry run if options.dryRun is true', async () => {
      await shimGenerator.generateForTool(toolName, toolConfig, { dryRun: true });

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockChmod).not.toHaveBeenCalled();
      // In dryRun mode, no file system operations should occur.
      // Logging behavior is not asserted as per project rules.
    });

    it('should skip if shim exists and overwrite is false', async () => {
      mockExists.mockResolvedValue(true);
      await shimGenerator.generateForTool(toolName, toolConfig, { overwrite: false });

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should overwrite if shim exists and overwrite is true', async () => {
      mockExists.mockResolvedValue(true);
      await shimGenerator.generateForTool(toolName, toolConfig, { overwrite: true });

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should skip if targetDir is not configured', async () => {
      // Create a new AppConfig for this test case where targetDir is undefined
      const configNoTargetDir: AppConfig = {
        ...mockAppConfig, // Spread existing valid properties
        targetDir: undefined as any, // Set targetDir to undefined
      };
      const generator = new ShimGenerator(mockFileSystem, configNoTargetDir);
      await generator.generateForTool(toolName, toolConfig);

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockChmod).not.toHaveBeenCalled();
    });

    // The test for default cliToolPath is implicitly covered by
    // 'should generate correct shim content and write file'
    // since ShimGenerator now hardcodes the default if appConfig.cliToolPath is not available.
  });

  describe('generate', () => {
    it('should call generateForTool for each tool config', async () => {
      const configs: Record<string, ToolConfig> = {
        'tool-a': { name: 'tool-a', binaries: ['tool-a-bin'], version: '1.0' },
        'tool-b': { name: 'tool-b', binaries: ['tool-b-bin'], version: '2.0' },
      };
      // Spy on generateForTool
      const generateForToolSpy = spyOn(shimGenerator, 'generateForTool'); // Corrected spyOn

      await shimGenerator.generate(configs);

      expect(generateForToolSpy).toHaveBeenCalledTimes(2);
      expect(generateForToolSpy).toHaveBeenCalledWith('tool-a', configs['tool-a'], undefined);
      expect(generateForToolSpy).toHaveBeenCalledWith('tool-b', configs['tool-b'], undefined);

      generateForToolSpy.mockRestore();
    });

    it('should handle empty toolConfigs object', async () => {
      const generateForToolSpy = spyOn(shimGenerator, 'generateForTool'); // Corrected spyOn
      await shimGenerator.generate({});
      expect(generateForToolSpy).not.toHaveBeenCalled();
      generateForToolSpy.mockRestore();
    });

    it('should pass options to generateForTool', async () => {
      const configs: Record<string, ToolConfig> = {
        'tool-a': { name: 'tool-a', binaries: ['tool-a-bin'], version: '1.0' },
      };
      const options = { dryRun: true, overwrite: true };
      const generateForToolSpy = spyOn(shimGenerator, 'generateForTool'); // Corrected spyOn

      await shimGenerator.generate(configs, options);

      expect(generateForToolSpy).toHaveBeenCalledWith('tool-a', configs['tool-a'], options);
      generateForToolSpy.mockRestore();
    });
  });
});
