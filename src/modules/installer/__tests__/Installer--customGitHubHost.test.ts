import { type YamlConfig } from '@modules/config';
import { createYamlConfigFromObject, getDefaultConfigPath } from '@modules/config-loader';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';
import type { IDownloader } from '@modules/downloader';
import type { IArchiveExtractor } from '@modules/extractor';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import { createMemFileSystem, createTestDirectories, type TestDirectories } from '@testing-helpers';
import type { ExtractResult, GitHubRelease, ToolConfig } from '@types';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Installer } from '../Installer';

describe('Installer with custom GitHub host', () => {
  // Mock data
  const MOCK_TOOL_NAME = 'test-tool';
  const MOCK_REPO = 'owner/repo';
  const MOCK_VERSION = '1.0.0';
  const CUSTOM_GITHUB_HOST = 'https://github.example.com';

  // Mock functions and objects
  let mockFileSystem: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockAppConfig: YamlConfig;
  let installer: Installer;
  let testDirs: TestDirectories;

  // Mock function references
  let mockDownload: ReturnType<typeof mock>;
  let mockGetLatestRelease: ReturnType<typeof mock>;
  let mockExtract: ReturnType<typeof mock>;

  beforeEach(async () => {
    testDirs = createTestDirectories({ testName: 'installer-custom-host-tests' });
    // Setup mock file system
    const { fs: fsInstance } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });
    mockFileSystem = fsInstance;

    // Setup mock downloader
    mockDownload = mock(() => Promise.resolve());
    mockDownloader = {
      download: mockDownload,
    };

    // Setup mock GitHub API client with a successful response
    mockGetLatestRelease = mock(() =>
      Promise.resolve({
        id: 123,
        tag_name: MOCK_VERSION,
        name: `Release ${MOCK_VERSION}`,
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
      detectFormat: mock(async () => 'tar.gz' as const), // Added 'as const'
      isSupported: mock(() => true),
    };

    // Setup mock AppConfig with custom GitHub host
    mockAppConfig = await createYamlConfigFromObject(
      mockFileSystem,
      {
        paths: {
          dotfilesDir: testDirs.dotfilesDir,
          generatedDir: testDirs.generatedDir,
        },
        github: {
          host: CUSTOM_GITHUB_HOST,
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
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: MOCK_VERSION,
      installationMethod: 'github-release',
      installParams: {
        repo: MOCK_REPO,
        version: 'latest',
        assetPattern: 'test-tool-linux-amd64',
      },
    };

    // Call the install method
    await installer.install(MOCK_TOOL_NAME, toolConfig);

    // Verify that the download URL was modified to use the custom host
    expect(mockDownload).toHaveBeenCalledWith(
      expect.stringContaining(new URL(CUSTOM_GITHUB_HOST).host),
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
        tag_name: MOCK_VERSION,
        name: `Release ${MOCK_VERSION}`,
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
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: MOCK_VERSION,
      installationMethod: 'github-release',
      installParams: {
        repo: MOCK_REPO,
        version: 'latest',
        assetPattern: 'test-tool-linux-amd64',
      },
    };

    await installerWithDifferentUrl.install(MOCK_TOOL_NAME, toolConfig);

    // Verify that the download URL was used as-is (not modified)
    expect(mockDownload).toHaveBeenCalledWith(
      'https://some-other-site.com/downloads/test-tool-linux-amd64', // Expectation updated
      expect.anything()
    );
  });
});
