import type { InstallHookContext, ToolConfig } from '@dotfiles/core';
import { MemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMock$ } from '@dotfiles/testing-helpers';

/**
 * Helper function to create a proper InstallHookContext for tests.
 * This creates a context that extends IBaseToolContext with all required properties.
 *
 * @returns An object containing the context and logger for test usage
 */
export function createTestInstallHookContext(
  overrides: Partial<InstallHookContext> = {},
  testLogger?: TestLogger
): { context: InstallHookContext; logger: TestLogger } {
  const logger = testLogger || new TestLogger();

  const mockProjectConfig = {
    configFilePath: '/home/user/.dotfiles/config.yaml',
    configFileDir: '/home/user/.dotfiles',
    paths: {
      homeDir: '/home/user',
      dotfilesDir: '/home/user/.dotfiles',
      generatedDir: '/home/user/.dotfiles/.generated',
      targetDir: '/usr/local/bin',
      toolConfigsDir: '/home/user/.dotfiles/configs/tools',
      shellScriptsDir: '/home/user/.dotfiles/.generated/shell-scripts',
      binariesDir: '/home/user/.dotfiles/.generated/binaries',
    },
    system: { sudoPrompt: 'Password:' },
    logging: { level: 'info' as const, debug: 'false' },
    updates: { checkOnRun: true, checkInterval: 86400 },
    completions: { enabled: true },
    hooks: { enabled: true },
    github: {
      token: '',
      host: 'api.github.com',
      userAgent: 'test-agent',
      cache: { enabled: true, ttl: 3600 },
    },
    cargo: {
      cratesIo: {
        host: 'https://crates.io',
        cache: { enabled: true, ttl: 3600 },
        token: '',
        userAgent: 'dotfiles-generator',
      },
      githubRaw: {
        host: 'https://raw.githubusercontent.com',
        cache: { enabled: true, ttl: 3600 },
        token: '',
        userAgent: 'dotfiles-generator',
      },
      githubRelease: {
        host: 'https://github.com',
        cache: { enabled: true, ttl: 3600 },
        token: '',
        userAgent: 'dotfiles-generator',
      },
      userAgent: 'test-agent',
    },
    downloader: {
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
      cache: { enabled: true, ttl: 3600 },
    },
    features: {
      catalog: {
        generate: true,
        filePath: `\${paths.dotfilesDir}`,
      },
    },
    userConfigPath: '/home/user/.dotfiles/config.yaml',
    platform: [],
  };

  // Create the base context with all IBaseToolContext properties
  const baseContext: InstallHookContext = {
    // IBaseToolContext properties
    toolName: 'test-tool',
    toolDir: '/test/binaries/test-tool',
    getToolDir: (toolName: string) => `/test/binaries/${toolName}`,
    homeDir: mockProjectConfig.paths.homeDir,
    binDir: mockProjectConfig.paths.binariesDir,
    shellScriptsDir: mockProjectConfig.paths.shellScriptsDir,
    dotfilesDir: mockProjectConfig.paths.dotfilesDir,
    generatedDir: mockProjectConfig.paths.generatedDir,
    projectConfig: mockProjectConfig,

    // InstallHookContext specific properties
    installDir: '/test/install/dir',
    systemInfo: {
      platform: 'darwin',
      arch: 'x64',
      homeDir: '/home/user',
    },
    $: createMock$(),
    toolConfig: {} as ToolConfig,
    timestamp: '2025-01-01-00-00-00',
    fileSystem: new MemFileSystem({}),
  };

  return {
    context: {
      ...baseContext,
      ...overrides,
    },
    logger,
  };
}
