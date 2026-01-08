import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { chmod } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IAfterInstallContext, ToolConfig } from '@dotfiles/core';
import { createMemFileSystem, type IMemFileSystemReturn } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { $ } from 'bun';
import { createConfiguredShell } from '../utils/createConfiguredShell';
import { HookExecutor, type HookHandler } from '../utils/HookExecutor';
import { createTestInstallHookContext } from './hookContextTestHelper';

describe('HookExecutor PATH Enhancement for after-install', () => {
  let logger: TestLogger;
  let hookExecutor: HookExecutor;
  let memFs: IMemFileSystemReturn;
  let tempDir: string;
  let toolConfigPath: string;
  let binaryDir: string;

  beforeEach(async () => {
    logger = new TestLogger();
    hookExecutor = new HookExecutor((): void => {});
    memFs = await createMemFileSystem();

    // Create a temporary directory for integration tests
    tempDir = await mkdtemp(path.join(tmpdir(), 'hook-executor-path-test-'));
    toolConfigPath = path.join(tempDir, 'test-tool.tool.ts');

    // Create a dummy tool config file
    await writeFile(toolConfigPath, 'export default async (c) => { c.bin("test-tool"); };');

    // Create a binary directory with a test executable
    binaryDir = path.join(tempDir, 'bin');
    await $`mkdir -p ${binaryDir}`.quiet();

    // Create a simple test executable script
    const testBinaryPath = path.join(binaryDir, 'test-tool');
    await writeFile(testBinaryPath, '#!/bin/bash\necho "test-tool-executed"');
    await new Promise<void>((resolve, reject) => {
      chmod(testBinaryPath, 0o755, (err) => (err ? reject(err) : resolve()));
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should include binary directories in PATH for after-install hooks', async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'test-tool',
      binaries: ['test-tool'],
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {},
    };

    const testBinaryPath = path.join(binaryDir, 'test-tool');

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell($, process.env),
    });

    const afterInstallContext: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: tempDir,
      binaryPaths: [testBinaryPath],
      version: '1.0.0',
    };

    let pathFromShell: string | undefined;
    let toolOutput: string | undefined;

    const hookThatUsesInstalledBinary: HookHandler<IAfterInstallContext> = async (ctx) => {
      // Check what PATH the shell has access to
      const pathResult = await ctx.$`echo $PATH`.quiet();
      pathFromShell = pathResult.stdout.toString().trim();

      // Execute the binary directly by name - bun shell should find it via enhanced PATH
      const toolResult = await ctx.$`test-tool`.quiet();
      toolOutput = toolResult.stdout.toString().trim();
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, memFs.fs);

    await hookExecutor.executeHook(logger, 'after-install', hookThatUsesInstalledBinary, enhancedContext);

    // Verify the binary directory is in PATH
    expect(pathFromShell).toContain(binaryDir);

    // Verify the binary was executed successfully
    expect(toolOutput).toBe('test-tool-executed');
  });

  it('should include multiple binary directories in PATH when binaryPaths span different directories', async () => {
    // Create a second binary directory
    const binaryDir2 = path.join(tempDir, 'lib', 'bin');
    await $`mkdir -p ${binaryDir2}`.quiet();

    // Create a second test executable
    const testBinary2Path = path.join(binaryDir2, 'test-tool-2');
    await writeFile(testBinary2Path, '#!/bin/bash\necho "test-tool-2-executed"');
    await new Promise<void>((resolve, reject) => {
      chmod(testBinary2Path, 0o755, (err) => (err ? reject(err) : resolve()));
    });

    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'multi-bin-tool',
      binaries: ['test-tool', 'test-tool-2'],
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell($, process.env),
    });

    const afterInstallContext: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: tempDir,
      binaryPaths: [path.join(binaryDir, 'test-tool'), testBinary2Path],
      version: '1.0.0',
    };

    let pathFromShell: string | undefined;

    const hookThatChecksPath: HookHandler<IAfterInstallContext> = async (ctx) => {
      const pathResult = await ctx.$`echo $PATH`.quiet();
      pathFromShell = pathResult.stdout.toString().trim();

      // Both binaries should be executable directly by name
      const tool1Result = await ctx.$`test-tool`.quiet();
      expect(tool1Result.stdout.toString().trim()).toBe('test-tool-executed');

      const tool2Result = await ctx.$`test-tool-2`.quiet();
      expect(tool2Result.stdout.toString().trim()).toBe('test-tool-2-executed');
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, memFs.fs);

    await hookExecutor.executeHook(logger, 'after-install', hookThatChecksPath, enhancedContext);

    // Verify both binary directories are in PATH
    expect(pathFromShell).toContain(binaryDir);
    expect(pathFromShell).toContain(binaryDir2);
  });

  it('should handle empty binaryPaths gracefully', async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'no-bin-tool',
      binaries: [],
      version: '1.0.0',
      installationMethod: 'brew',
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell($, process.env),
    });

    const afterInstallContext: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: tempDir,
      binaryPaths: [],
      version: '1.0.0',
    };

    const hookThatEchos: HookHandler<IAfterInstallContext> = async (ctx) => {
      // Should still be able to use shell even without binary paths
      const result = await ctx.$`echo "works"`.quiet();
      expect(result.stdout.toString().trim()).toBe('works');
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, memFs.fs);

    const result = await hookExecutor.executeHook(logger, 'after-install', hookThatEchos, enhancedContext);
    expect(result.success).toBe(true);
  });
});
