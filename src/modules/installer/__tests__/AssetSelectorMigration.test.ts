import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { AssetSelectionContext, AssetSelector } from '@types';
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  createTestContext,
  type InstallerTestSetup,
  MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS,
  MOCK_TOOL_NAME,
  MOCK_TOOL_REPO,
  MOCK_TOOL_VERSION,
  setupFileSystemMocks,
} from './installer-test-helpers';
import { installerLogMessages } from '../log-messages';

describe('Installer - Asset Selector Context API', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    setupFileSystemMocks(setup);
  });

  describe('Modern Asset Selector Support', () => {
    it('should work with modern asset selector signature', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);

      const modernAssetSelector: AssetSelector = (context: AssetSelectionContext) => {
        // Modern signature: (context) => asset
        expect(context.assets).toBeDefined();
        expect(context.systemInfo).toBeDefined();
        expect(context.release).toBeDefined();
        expect(context.toolConfig).toBeDefined();
        expect(context.toolName).toBe(MOCK_TOOL_NAME);
        expect(context.logger).toBeDefined();
        expect(context.appConfig).toBeDefined();

        // Test that we can access all context properties
        expect(context.systemInfo.platform).toBe('linux');
        expect(context.systemInfo.arch).toBe('x64');
        expect(context.release.tag_name).toBe(MOCK_TOOL_VERSION);

        return context.assets.find((asset) =>
          asset.name.includes(context.systemInfo.platform === 'linux' ? 'linux' : 'other')
        );
      };

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetSelector: modernAssetSelector,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);
      expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-amd64',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-amd64'),
        })
      );
    });

    it('should provide assetPattern in context when specified', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);

      const modernAssetSelector: AssetSelector = (context: AssetSelectionContext) => {
        expect(context.assetPattern).toBe('*linux*');
        return context.assets.find((asset) => asset.name.includes('linux'));
      };

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetPattern: '*linux*',
          assetSelector: modernAssetSelector,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);
    });

    it('should return undefined with modern asset selector when no match found', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);

      const modernAssetSelector: AssetSelector = () => undefined;

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetSelector: modernAssetSelector,
        },
      });

      const context = createTestContext(setup);

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No suitable asset found');
      expect(result.error).toContain('using a custom assetSelector function');
    });

    it('should allow modern asset selector to use logger', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);

      const modernAssetSelector: AssetSelector = (context: AssetSelectionContext) => {
        // Test that logger is available and functional
  context.logger.debug(installerLogMessages.gitHubRelease.assetSelectorCustom());
        return context.assets.find((asset) => asset.name.includes('linux'));
      };

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetSelector: modernAssetSelector,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);
      // Verify that the logger was used (check that no errors were thrown)
      expect(setup.logger.logs.length).toBeGreaterThan(0);
    });

    it('should provide access to all BaseToolContext properties', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);

      const modernAssetSelector: AssetSelector = (context: AssetSelectionContext) => {
        // Test BaseToolContext properties
        expect(context.toolName).toBe(MOCK_TOOL_NAME);
        expect(context.toolDir).toBeDefined();
        expect(context.getToolDir).toBeDefined();
        expect(context.homeDir).toBeDefined();
        expect(context.binDir).toBeDefined();
        expect(context.shellScriptsDir).toBeDefined();
        expect(context.dotfilesDir).toBeDefined();
        expect(context.generatedDir).toBeDefined();
        expect(context.appConfig).toBeDefined();
        expect(context.logger).toBeDefined();

        return context.assets.find((asset) => asset.name.includes('linux'));
      };

      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetSelector: modernAssetSelector,
        },
      });

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(true);
    });
  });
});
