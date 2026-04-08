import type { ISystemInfo, ProjectConfig, ToolConfig } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import { NodeFileSystem, ResolvedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories } from '@dotfiles/testing-helpers';
import { dedentString } from '@dotfiles/utils';
import { afterEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { findToolByBinary, loadToolConfigByBinary } from '../loadToolConfigs';

describe('findToolByBinary', () => {
  let logger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let systemInfo: ISystemInfo;
  let realFs: NodeFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let tempDir: string | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;
  let testCounter = 0;

  async function setupTest(): Promise<void> {
    testCounter++;
    logger = new TestLogger();
    realFs = new NodeFileSystem();

    const testDirs = await createTestDirectories(logger, realFs, {
      testName: `find-by-binary-test-${testCounter}-${Date.now()}`,
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      if (tempDir) {
        await realFs.rm(tempDir, { recursive: true, force: true });
      }
    };

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: 'test-host',
    };

    // Create a ResolvedFileSystem with the real homeDir
    resolvedFs = new ResolvedFileSystem(realFs, testDirs.paths.homeDir);

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'dotfiles.config.ts'),
      fileSystem: realFs,
      logger,
      systemInfo,
      env: {},
    });

    // Ensure toolConfigsDir exists
    await realFs.mkdir(mockProjectConfig.paths.toolConfigsDir, { recursive: true });
  }

  afterEach(async () => {
    if (cleanupFn) {
      await cleanupFn();
      cleanupFn = undefined;
      tempDir = undefined;
    }
  });

  async function createToolFile(toolName: string, binaryNames: string[]): Promise<void> {
    const toolConfigsDir = mockProjectConfig.paths.toolConfigsDir;
    const toolFilePath = path.join(toolConfigsDir, `${toolName}.tool.ts`);

    const binCalls = binaryNames.map((name) => `.bin('${name}')`).join('');

    // Use a simpler export that doesn't require external imports
    const content = `
      export default (install) =>
        install('manual', { binaryPath: '/usr/bin/${toolName}' })${binCalls};
    `;

    await realFs.writeFile(toolFilePath, content);
  }

  it('should find a tool by its binary name', async () => {
    await setupTest();
    await createToolFile('github-release--bat', ['bat']);

    const result = await findToolByBinary(
      logger,
      'bat',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result.success);
    expect(result.toolName).toBe('github-release--bat');
  });

  it('should return not found when binary does not exist', async () => {
    await setupTest();
    await createToolFile('tool-a', ['binary-a']);

    const result = await findToolByBinary(
      logger,
      'nonexistent-binary',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.matchingTools).toBeUndefined();
  });

  it('should return error when multiple tools provide the same binary', async () => {
    await setupTest();
    await createToolFile('tool-a', ['shared-binary']);
    await createToolFile('tool-b', ['shared-binary']);

    const result = await findToolByBinary(
      logger,
      'shared-binary',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toContain("Multiple tools provide the binary 'shared-binary'");
    expect(result.matchingTools).toContain('tool-a');
    expect(result.matchingTools).toContain('tool-b');
  });

  it('should find tool with multiple binaries when searching for any of them', async () => {
    await setupTest();
    await createToolFile('multi-bin-tool', ['bin-one', 'bin-two']);

    const result1 = await findToolByBinary(
      logger,
      'bin-one',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result1.success);
    expect(result1.toolName).toBe('multi-bin-tool');

    const result2 = await findToolByBinary(
      logger,
      'bin-two',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result2.success);
    expect(result2.toolName).toBe('multi-bin-tool');
  });

  it('should return not found when tool configs directory does not exist', async () => {
    await setupTest();
    const nonExistentDir = '/nonexistent/path/to/tools';

    const result = await findToolByBinary(
      logger,
      'some-binary',
      nonExistentDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.matchingTools).toBeUndefined();
  });
});

describe('loadToolConfigByBinary', () => {
  let logger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let systemInfo: ISystemInfo;
  let realFs: NodeFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let tempDir: string | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;
  let testCounter = 0;

  async function setupTest(): Promise<void> {
    testCounter++;
    logger = new TestLogger();
    realFs = new NodeFileSystem();

    const testDirs = await createTestDirectories(logger, realFs, {
      testName: `load-by-binary-test-${testCounter}-${Date.now()}`,
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      if (tempDir) {
        await realFs.rm(tempDir, { recursive: true, force: true });
      }
    };

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: 'test-host',
    };

    // Create a ResolvedFileSystem with the real homeDir
    resolvedFs = new ResolvedFileSystem(realFs, testDirs.paths.homeDir);

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'dotfiles.config.ts'),
      fileSystem: realFs,
      logger,
      systemInfo,
      env: {},
    });

    // Ensure toolConfigsDir exists
    await realFs.mkdir(mockProjectConfig.paths.toolConfigsDir, { recursive: true });
  }

  afterEach(async () => {
    if (cleanupFn) {
      await cleanupFn();
      cleanupFn = undefined;
      tempDir = undefined;
    }
  });

  async function createToolFile(toolName: string, binaryNames: string[]): Promise<void> {
    const toolConfigsDir = mockProjectConfig.paths.toolConfigsDir;
    const toolFilePath = path.join(toolConfigsDir, `${toolName}.tool.ts`);

    const binCalls = binaryNames.map((name) => `.bin('${name}')`).join('');

    // Use a simpler export that doesn't require external imports
    const content = dedentString(`
      export default (install) =>
        install('manual', { binaryPath: '/usr/bin/${toolName}' })${binCalls};
    `);

    await realFs.writeFile(toolFilePath, content);
  }

  it('should load tool config by binary name', async () => {
    await setupTest();
    await createToolFile('my-tool', ['my-binary']);

    const result = await loadToolConfigByBinary(
      logger,
      'my-binary',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result);
    assert(!('error' in result));
    const toolConfig = result as ToolConfig;
    expect(toolConfig.name).toBe('my-tool');
    expect(toolConfig.binaries).toContain('my-binary');
  });

  it('should return undefined when binary is not found', async () => {
    await setupTest();
    await createToolFile('tool-a', ['binary-a']);

    const result = await loadToolConfigByBinary(
      logger,
      'nonexistent',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result).toBeUndefined();
  });

  it('should return error object when multiple tools provide the same binary', async () => {
    await setupTest();
    await createToolFile('tool-a', ['duplicate-bin']);
    await createToolFile('tool-b', ['duplicate-bin']);

    const result = await loadToolConfigByBinary(
      logger,
      'duplicate-bin',
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result);
    assert('error' in result);
    expect(result.error).toContain("Multiple tools provide the binary 'duplicate-bin'");
  });
});
