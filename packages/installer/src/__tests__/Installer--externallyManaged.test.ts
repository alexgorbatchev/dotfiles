import type { AggregateInstallResult, IInstallerPlugin } from '@dotfiles/core';
import type { GithubReleaseToolConfig, IGitHubReleaseInstallMetadata } from '@dotfiles/installer-github';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createInstallerTestSetup, type IInstallerTestSetup } from './installer-test-helpers';

describe('Installer - externally managed plugins', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should create symlinks for externally-managed plugins', async () => {
    // Mock the brew plugin to return an external binary path
    const externalBinaryPath = '/opt/homebrew/bin/test-tool';

    // Create the external binary in our mock filesystem
    await setup.fs.ensureDir('/opt/homebrew/bin');
    await setup.fs.writeFile(externalBinaryPath, '#!/bin/bash\necho "test"');
    await setup.fs.chmod(externalBinaryPath, 0o755);

    // Mock the registry.get to return a plugin with externallyManaged = true
    const originalGet = setup.pluginRegistry.get.bind(setup.pluginRegistry);
    setup.pluginRegistry.get = ((method) => {
      const plugin = originalGet(method);
      if (method === 'github-release' && plugin) {
        const result: IInstallerPlugin = {
          ...plugin,
          externallyManaged: true,
        };
        return result;
      }
      return plugin;
    }) as typeof setup.pluginRegistry.get;

    // Mock the install method to return external binary paths
    const originalInstall = setup.pluginRegistry.install.bind(setup.pluginRegistry);
    setup.pluginRegistry.install = (async (method, toolName, toolConfig, context, options) => {
      // Call original install but override the result
      await originalInstall(method, toolName, toolConfig, context, options);

      const metadata: IGitHubReleaseInstallMetadata = {
        method: 'github-release',
        releaseUrl: 'https://example.com/releases/v1.0.0',
        publishedAt: '2025-01-01T00:00:00Z',
        releaseName: 'Release v1.0.0',
      };
      const result: AggregateInstallResult = {
        success: true,
        binaryPaths: [externalBinaryPath],
        version: '1.0.0',
        originalTag: 'v1.0.0',
        metadata,
      };
      return result;
    }) as typeof setup.pluginRegistry.install;

    const toolConfig: GithubReleaseToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
      },
    };

    await setup.installer.install('test-tool', toolConfig);

    // Verify stable entrypoint exists via {toolDir}/current/{binary}
    const symlinkPath = `${setup.testDirs.paths.binariesDir}/test-tool/current/test-tool`;
    const symlinkExists = await setup.fs.exists(symlinkPath);
    expect(symlinkExists).toBe(true);

    // Verify it's actually a symlink pointing to the external binary
    const stats = await setup.fs.lstat(symlinkPath);
    expect(stats.isSymbolicLink()).toBe(true);

    const linkTarget = await setup.fs.readlink(symlinkPath);
    expect(linkTarget).toBe(externalBinaryPath);
  });

  it('should create a staging UUID directory for non-externally-managed plugins', async () => {
    const toolConfig: GithubReleaseToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
      },
    };

    await setup.installer.install('test-tool', toolConfig);

    // Verify that ensureDir WAS called with a per-attempt staging directory (UUID)
    const ensureDirCalls = setup.fileSystemMocks.ensureDir.mock.calls;
    const timestampedDirCalls = ensureDirCalls.filter((call) => {
      const firstArg: string | undefined = call[0];
      return Boolean(
        firstArg?.includes('test-tool') &&
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(firstArg),
      );
    });

    expect(timestampedDirCalls.length).toBeGreaterThan(0);
  });
});
