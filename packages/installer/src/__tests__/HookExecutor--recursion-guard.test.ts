import { createShell, type IAfterInstallContext, type ToolConfig } from '@dotfiles/core';
import { type IFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { createConfiguredShell } from '../utils/createConfiguredShell';
import { HookExecutor, type HookHandler } from '../utils/HookExecutor';
import { createTestInstallHookContext } from './hookContextTestHelper';

describe('HookExecutor recursion guard preservation', () => {
  let logger: TestLogger;
  let hookExecutor: HookExecutor;
  let testDirs: ITestDirectories;
  let nodeFs: IFileSystem;
  let toolConfigPath: string;
  let binaryDir: string;
  let $: ReturnType<typeof createShell>;

  beforeAll(async () => {
    nodeFs = new NodeFileSystem();
    testDirs = await createTestDirectories(new TestLogger(), nodeFs, { testName: 'hook-executor-recursion-guard' });
  });

  beforeEach(async () => {
    logger = new TestLogger();
    hookExecutor = new HookExecutor((): void => {});
    $ = createShell();

    toolConfigPath = path.join(testDirs.paths.homeDir, 'test-tool.tool.ts');
    await nodeFs.writeFile(toolConfigPath, 'export default async (c) => { c.bin("test-tool"); };');

    binaryDir = path.join(testDirs.paths.homeDir, 'bin');
    await nodeFs.ensureDir(binaryDir);

    const testBinaryPath = path.join(binaryDir, 'test-tool');
    await nodeFs.writeFile(testBinaryPath, '#!/bin/bash\necho "test-tool-executed"');
    await $`chmod +x ${testBinaryPath}`.quiet();
  });

  it('should preserve installEnv recursion guard when enhancing PATH for after-install hooks', async () => {
    const recursionGuardEnvVar = 'DOTFILES_INSTALLING_TEST_TOOL';

    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'test-tool',
      binaries: ['test-tool'],
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {
        repo: 'test/test-repo',
      },
    };

    const testBinaryPath = path.join(binaryDir, 'test-tool');

    // Create installEnv with the recursion guard set
    const installEnv: Record<string, string | undefined> = {
      ...process.env,
      [recursionGuardEnvVar]: 'true',
      PATH: `${binaryDir}:${process.env['PATH'] || ''}`,
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    // Add installEnv separately to test that createEnhancedContext uses it
    const contextWithInstallEnv = {
      ...baseContext,
      installEnv,
    };

    const afterInstallContext: IAfterInstallContext = {
      ...contextWithInstallEnv,
      toolConfig: mockToolConfig,
      installedDir: testDirs.paths.homeDir,
      binaryPaths: [testBinaryPath],
      version: '1.0.0',
    };

    let recursionGuardValue: string | undefined;

    const hookThatChecksRecursionGuard: HookHandler<IAfterInstallContext> = async (ctx) => {
      // Check if the recursion guard env var is visible in the shell
      const result = await ctx.$`printenv ${recursionGuardEnvVar}`.quiet();
      recursionGuardValue = result.stdout.toString().trim();
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, nodeFs);

    await hookExecutor.executeHook(logger, 'after-install', hookThatChecksRecursionGuard, enhancedContext);

    // The recursion guard should be preserved in the shell's environment
    // This prevents infinite loops when after-install hooks call the shimmed binary
    expect(recursionGuardValue).toBe('true');
  });

  it('should preserve custom installEnv variables when PATH enhancement is applied', async () => {
    const customEnvVar = 'CUSTOM_INSTALL_VAR';
    const customEnvValue = 'custom-value-123';

    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: 'test-tool',
      binaries: ['test-tool'],
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {
        repo: 'test/test-repo',
      },
    };

    const testBinaryPath = path.join(binaryDir, 'test-tool');

    // Create installEnv with custom variable
    const installEnv: Record<string, string | undefined> = {
      ...process.env,
      [customEnvVar]: customEnvValue,
      PATH: `${binaryDir}:${process.env['PATH'] || ''}`,
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    // Add installEnv to test that createEnhancedContext uses it for PATH enhancement
    const contextWithInstallEnv = {
      ...baseContext,
      installEnv,
    };

    const afterInstallContext: IAfterInstallContext = {
      ...contextWithInstallEnv,
      toolConfig: mockToolConfig,
      installedDir: testDirs.paths.homeDir,
      binaryPaths: [testBinaryPath],
      version: '1.0.0',
    };

    let customVarValue: string | undefined;

    const hookThatChecksCustomVar: HookHandler<IAfterInstallContext> = async (ctx) => {
      const result = await ctx.$`printenv ${customEnvVar}`.quiet();
      customVarValue = result.stdout.toString().trim();
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, nodeFs);

    await hookExecutor.executeHook(logger, 'after-install', hookThatChecksCustomVar, enhancedContext);

    // Custom env vars from installEnv should be preserved
    expect(customVarValue).toBe(customEnvValue);
  });
});
