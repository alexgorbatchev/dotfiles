import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  createTestContext,
  type InstallerTestSetup,
  MOCK_GITHUB_RELEASE_WITH_VARIANTS,
  MOCK_TOOL_NAME,
  MOCK_TOOL_REPO,
  setupFileSystemMocks,
} from './installer-test-helpers';

describe('Installer - Variant-based Asset Selection', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    setupFileSystemMocks(setup);
  });

  describe('Multiple variant disambiguation (matching zinit behavior)', () => {
    it('should prefer musl variant for Linux when both musl and gnu are available', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_VARIANTS);

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
        systemInfo: { platform: 'linux', arch: 'x86_64', homeDir: setup.testDirs.paths.homeDir },
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);

      // Should select musl variant (first in Linux variant patterns: ['musl', 'gnu', 'unknown-linux'])
      expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-x86_64-musl.tar.gz',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-x86_64-musl.tar.gz'),
        })
      );
    });

    it('should accept gnu variant if musl is not available', async () => {
      const releaseWithOnlyGnu = {
        ...MOCK_GITHUB_RELEASE_WITH_VARIANTS,
        assets: MOCK_GITHUB_RELEASE_WITH_VARIANTS.assets.filter((a) => !a.name.includes('musl')),
      };

      setup.mocks.getLatestRelease.mockResolvedValue(releaseWithOnlyGnu);

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
        systemInfo: { platform: 'linux', arch: 'x86_64', homeDir: setup.testDirs.paths.homeDir },
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);

      expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-x86_64-gnu.tar.gz',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-x86_64-gnu.tar.gz'),
        })
      );
    });

    it('should work with assets that have no variant info (most common case)', async () => {
      const releaseWithNoVariant = {
        ...MOCK_GITHUB_RELEASE_WITH_VARIANTS,
        assets: [
          {
            name: 'test-tool-linux-x86_64.tar.gz',
            browser_download_url: 'https://example.com/test-tool-linux-x86_64.tar.gz',
            size: 1000,
            content_type: 'application/gzip',
            state: 'uploaded' as const,
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
      };

      setup.mocks.getLatestRelease.mockResolvedValue(releaseWithNoVariant);

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
        systemInfo: { platform: 'linux', arch: 'x86_64', homeDir: setup.testDirs.paths.homeDir },
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);

      // Should successfully select the asset even though it has no variant info
      expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-x86_64.tar.gz',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-x86_64.tar.gz'),
        })
      );
    });
  });
});
