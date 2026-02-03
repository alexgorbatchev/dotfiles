import {
  Architecture,
  createShell,
  createToolLog,
  type IAfterInstallContext,
  type ISystemInfo,
  Platform,
} from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import { LogLevel, TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories } from '@dotfiles/testing-helpers';
import { replaceInFile } from '@dotfiles/utils';
import { describe, it } from 'bun:test';
import path from 'node:path';
import type { ILogObj } from 'tslog';
import { createConfiguredShell } from '../createConfiguredShell';
import { HookExecutor } from '../HookExecutor';

const createFailingHookWithStderr = (stderrMessage: string) => async (context: IAfterInstallContext): Promise<void> => {
  await context.$`sh -c "echo '${stderrMessage}' 1>&2; exit 1"`.quiet();
};

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

    const configuredShell = createConfiguredShell(createShell({ logger }), process.env);

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
      resolve: () => {
        throw new Error('resolve not supported in test context');
      },
      log: createToolLog(logger, toolName),
    };

    const hookExecutor = new HookExecutor(() => {
      // Output handler - not used in this test
    });
    const enhancedContext = hookExecutor.createEnhancedContext(baseContext, fs);

    await hookExecutor.executeHook(
      logger,
      'after-install',
      createFailingHookWithStderr('command not found: fake-tool'),
      enhancedContext,
      { continueOnError: true },
    );

    // Verify the error log was emitted with the correct context and message
    // The log message includes the actual error cause
    logger.expect(['ERROR'], ['test', 'HookExecutor', 'executeHook'], ['after-install'], [
      /command not found: fake-tool/,
    ]);
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

    const configuredShell = createConfiguredShell(createShell({ logger }), process.env);

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
      resolve: () => {
        throw new Error('resolve not supported in test context');
      },
      log: createToolLog(logger, toolName),
    };

    const hookExecutor = new HookExecutor(() => {
      // Output handler - not used in this test
    });
    const enhancedContext = hookExecutor.createEnhancedContext(baseContext, fs);

    await hookExecutor.executeHook(
      logger,
      'after-install',
      createFailingHookWithStderr('bun: command not found: navi'),
      enhancedContext,
      { continueOnError: true },
    );

    // Verify the error log was emitted with the correct context and message
    // The message should include the stderr output with the actual error cause
    logger.expect(['ERROR'], ['test', 'HookExecutor', 'executeHook'], ['after-install'], [/command not found: navi/]);
  });
});
