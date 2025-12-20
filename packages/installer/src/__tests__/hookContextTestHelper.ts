import type { IInstallContext, ProjectConfig, ToolConfig } from '@dotfiles/core';
import { projectConfigSchema } from '@dotfiles/core';
import { MemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMock$ } from '@dotfiles/testing-helpers';
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
  testLogger?: TestLogger
): ICreateTestInstallHookContextResult {
  const logger = testLogger || new TestLogger();

  const mockProjectConfigFilePath = '/home/user/.dotfiles/config.yaml';
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

  const configuredShell = createConfiguredShell(createMock$(), {});

  const baseContext: IInstallContext = {
    toolName: 'test-tool',
    projectConfig: mockProjectConfig,

    // InstallContext specific properties
    installDir: '/test/install/dir',
    systemInfo: {
      platform: 'darwin',
      arch: 'x64',
      homeDir: '/home/user',
    },
    $: configuredShell,
    toolConfig,
    timestamp: '2025-01-01-00-00-00',
    fileSystem: new MemFileSystem({}),
  };

  const context: IInstallContext = {
    ...baseContext,
    ...overrides,
  };

  const result: ICreateTestInstallHookContextResult = { context, logger };
  return result;
}
