import { type YamlConfig } from '@modules/config';
import { createYamlConfigFromObject } from '@modules/config-loader';
import type { IDownloader } from '@modules/downloader';
import type { IArchiveExtractor } from '@modules/extractor';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import { createMemFileSystem, createTestDirectories, type TestDirectories } from '@testing-helpers';
import type { ExtractResult, GitHubRelease, ToolConfig } from '@types';
import { beforeEach, describe, expect, it, mock, type Mock } from 'bun:test';
import { Installer } from '../Installer';

describe('Installer with custom GitHub host', () => {
  const toolName = 'test-tool';
  const toolVersion = '1.0.0';
  const githubRepo = 'owner/repo';
  const githubHost = 'https://github.example.com';

  let mockFileSystem: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockAppConfig: YamlConfig;
  let installer: Installer;
  let directories: TestDirectories;

  let mockDownload: Mock<any>;
  let mockGetLatestRelease: Mock<any>;
  let mockExtract: Mock<any>;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem();
    directories = await createTestDirectories(fs, { testName: 'installer-custom-host-tests' });
    mockFileSystem = fs;

    // Setup mock downloader
    mockDownload = mock(() => Promise.resolve());
    mockDownloader = {
      download: mockDownload,
    };

    // Setup mock GitHub API client with a successful response
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

    mockGitHubApiClient = {
      getLatestRelease: mockGetLatestRelease,
      getReleaseByTag: mock(() => Promise.resolve(null)),
      getAllReleases: mock(() => Promise.resolve([])),
      getReleaseByConstraint: mock(() => Promise.resolve(null)),
      getRateLimit: mock(() =>
        Promise.resolve({ limit: 60, remaining: 59, reset: 0, used: 1, resource: 'core' })
      ),
    };

    // Setup mock ArchiveExtractor
    mockExtract = mock(
      (): Promise<ExtractResult> =>
        Promise.resolve({
          extractedFiles: ['test-tool-linux-amd64'],
          executables: ['test-tool-linux-amd64'],
        })
    );
    mockArchiveExtractor = {
      extract: mockExtract,
      detectFormat: mock(async () => 'tar.gz' as const),
      isSupported: mock(() => true),
    };

    // Setup mock AppConfig with custom GitHub host
    mockAppConfig = await createYamlConfigFromObject(
      mockFileSystem,
      {
        paths: {
          ...directories.paths,
        },
        github: {
          host: githubHost,
        },
      },
      { platform: 'linux', arch: 'x64', release: 'test', homeDir: '/home/test' },
      {}
    );

    // Create installer instance
    installer = new Installer(
      mockFileSystem,
      mockDownloader,
      mockGitHubApiClient,
      mockArchiveExtractor,
      mockAppConfig
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
    expect(mockDownload).toHaveBeenCalledWith(
      expect.stringContaining(new URL(githubHost).host),
      expect.anything()
    );

    // Verify that the original api.github.com was replaced
    expect(mockDownload).not.toHaveBeenCalledWith(
      expect.stringContaining('api.github.com'),
      expect.anything()
    );
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
      getRateLimit: mock(() =>
        Promise.resolve({ limit: 60, remaining: 59, reset: 0, used: 1, resource: 'core' })
      ),
    };

    // Create a new installer with the different mock
    const installerWithDifferentUrl = new Installer(
      mockFileSystem,
      mockDownloader,
      mockGitHubApiClientWithDifferentUrl,
      mockArchiveExtractor,
      mockAppConfig
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
