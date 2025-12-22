import { describe, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import type { IAfterInstallContext, ISystemInfo } from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import { LogLevel, TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories } from '@dotfiles/testing-helpers';
import { $ } from 'bun';
import type { ILogObj } from 'tslog';
import { createConfiguredShell } from '../createConfiguredShell';
import { HookExecutor } from '../HookExecutor';

describe('HookExecutor - error reporting', () => {
  it('prints short tslog error and writes multiline shell output details', async () => {
    const logger: TestLogger<ILogObj> = new TestLogger({ name: 'test', minLevel: LogLevel.DEFAULT });
    let capturedOutput = '';
    const { fs } = await createMemFileSystem();
    const testDirs = await createTestDirectories(logger, fs, { testName: 'hook-executor-error-reporting' });

    const systemInfo: ISystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
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
      installDir: path.join(testDirs.paths.binariesDir, toolName, 'install'),
      timestamp: '2025-12-18-00-00-00',
      $: configuredShell,
      fileSystem: fs,
    };

    const hookExecutor = new HookExecutor(logger, (chunk: string): void => {
      capturedOutput += chunk;
    });
    const enhancedContext = hookExecutor.createEnhancedContext(baseContext, fs);

    const failingHook = async (context: IAfterInstallContext): Promise<void> => {
      await context.$`sh -c "echo shell-stderr 1>&2; exit 1"`.quiet();
    };

    await hookExecutor.executeHook('after-install', failingHook, enhancedContext, { continueOnError: true });

    const errorLogs = logger.logs.filter((log) => {
      const meta = log['_meta'];
      const parentNames = meta?.parentNames ?? [];
      return Boolean(
        meta && meta.logLevelName === 'ERROR' && meta.name === 'executeHook' && parentNames.includes('HookExecutor')
      );
    });

    const errorLog = errorLogs[0];
    assert(errorLog);

    const firstArg = errorLog[0];
    assert.equal(typeof firstArg, 'string');
    const message = String(firstArg);

    // Desired behavior:
    // - short user-facing error goes through tslog
    // - detailed multiline output goes through stdout writer
    // - do not pass the raw error object (which triggers prettyErrorTemplate stack output)
    assert.equal(errorLog[1], undefined);

    assert(message.includes('Installation failed'));

    assert(capturedOutput.includes('exit code: 1'), capturedOutput);
    assert(capturedOutput.includes('stderr:'), capturedOutput);
    assert(capturedOutput.includes('shell-stderr'), capturedOutput);
  });
});
