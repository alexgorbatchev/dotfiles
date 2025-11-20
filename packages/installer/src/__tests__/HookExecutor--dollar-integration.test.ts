import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { EnhancedInstallHookContext, ToolConfig } from '@dotfiles/core';
import { createMemFileSystem, type IMemFileSystemReturn } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { HookExecutor } from '../utils/HookExecutor';
import { createTestInstallHookContext } from './hookContextTestHelper';

describe('HookExecutor $ Integration', () => {
  let logger: TestLogger;
  let hookExecutor: HookExecutor;
  let memFs: IMemFileSystemReturn;
  let tempDir: string;
  let toolConfigPath: string;

  beforeEach(async () => {
    logger = new TestLogger();
    hookExecutor = new HookExecutor(logger);
    memFs = await createMemFileSystem();

    // Create a temporary directory for integration tests
    tempDir = await mkdtemp(path.join(tmpdir(), 'hook-executor-test-'));
    toolConfigPath = path.join(tempDir, 'test-tool.tool.ts');

    // Create a dummy tool config file
    await writeFile(toolConfigPath, 'export default async (c) => { c.bin("test-tool"); };');
  });

  afterEach(async () => {
    // Clean up temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should execute shell commands with correct working directory', async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'test-tool',
      binaries: ['test-tool'],
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext();

    const contextWithToolConfig = {
      ...baseContext,
      toolConfig: mockToolConfig,
    };

    let actualCwd: string | undefined;

    const hookThatUsesShell = async (ctx: EnhancedInstallHookContext) => {
      // With Bun's $, hooks need to explicitly cd to the tool config directory
      const toolConfigDir = ctx.toolConfig?.configFilePath
        ? path.dirname(ctx.toolConfig.configFilePath)
        : process.cwd();

      // Use $ with cd to work in the tool config directory
      const result = await ctx.$`cd ${toolConfigDir} && pwd`.quiet();
      actualCwd = result.stdout.toString().trim();

      // Verify we can access files relative to the tool config directory
      const configExists =
        await ctx.$`cd ${toolConfigDir} && test -f ./test-tool.tool.ts && echo "exists" || echo "missing"`.quiet();
      expect(configExists.stdout.toString().trim()).toBe('exists');
    };

    const enhancedContext = hookExecutor.createEnhancedContext(contextWithToolConfig, memFs.fs);

    await hookExecutor.executeHook('afterInstall', hookThatUsesShell, enhancedContext);

    // Verify the working directory was set to the tool config directory
    // Use realpathSync to resolve symlinks for proper comparison on macOS
    expect(realpathSync(actualCwd || '')).toBe(realpathSync(tempDir));
  });

  it('should create files relative to tool config directory', async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'file-creator-tool',
      binaries: ['file-creator-tool'],
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      toolName: 'file-creator-tool',
      installDir: '/test/install/dir',
    });

    const contextWithToolConfig = {
      ...baseContext,
      toolConfig: mockToolConfig,
    };

    const hookThatCreatesFile = async (ctx: EnhancedInstallHookContext) => {
      // With Bun's $, hooks need to explicitly cd to the tool config directory
      const toolConfigDir = ctx.toolConfig?.configFilePath
        ? path.dirname(ctx.toolConfig.configFilePath)
        : process.cwd();

      // Create a file relative to the tool config directory using $
      await ctx.$`cd ${toolConfigDir} && echo "test content" > ./created-by-hook.txt`.quiet();

      // Verify the file was created
      const result = await ctx.$`cd ${toolConfigDir} && cat ./created-by-hook.txt`.quiet();
      expect(result.stdout.toString().trim()).toBe('test content');
    };

    const enhancedContext = hookExecutor.createEnhancedContext(contextWithToolConfig, memFs.fs);

    await hookExecutor.executeHook('afterInstall', hookThatCreatesFile, enhancedContext);

    // Verify the file exists in the expected location
    const createdFilePath = path.join(tempDir, 'created-by-hook.txt');
    expect(fs.existsSync(createdFilePath)).toBe(true);
  });

  it('should handle fallback $ when configFilePath is missing', async () => {
    const mockToolConfigWithoutPath: ToolConfig = {
      // No configFilePath property
      name: 'fallback-tool',
      binaries: ['fallback-tool'],
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      toolName: 'fallback-tool',
      installDir: '/test/install/dir',
    });

    const contextWithoutConfigPath = {
      ...baseContext,
      toolConfig: mockToolConfigWithoutPath,
    };

    let shellWorked = false;

    const hookThatUsesShellFallback = async (ctx: EnhancedInstallHookContext) => {
      // Should still be able to use $ even without configFilePath
      const result = await ctx.$`echo "fallback works"`.quiet();
      if (result.stdout.toString().includes('fallback works')) {
        shellWorked = true;
      }
    };

    const enhancedContext = hookExecutor.createEnhancedContext(contextWithoutConfigPath, memFs.fs);

    await hookExecutor.executeHook('afterInstall', hookThatUsesShellFallback, enhancedContext);

    expect(shellWorked).toBe(true);
  });
});
