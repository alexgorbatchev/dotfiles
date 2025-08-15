import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { createYamlConfigFromObject } from '@modules/config-loader';
import { Installer } from '../Installer';
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  createMockToolInstallationRegistry,
  createTestContext,
  type InstallerTestSetup,
  MOCK_GITHUB_RELEASE,
  MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS,
  MOCK_TOOL_NAME,
  MOCK_TOOL_REPO,
  MOCK_TOOL_VERSION,
  setupFileSystemMocks,
} from './installer-test-helpers';

describe('Installer - installFromGitHubRelease', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should download and install from GitHub release', async () => {
    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: MOCK_TOOL_REPO,
        version: 'latest', // Explicitly set to use latest version
        assetPattern: 'test-tool-linux-amd64', // Explicitly match the mock asset
      },
    });
    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, '2024-08-13-16-45-23'),
    });

    // Mock filesystem operations to avoid errors on non-existent files from mock downloader
    setupFileSystemMocks(setup);

    const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

    expect(setup.mocks.getLatestRelease).toHaveBeenCalledWith('owner', 'repo');
    expect(setup.mocks.downloader.download).toHaveBeenCalledWith(
      'https://example.com/test-tool-linux-amd64',
      expect.objectContaining({
        destinationPath: expect.stringContaining('test-tool-linux-amd64'),
      })
    );
    if (!result.success) {
      throw new Error(`GitHub release test failed: ${result.error}`);
    }
    expect(result.success).toBe(true);
  });

  it('should handle invalid repository format', async () => {
    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: 'invalid-repo',
      },
    });
    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid GitHub repository format');
  });

  it('should handle missing asset', async () => {
    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: MOCK_TOOL_REPO,
        assetPattern: 'non-existent-pattern',
      },
    });
    const context = createTestContext(setup, {
      installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    });

    const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      `No suitable asset found in release "${MOCK_TOOL_VERSION}" for asset pattern: "non-existent-pattern" for linux/x64.`
    );
    expect(result.error).toContain(`Available assets in release "${MOCK_TOOL_VERSION}":`);
    expect(result.error).toContain('- test-tool-linux-amd64');
  });

  describe('URL Construction', () => {
    it('should use absolute browser_download_url directly', async () => {
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      });
      setup.mocks.getLatestRelease.mockResolvedValue({
        ...MOCK_GITHUB_RELEASE,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: 'https://absolute.example.com/download/tool.zip',
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });
      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
      });

      await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(setup.mocks.download).toHaveBeenCalledWith(
        'https://absolute.example.com/download/tool.zip',
        expect.anything()
      );
    });

    it('should construct URL with default github.com for relative browser_download_url', async () => {
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      });
      setup.mocks.getLatestRelease.mockResolvedValue({
        ...MOCK_GITHUB_RELEASE,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/owner/repo/releases/download/v1.0.0/tool.zip', // Relative URL
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      // Ensure appConfig.github.host is undefined or not api.github.com
      const testAppConfig = await createYamlConfigFromObject(
        setup.logger,
        setup.fs,
        {
          paths: {
            ...setup.testDirs.paths,
          },
          github: { host: undefined },
        },
        { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
        {}
      );
      const tempInstaller = new Installer(
        setup.logger,
        setup.fs,
        setup.mockDownloader,
        setup.mockGitHubApiClient,
        setup.mockArchiveExtractor,
        testAppConfig,
        createMockToolInstallationRegistry(),
        { platform: 'darwin', arch: 'arm64', homeDir: setup.testDirs.paths.homeDir }
      );
      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
        appConfig: setup.mockAppConfig,
      });

      await tempInstaller.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(setup.mocks.download).toHaveBeenCalledWith(
        'https://github.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });

    it('should construct URL with custom githubHost for relative browser_download_url', async () => {
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      });
      setup.mocks.getLatestRelease.mockResolvedValue({
        ...MOCK_GITHUB_RELEASE,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/owner/repo/releases/download/v1.0.0/tool.zip',
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      const testAppConfig = await createYamlConfigFromObject(
        setup.logger,
        setup.fs,
        {
          paths: {
            ...setup.testDirs.paths,
          },
          github: { host: 'github.my-company.com' },
        },
        { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
        {}
      );
      const tempInstaller = new Installer(
        setup.logger,
        setup.fs,
        setup.mockDownloader,
        setup.mockGitHubApiClient,
        setup.mockArchiveExtractor,
        testAppConfig,
        createMockToolInstallationRegistry(),
        { platform: 'darwin', arch: 'arm64', homeDir: setup.testDirs.paths.homeDir }
      );
      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
        appConfig: setup.mockAppConfig,
      });

      await tempInstaller.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(setup.mocks.download).toHaveBeenCalledWith(
        'https://github.my-company.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });

    it('should use default GitHub host if custom githubHost is api.github.com for relative URL', async () => {
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      });
      setup.mocks.getLatestRelease.mockResolvedValue({
        ...MOCK_GITHUB_RELEASE,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/owner/repo/releases/download/v1.0.0/tool.zip',
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      const testAppConfig = await createYamlConfigFromObject(
        setup.logger,
        setup.fs,
        {
          paths: {
            ...setup.testDirs.paths,
          },
          github: { host: 'api.github.com' },
        },
        { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
        {}
      ); // API host
      const tempInstaller = new Installer(
        setup.logger,
        setup.fs,
        setup.mockDownloader,
        setup.mockGitHubApiClient,
        setup.mockArchiveExtractor,
        testAppConfig,
        createMockToolInstallationRegistry(),
        { platform: 'darwin', arch: 'arm64', homeDir: setup.testDirs.paths.homeDir }
      );
      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
        appConfig: setup.mockAppConfig,
      });

      await tempInstaller.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      // Should default to github.com for asset downloads, not api.github.com
      expect(setup.mocks.download).toHaveBeenCalledWith(
        'https://github.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });
  });

  describe('Enhanced Error Message', () => {
    it('should list available assets when no match found with assetPattern', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetPattern: 'non-existent-asset-pattern',
        },
      });
      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_TOOL_VERSION}" for asset pattern: "non-existent-asset-pattern" for linux/x64.`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_TOOL_VERSION}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
      expect(result.error).toContain('- test-tool-darwin-arm64.zip');
      expect(result.error).toContain('- test-tool-windows-x64.exe');
    });

    it('should list available assets when no match found with default platform/arch detection', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          // No assetPattern, no assetSelector, rely on platform/arch
        },
      });

      // Simulate a platform/arch for which no asset exists
      const systemInfo = {
        platform: 'sunos',
        arch: 'sparc',
        homeDir: '/home/test',
      };
      // @ts-ignore
      process.platform = systemInfo.platform;
      // @ts-ignore
      process.arch = systemInfo.arch;

      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
        systemInfo,
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_TOOL_VERSION}" for platform "sunos" and architecture "sparc".`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_TOOL_VERSION}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
    });

    it('should list available assets when assetSelector returns undefined', async () => {
      setup.mocks.getLatestRelease.mockResolvedValue(MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS);
      const toolConfig = createGithubReleaseToolConfig({
        installParams: {
          repo: MOCK_TOOL_REPO,
          assetSelector: () => undefined, // Selector that finds nothing
        },
      });
      const context = createTestContext(setup, {
        installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
      });

      const result = await setup.installer.installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_TOOL_VERSION}" using a custom assetSelector function for linux/x64.`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_TOOL_VERSION}":`);
      expect(result.error).toContain('- test-tool-darwin-arm64.zip');
    });
  });
});
