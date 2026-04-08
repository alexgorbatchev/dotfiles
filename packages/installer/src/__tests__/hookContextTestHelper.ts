import {
  Architecture,
  createToolLog,
  type IInstallContext,
  Platform,
  type ProjectConfig,
  projectConfigSchema,
  type ToolConfig,
} from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import { MemFileSystem, ResolvedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMock$ } from '@dotfiles/testing-helpers';
import { replaceInFile } from '@dotfiles/utils';
import { createConfiguredShell } from '../utils/createConfiguredShell';

interface ICreateTestInstallHookContextResult {
  context: IInstallContext;
  logger: TestLogger;
}

/**
 * Helper function to create a proper InstallContext for tests.
 * This creates a context that extends IBaseToolContext with all required properties.
 *
 * @returns An object containing the context and logger for test usage
 */
export function createTestInstallHookContext(
  overrides: Partial<IInstallContext> = {},
  testLogger?: TestLogger,
): ICreateTestInstallHookContextResult {
  const logger = testLogger || new TestLogger();

  const mockProjectConfigFilePath = '/home/user/.dotfiles/dotfiles.config.ts';
  const mockProjectConfigFileDir = '/home/user/.dotfiles';

  const parsedConfig = projectConfigSchema.parse({
    paths: {
      homeDir: '/home/user',
      dotfilesDir: '/home/user/.dotfiles',
      generatedDir: '/home/user/.dotfiles/.generated',
      targetDir: '/usr/local/bin',
      toolConfigsDir: '/home/user/.dotfiles/configs/tools',
      shellScriptsDir: '/home/user/.dotfiles/.generated/shell-scripts',
      binariesDir: '/home/user/.dotfiles/.generated/binaries',
    },
  });

  const mockProjectConfig: ProjectConfig = {
    ...parsedConfig,
    configFilePath: mockProjectConfigFilePath,
    configFileDir: mockProjectConfigFileDir,
  };

  const toolConfig: ToolConfig = {
    name: 'test-tool',
    version: 'latest',
    installationMethod: 'manual',
    installParams: { binaryPath: 'bin/test-tool' },
  };

  toolConfig.configFilePath = '/home/user/.dotfiles/configs/tools/test-tool/test-tool.tool.ts';

  const configuredShell = createConfiguredShell(createMock$(), {});

  const currentDir: string = `${mockProjectConfig.paths.binariesDir}/${toolConfig.name}/current`;
  const memFs = new MemFileSystem({});
  const resolvedFs: IResolvedFileSystem = new ResolvedFileSystem(memFs, '/home/user');

  const baseContext: IInstallContext = {
    toolName: 'test-tool',
    toolDir: '/home/user/.dotfiles/configs/tools/test-tool',
    currentDir,
    projectConfig: mockProjectConfig,

    // InstallContext specific properties
    stagingDir: '/test/staging/dir',
    systemInfo: {
      platform: Platform.MacOS,
      arch: Architecture.X86_64,
      homeDir: '/home/user',
      hostname: 'test-host',
    },
    $: configuredShell,
    toolConfig,
    timestamp: '2025-01-01-00-00-00',
    fileSystem: memFs,
    replaceInFile: (filePath, from, to, options) => replaceInFile(resolvedFs, filePath, from, to, options),
    resolve: () => {
      throw new Error('resolve not supported in test context');
    },
    log: createToolLog(logger, 'test-tool'),
  };

  const context: IInstallContext = {
    ...baseContext,
    ...overrides,
  };

  const result: ICreateTestInstallHookContextResult = { context, logger };
  return result;
}
