import { beforeEach, describe, expect, it, type Mock, mock } from 'bun:test';
import path from 'node:path';
import type { GitHubRelease, ToolConfig } from '@dotfiles/schemas';
import { createMockYamlConfig } from '@dotfiles/testing-helpers';
import { Installer } from '../Installer';
import { createInstallerTestSetup, type InstallerTestSetup } from './installer-test-helpers';

describe('Installer with custom GitHub host', () => {
  const toolName = 'test-tool';
  const toolVersion = '1.0.0';
  const githubRepo = 'owner/repo';
  const githubHost = 'https://github.example.com';

  let setup: InstallerTestSetup;
  let installer: Installer;
  let mockDownload: Mock<() => Promise<Buffer | undefined>>;
  let mockGetLatestRelease: Mock<() => Promise<unknown>>;

  beforeEach(async () => {
    // Use the standard setup as a base
    setup = await createInstallerTestSetup();

    // Create custom app config with GitHub host
    const customAppConfig = await createMockYamlConfig({
      config: {
        paths: setup.testDirs.paths,
        github: {
          host: githubHost,
        },
      },
      filePath: path.join(setup.testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: setup.fs,
      logger: setup.logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
      env: {},
    });

    // Setup custom GitHub API client mock with relative URL
    mockGetLatestRelease = mock(() =>
      Promise.resolve({
        id: 123,
        tag_name: toolVersion,
        name: `Release ${toolVersion}`,
        draft: false,
        prerelease: false,
        created_at: '2023-01-01T00:00:00Z',
        published_at: '2023-01-01T00:00:00Z',
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/repos/owner/repo/releases/assets/123/test-tool-linux-amd64', // Relative path
            size: 1000,
            content_type: 'application/octet-stream',
            state: 'uploaded',
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        html_url: 'https://github.com/owner/repo/releases/tag/1.0.0',
      })
    );

    // Override the GitHub API client mock
    setup.mockGitHubApiClient.getLatestRelease = mockGetLatestRelease as (
      owner: string,
      repo: string
    ) => Promise<GitHubRelease | null>;

    // Get reference to download mock for easier access
    mockDownload = setup.mocks.download;

    // Create installer with custom config
    installer = new Installer(
      setup.logger,
      setup.fs,
      setup.mockDownloader,
      setup.mockGitHubApiClient,
      setup.mockCargoClient,
      setup.mockArchiveExtractor,
      customAppConfig,
      setup.mockToolInstallationRegistry,
      { platform: 'darwin', arch: 'arm64', homeDir: setup.testDirs.paths.homeDir }
    );
  });

  it('should modify GitHub download URLs when using a custom GitHub host', async () => {
    // Create a tool config for testing
    const toolConfig: ToolConfig = {
      name: toolName,
      binaries: [toolName],
      version: toolVersion,
      installationMethod: 'github-release',
      installParams: {
        repo: githubRepo,
        version: 'latest',
        assetPattern: 'test-tool-linux-amd64',
      },
    };

    // Call the install method
    await installer.install(toolName, toolConfig);

    // Verify that the download URL was modified to use the custom host
    expect(mockDownload).toHaveBeenCalledWith(expect.stringContaining(new URL(githubHost).host), expect.anything());

    // Verify that the original api.github.com was replaced
    expect(mockDownload).not.toHaveBeenCalledWith(expect.stringContaining('api.github.com'), expect.anything());
  });

  it('should handle URLs that do not contain api.github.com', async () => {
    // Setup a different mock GitHub API client with a different URL format
    const mockGetLatestReleaseWithDifferentUrl = mock(() =>
      Promise.resolve({
        id: 456,
        tag_name: toolVersion,
        name: `Release ${toolVersion}`,
        draft: false,
        prerelease: false,
        created_at: '2023-01-01T00:00:00Z',
        published_at: '2023-01-01T00:00:00Z',
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: 'https://some-other-site.com/downloads/test-tool-linux-amd64', // Changed to a non-GitHub URL
            size: 1000,
            content_type: 'application/octet-stream',
            state: 'uploaded',
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        html_url: 'https://github.com/owner/repo/releases/tag/1.0.0',
      } as GitHubRelease)
    );

    const mockGitHubApiClientWithDifferentUrl = {
      getLatestRelease: mockGetLatestReleaseWithDifferentUrl,
      getReleaseByTag: mock(() => Promise.resolve(null)),
      getAllReleases: mock(() => Promise.resolve([])),
      getReleaseByConstraint: mock(() => Promise.resolve(null)),
      getRateLimit: mock(() => Promise.resolve({ limit: 60, remaining: 59, reset: 0, used: 1, resource: 'core' })),
    };

    // Create custom app config with GitHub host
    const customAppConfig = await createMockYamlConfig({
      config: {
        paths: setup.testDirs.paths,
        github: {
          host: githubHost,
        },
      },
      filePath: path.join(setup.testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: setup.fs,
      logger: setup.logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
      env: {},
    });

    // Create a new installer with the different mock
    const installerWithDifferentUrl = new Installer(
      setup.logger,
      setup.fs,
      setup.mockDownloader,
      mockGitHubApiClientWithDifferentUrl,
      setup.mockCargoClient,
      setup.mockArchiveExtractor,
      customAppConfig,
      setup.mockToolInstallationRegistry,
      { platform: 'darwin', arch: 'arm64', homeDir: setup.testDirs.paths.homeDir }
    );

    const toolConfig: ToolConfig = {
      name: toolName,
      binaries: [toolName],
      version: toolVersion,
      installationMethod: 'github-release',
      installParams: {
        repo: githubRepo,
        version: 'latest',
        assetPattern: 'test-tool-linux-amd64',
      },
    };

    await installerWithDifferentUrl.install(toolName, toolConfig);

    // Verify that the download URL was used as-is (not modified)
    expect(mockDownload).toHaveBeenCalledWith(
      'https://some-other-site.com/downloads/test-tool-linux-amd64', // Expectation updated
      expect.anything()
    );
  });
});
