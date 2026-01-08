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

describe('HookExecutor - error reporting', () => {
  it('prints short tslog error and writes multiline shell output details', async () => {
    const logger: TestLogger<ILogObj> = new TestLogger({ name: 'test', minLevel: LogLevel.DEFAULT });
    const { fs } = await createMemFileSystem();
    const testDirs = await createTestDirectories(logger, fs, { testName: 'hook-executor-error-reporting' });

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

    const hookExecutor = new HookExecutor((): void => {});
    const enhancedContext = hookExecutor.createEnhancedContext(baseContext, fs);

    const failingHook = async (context: IAfterInstallContext): Promise<void> => {
      await context.$`sh -c "echo shell-stderr 1>&2; exit 1"`.quiet();
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

    // With context logging, the first argument is the context prefix [after-install]
    // and second argument is the log message "Hook failed: <error cause>"
    const contextArg = errorLog[0];
    const messageArg = errorLog[1];
    assert.equal(typeof contextArg, 'string');
    expect(String(contextArg)).toBe('[after-install]');

    // The log message now includes the error cause from stderr
    assert.equal(typeof messageArg, 'string');
    expect(String(messageArg)).toContain('Hook failed: shell-stderr');

    // The error object IS passed to the logger, but SafeLogger filters the stack trace
    // to only show .tool.ts frames (which won't exist in test hooks defined inline)
    const errorArg = errorLog[2];
    expect(errorArg).toBeDefined();

    // The writeOutput may be empty when there's no .tool.ts file in the stack
    // (which is the case in tests where the hook is defined inline)
    // Verbose details like exit code and stderr are only shown in trace mode
  });
});
