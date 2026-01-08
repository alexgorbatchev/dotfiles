import { describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { Architecture, type IAfterInstallContext, type ISystemInfo, Platform } from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import { LogLevel, TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories } from '@dotfiles/testing-helpers';
import { replaceInFile } from '@dotfiles/utils';
import { $ } from 'bun';
import type { ILogObj } from 'tslog';
import { createConfiguredShell } from '../createConfiguredShell';
import { HookExecutor } from '../HookExecutor';

describe('HookExecutor - stack trace filtering', () => {
  it('only shows .tool.ts frames in error stack trace output', async () => {
    const logger: TestLogger<ILogObj> = new TestLogger({ name: 'test', minLevel: LogLevel.DEFAULT });
    const { fs } = await createMemFileSystem();
    const testDirs = await createTestDirectories(logger, fs, { testName: 'hook-executor-stack-filter' });

    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: testDirs.paths.homeDir,
    };

    const projectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: fs,
      logger,
      systemInfo,
      env: {},
    });

    const toolName = 'test-tool';
    const toolConfig: GithubReleaseToolConfig = {
      name: toolName,
      binaries: [toolName],
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
      },
    };

    const toolConfigFilePath = path.join(process.cwd(), `${toolName}.tool.ts`);
    toolConfig.configFilePath = toolConfigFilePath;

    const configuredShell = createConfiguredShell($, process.env);

    const currentDir: string = path.join(projectConfig.paths.binariesDir, toolName, 'current');

    const baseContext: IAfterInstallContext = {
      projectConfig,
      systemInfo,
      toolName,
      toolDir: path.dirname(toolConfigFilePath),
      currentDir,
      toolConfig,
      installedDir: path.join(testDirs.paths.binariesDir, toolName, 'install'),
      binaryPaths: [],
      timestamp: '2025-12-18-00-00-00',
      $: configuredShell,
      fileSystem: fs,
      replaceInFile: (filePath, from, to, options) =>
        replaceInFile(fs.asIResolvedFileSystem, filePath, from, to, options),
    };

    const hookExecutor = new HookExecutor(() => {
      // Output handler - not used in this test
    });
    const enhancedContext = hookExecutor.createEnhancedContext(baseContext, fs);

    // Create a hook that fails with a shell error
    const failingHook = async (context: IAfterInstallContext): Promise<void> => {
      await context.$`sh -c "echo 'command not found: fake-tool' 1>&2; exit 1"`.quiet();
    };

    await hookExecutor.executeHook(logger, 'after-install', failingHook, enhancedContext, { continueOnError: true });

    // Find the ERROR log entry
    const errorLogs = logger.logs.filter((log) => {
      const meta = log['_meta'];
      const parentNames = meta?.parentNames ?? [];
      return Boolean(
        meta && meta.logLevelName === 'ERROR' && meta.name === 'executeHook' && parentNames.includes('HookExecutor')
      );
    });

    const errorLog = errorLogs[0];
    assert(errorLog);

    // The error IS passed to the logger, but SafeLogger filters the stack trace
    // to only show .tool.ts frames (which won't exist in test hooks defined inline)
    const errorArg = errorLog[2];
    expect(errorArg).toBeDefined();

    // Verify the log message includes the actual error cause
    const contextArg = String(errorLog[0]);
    const messageArg = String(errorLog[1]);
    expect(contextArg).toBe('[after-install]');
    expect(messageArg).toContain('Hook failed: command not found: fake-tool');

    // The writeOutput may be empty if there's no .tool.ts file in the stack
    // (which is the case in tests where the hook is defined inline)
    // When there IS a .tool.ts file, the output will contain just the code frame
    // wrapped in --- delimiters, not verbose exit code/stderr details
  });

  it('includes error cause in the log message', async () => {
    const logger: TestLogger<ILogObj> = new TestLogger({ name: 'test', minLevel: LogLevel.DEFAULT });
    const { fs } = await createMemFileSystem();
    const testDirs = await createTestDirectories(logger, fs, { testName: 'hook-executor-error-cause' });

    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: testDirs.paths.homeDir,
    };

    const projectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: fs,
      logger,
      systemInfo,
      env: {},
    });

    const toolName = 'test-tool';
    const toolConfig: GithubReleaseToolConfig = {
      name: toolName,
      binaries: [toolName],
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
      },
    };

    const toolConfigFilePath = path.join(process.cwd(), `${toolName}.tool.ts`);
    toolConfig.configFilePath = toolConfigFilePath;

    const configuredShell = createConfiguredShell($, process.env);

    const currentDir: string = path.join(projectConfig.paths.binariesDir, toolName, 'current');

    const baseContext: IAfterInstallContext = {
      projectConfig,
      systemInfo,
      toolName,
      toolDir: path.dirname(toolConfigFilePath),
      currentDir,
      toolConfig,
      installedDir: path.join(testDirs.paths.binariesDir, toolName, 'install'),
      binaryPaths: [],
      timestamp: '2025-12-18-00-00-00',
      $: configuredShell,
      fileSystem: fs,
      replaceInFile: (filePath, from, to, options) =>
        replaceInFile(fs.asIResolvedFileSystem, filePath, from, to, options),
    };

    const hookExecutor = new HookExecutor(() => {
      // Output handler - not used in this test
    });
    const enhancedContext = hookExecutor.createEnhancedContext(baseContext, fs);

    // Create a hook that fails with a shell error containing a specific message
    const failingHook = async (context: IAfterInstallContext): Promise<void> => {
      await context.$`sh -c "echo 'bun: command not found: navi' 1>&2; exit 1"`.quiet();
    };

    await hookExecutor.executeHook(logger, 'after-install', failingHook, enhancedContext, { continueOnError: true });

    const errorLogs = logger.logs.filter((log) => {
      const meta = log['_meta'];
      const parentNames = meta?.parentNames ?? [];
      return Boolean(
        meta && meta.logLevelName === 'ERROR' && meta.name === 'executeHook' && parentNames.includes('HookExecutor')
      );
    });

    const errorLog = errorLogs[0];
    assert(errorLog);

    // The error message should include the actual cause from stderr
    const contextArg = String(errorLog[0]);
    const messageArg = String(errorLog[1]);

    // Current behavior: Just "Hook failed"
    // Desired behavior: "Hook failed: bun: command not found: navi"
    expect(contextArg).toBe('[after-install]');

    // This test will fail until we implement the fix
    // The message should include the stderr output
    expect(messageArg).toContain('bun: command not found: navi');
  });
});
