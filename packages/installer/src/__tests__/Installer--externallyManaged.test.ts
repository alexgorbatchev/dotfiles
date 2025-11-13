import { beforeEach, describe, expect, it } from 'bun:test';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import { createInstallerTestSetup, type InstallerTestSetup } from './installer-test-helpers';

describe('Installer - externally managed plugins', () => {
  let setup: InstallerTestSetup;

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
    setup.pluginRegistry.get = ((method: string) => {
      const plugin = originalGet(method);
      if (method === 'github-release' && plugin) {
        return {
          ...plugin,
          externallyManaged: true,
        };
      }
      return plugin;
    }) as typeof setup.pluginRegistry.get;

    // Mock the install method to return external binary paths
    const originalInstall = setup.pluginRegistry.install.bind(setup.pluginRegistry);
    setup.pluginRegistry.install = (async (method, toolName, toolConfig, context, options) => {
      // Call original install but override the result
      await originalInstall(method, toolName, toolConfig, context, options);
      return {
        success: true,
        binaryPaths: [externalBinaryPath],
        version: '1.0.0',
        metadata: {
          method: 'github-release',
        },
      };
    }) as typeof setup.pluginRegistry.install;

    const toolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
      },
    };

    // @ts-expect-error - Modified plugin registry for testing
    await setup.installer.install('test-tool', toolConfig);

    // Verify symlink was created
    const symlinkPath = `${setup.testDirs.paths.binariesDir}/test-tool/test-tool`;
    const symlinkExists = await setup.fs.exists(symlinkPath);
    expect(symlinkExists).toBe(true);

    // Verify it's actually a symlink pointing to the external binary
    const stats = await setup.fs.lstat(symlinkPath);
    expect(stats.isSymbolicLink()).toBe(true);

    const linkTarget = await setup.fs.readlink(symlinkPath);
    expect(linkTarget).toBe(externalBinaryPath);
  });

  it('should create timestamped directories for non-externally-managed plugins', async () => {
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

    // Verify that ensureDir WAS called with a timestamped directory
    const ensureDirCalls = setup.fileSystemMocks.ensureDir.mock.calls;
    const timestampedDirCalls = ensureDirCalls.filter((call: string[]) => {
      const firstArg = call[0];
      return firstArg?.includes('test-tool') && /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/.test(firstArg);
    });

    expect(timestampedDirCalls.length).toBeGreaterThan(0);
  });
});
