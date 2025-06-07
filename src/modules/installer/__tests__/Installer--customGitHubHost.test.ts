/**
 * @file generator/src/modules/installer/__tests__/Installer--customGitHubHost.test.ts
 * @description Tests for the Installer's handling of custom GitHub host.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
// Removed unused import: path
import { Installer } from '../Installer';
import type { IFileSystem } from '../../file-system/IFileSystem';
import type { IDownloader } from '../../downloader/IDownloader';
import type { IGitHubApiClient } from '../../github-client/IGitHubApiClient';
import type { IArchiveExtractor } from '../../extractor/IArchiveExtractor'; // Added
import type { AppConfig, ToolConfig, GitHubRelease, ExtractResult } from '../../../types';
import { createMockAppConfig } from '../../../testing-helpers/appConfigTestHelpers';

describe('Installer with custom GitHub host', () => {
  // Mock data
  const MOCK_BINARIES_DIR = '/test/binaries';
  const MOCK_BIN_DIR = '/test/bin';
  const MOCK_TOOL_NAME = 'test-tool';
  const MOCK_REPO = 'owner/repo';
  const MOCK_VERSION = '1.0.0';
  const CUSTOM_GITHUB_HOST = 'https://github.example.com';

  // Mock functions and objects
  let mockFileSystem: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor; // Added
  let mockAppConfig: AppConfig;
  let installer: Installer;

  // Mock function references
  let mockEnsureDir: ReturnType<typeof mock>;
  let mockChmod: ReturnType<typeof mock>;
  let mockExists: ReturnType<typeof mock>;
  let mockCopyFile: ReturnType<typeof mock>;
  let mockSymlink: ReturnType<typeof mock>;
  let mockRm: ReturnType<typeof mock>;
  let mockDownload: ReturnType<typeof mock>;
  let mockGetLatestRelease: ReturnType<typeof mock>;
  let mockExtract: ReturnType<typeof mock>; // Added

  beforeEach(() => {
    // Setup mock file system
    mockEnsureDir = mock(() => Promise.resolve());
    mockChmod = mock(() => Promise.resolve());
    mockExists = mock(() => Promise.resolve(false));
    mockCopyFile = mock(() => Promise.resolve());
    mockSymlink = mock(() => Promise.resolve());
    mockRm = mock(() => Promise.resolve());

    mockFileSystem = {
      ensureDir: mockEnsureDir,
      chmod: mockChmod,
      exists: mockExists,
      copyFile: mockCopyFile,
      symlink: mockSymlink,
      rm: mockRm,
      readFile: mock(() => Promise.resolve('')),
      writeFile: mock(() => Promise.resolve()),
      mkdir: mock(() => Promise.resolve()),
      readdir: mock(() => Promise.resolve([])),
      stat: mock(async () => ({ isDirectory: () => true }) as any),
      readlink: mock(async () => ''),
      rename: mock(async () => {}),
      rmdir: mock(async () => {}),
    };

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
            browser_download_url:
              'https://api.github.com/repos/owner/repo/releases/assets/123/test-tool-linux-amd64',
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
    mockAppConfig = createMockAppConfig({
      binariesDir: MOCK_BINARIES_DIR,
      binDir: MOCK_BIN_DIR,
      githubHost: CUSTOM_GITHUB_HOST,
    });

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
      mockArchiveExtractor, // Added
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
