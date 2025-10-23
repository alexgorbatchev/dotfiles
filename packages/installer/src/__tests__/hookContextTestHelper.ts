import { TestLogger } from '@dotfiles/logger';
import type { InstallHookContext } from '@dotfiles/schemas';
import { createMock$ } from '@dotfiles/testing-helpers';

/**
 * Helper function to create a proper InstallHookContext for tests.
 * This creates a context that extends BaseToolContext with all required properties.
 */
export function createTestInstallHookContext(
  overrides: Partial<InstallHookContext> = {},
  testLogger?: TestLogger
): InstallHookContext {
  const logger = testLogger || new TestLogger();

  const mockAppConfig = {
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
    userConfigPath: '/home/user/.dotfiles/config.yaml',
    platform: [],
  };

  // Create the base context with all BaseToolContext properties
  const baseContext: InstallHookContext = {
    // BaseToolContext properties
    toolName: 'test-tool',
    toolDir: '/test/binaries/test-tool',
    getToolDir: (toolName: string) => `/test/binaries/${toolName}`,
    homeDir: mockAppConfig.paths.homeDir,
    binDir: mockAppConfig.paths.binariesDir,
    shellScriptsDir: mockAppConfig.paths.shellScriptsDir,
    dotfilesDir: mockAppConfig.paths.dotfilesDir,
    generatedDir: mockAppConfig.paths.generatedDir,
    appConfig: mockAppConfig,
    logger: logger.getSubLogger({ name: 'test-tool' }),

    // InstallHookContext specific properties
    installDir: '/test/install/dir',
    systemInfo: {
      platform: 'darwin',
      arch: 'x64',
      homeDir: '/home/user',
    },
    $: createMock$(),
  };

  return {
    ...baseContext,
    ...overrides,
  };
}
