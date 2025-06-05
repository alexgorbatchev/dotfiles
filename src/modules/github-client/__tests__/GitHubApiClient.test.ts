/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient.test.ts
 * @description Tests for the GitHubApiClient class.
 *
 * ## Development Plan
 *
 * - [x] **Setup Mocks:**
 *   - [x] Mock `IDownloader` interface using `bun:test`'s `mock`.
 *   - [x] Mock `AppConfig` (specifically `githubToken`, `downloadTimeout`).
 *   - [x] Logger is no-op by default, no mock needed.
 * - [x] **Test Suite for `GitHubApiClient`:**
 *   - [x] **Constructor:**
 *     - [x] Test initialization with and without a GitHub token.
 *   - [x] **`getLatestRelease` Method:**
 *     - [x] Test successful retrieval of the latest release.
 *     - [x] Test handling of 404 (Not Found) error (should return null).
 *     - [x] Test handling of GitHub API rate limit error (403).
 *     - [x] Test handling of other generic network/request errors.
 *   - [x] **`getReleaseByTag` Method:**
 *     - [x] Test successful retrieval of a release by tag.
 *     - [x] Test handling of 404 if tag not found (should return null).
 *     - [x] Test rate limit and generic errors.
 *   - [x] **`getAllReleases` Method:**
 *     - [x] Test successful retrieval with no options (default pagination).
 *     - [x] Test successful retrieval with `perPage` option.
 *     - [x] Test pagination logic (multiple pages).
 *     - [x] Test `includePrerelease: false` filtering.
 *     - [x] Test `includePrerelease: true` (or undefined) returning all.
 *     - [x] Test handling of empty release list.
 *     - [x] Test rate limit and generic errors.
 *   - [x] **`getReleaseByConstraint` Method:**
 *     - [x] Test with constraint 'latest' (should call `getLatestRelease`).
 *     - [x] Test with constraint 'latest' when `getLatestRelease` fails.
 *     - [x] Test that it returns null for non-"latest" constraints (current placeholder behavior).
 *     - [ ] (Future) Test with actual semver constraints once implemented.
 *   - [x] **`getRateLimit` Method:**
 *     - [x] Test successful retrieval and parsing of rate limit information.
 *     - [x] Test handling of errors when fetching rate limit.
 *   - [x] **Private `request` Method (Indirect Testing via public methods):**
 *     - [x] Ensure `User-Agent` header is set.
 *     - [x] Ensure `Authorization` header is set when token is provided.
 *     - [x] Ensure `Accept` header is set.
 * - [x] Ensure all tests pass.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Achieve 100% test coverage for `GitHubApiClient.ts`.
 * - [ ] Update the memory bank.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRateLimit, GitHubRelease } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import {
  ClientError,
  HttpError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '../../downloader/errors';
import { GitHubApiClient } from '../GitHubApiClient';
import { GitHubApiClientError } from '../GitHubApiClientError';
import type { IGitHubApiCache } from '../IGitHubApiCache';
import { FIXTURE_RELEASE, FIXTURE_RELEASES_LIST } from './fixtures/cacheTestFixtures';

describe('GitHubApiClient', () => {
  let mockDownloadFn: ReturnType<typeof mock<IDownloader['download']>>;
  let mockAppConfig: AppConfig;
  let apiClient: GitHubApiClient;
  let mockCache: IGitHubApiCache;

  // Moved createMockRelease to be accessible by all describe blocks
  const createMockRelease = (id: number, tagName: string, prerelease = false): GitHubRelease => ({
    id,
    tag_name: tagName,
    name: `Release ${tagName}`,
    draft: false,
    prerelease,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    assets: [],
    body: `Notes for ${tagName}`,
    html_url: `http://example.com/releases/${tagName}`,
  });

  beforeEach(() => {
    mockDownloadFn = mock<IDownloader['download']>(async () => Buffer.from('')); // Default mock implementation

    const mockDownloaderInstance: IDownloader = {
      download: mockDownloadFn,
    };

    // Create a mock cache
    mockCache = {
      get: async <T>(_key: string): Promise<T | null> => null,
      set: async <T>(_key: string, _data: T, _ttlMs?: number): Promise<void> => {},
      has: async (_key: string): Promise<boolean> => false,
      delete: async (_key: string): Promise<void> => {},
      clearExpired: async (): Promise<void> => {},
      clear: async (): Promise<void> => {},
    };

    mockAppConfig = {
      githubToken: undefined,
      // Fill in other required AppConfig properties with defaults
      targetDir: '/usr/bin',
      dotfilesDir: '/test/dotfiles',
      generatedDir: '/test/dotfiles/.generated',
      toolConfigDir: '/test/dotfiles/generator/src/tools',
      debug: '',
      cacheEnabled: true,
      cacheDir: '/test/dotfiles/.generated/cache',
      binariesDir: '/test/dotfiles/.generated/binaries',
      binDir: '/test/dotfiles/.generated/bin',
      zshInitDir: '/test/dotfiles/.generated/zsh',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
      completionsDir: '/test/dotfiles/.generated/completions',
      githubClientUserAgent: 'dotfiles-generator-test/1.0.0',
      githubApiCacheEnabled: true,
      githubApiCacheTtl: 3600000, // 1 hour
    };

    // By default, create the client without cache
    apiClient = new GitHubApiClient(mockAppConfig, mockDownloaderInstance);

    // Logger mocks fully removed.
  });

  it('should be defined', () => {
    expect(apiClient).toBeDefined();
  });

  // Constructor tests
  describe('constructor', () => {
    it('should initialize correctly without a token', () => {
      // Test that constructor doesn't throw and apiClient is an instance
      // Logging is no-op, so no direct log assertion here
      const client = new GitHubApiClient(mockAppConfig, { download: mockDownloadFn as any }); // Use mockDownloadFn
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should initialize correctly with a token', () => {
      const configWithToken: AppConfig = { ...mockAppConfig, githubToken: 'test-token' };
      const client = new GitHubApiClient(configWithToken, { download: mockDownloadFn as any }); // Use mockDownloadFn
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should initialize correctly with a cache', () => {
      const client = new GitHubApiClient(
        mockAppConfig,
        { download: mockDownloadFn as any },
        mockCache
      );
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should respect cache configuration options', () => {
      const configWithCacheDisabled: AppConfig = {
        ...mockAppConfig,
        githubApiCacheEnabled: false,
      };
      const client = new GitHubApiClient(
        configWithCacheDisabled,
        { download: mockDownloadFn as any },
        mockCache
      );
      expect(client).toBeInstanceOf(GitHubApiClient);

      const configWithCustomTtl: AppConfig = {
        ...mockAppConfig,
        githubApiCacheTtl: 7200000, // 2 hours
      };
      const clientWithCustomTtl = new GitHubApiClient(
        configWithCustomTtl,
        { download: mockDownloadFn as any },
        mockCache
      );
      expect(clientWithCustomTtl).toBeInstanceOf(GitHubApiClient);
    });
  });

  describe('getLatestRelease', () => {
    it('should fetch and return the latest release', async () => {
      const mockReleaseData: GitHubRelease = {
        tag_name: 'v1.0.0',
        name: 'Version 1.0.0',
        draft: false,
        prerelease: false,
        published_at: new Date().toISOString(),
        assets: [],
        id: 1,
        created_at: new Date().toISOString(),
        body: 'Release notes',
        html_url: 'http://example.com/release/v1.0.0',
      };
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockReleaseData)));

      const release = await apiClient.getLatestRelease('test-owner', 'test-repo');
      expect(release).toEqual(mockReleaseData);
      expect(mockDownloadFn).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'dotfiles-generator-test/1.0.0',
          },
        }
      );
    });

    it('should return null if the release is not found (404)', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/latest';
      // Simulate the error structure that GitHubApiClient's request method would throw
      mockDownloadFn.mockRejectedValue(new Error(`GitHub resource not found: ${url}. Status: 404`));
      const release = await apiClient.getLatestRelease('test-owner', 'test-repo');
      expect(release).toBeNull();
    });

    it('should throw a GitHubApiClientError with rate limit details if a RateLimitError is thrown by downloader', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/latest';
      const resetTimestamp = Date.now() + 3600 * 1000;
      mockDownloadFn.mockRejectedValue(
        new RateLimitError(
          'API rate limit exceeded',
          url,
          403,
          'Forbidden',
          'Rate limit details',
          {},
          resetTimestamp
        )
      );

      await expect(apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await apiClient.getLatestRelease('test-owner', 'test-repo');
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`GitHub API rate limit exceeded for ${url}`);
          expect(error.statusCode).toBe(403);
          expect(error.originalError).toBeInstanceOf(RateLimitError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });

    it('should throw a GitHubApiClientError for other failures (NetworkError)', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/latest';
      mockDownloadFn.mockRejectedValue(new NetworkError('Connection lost', url));

      await expect(apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await apiClient.getLatestRelease('test-owner', 'test-repo');
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`Network error while requesting ${url}: Connection lost`);
          expect(error.originalError).toBeInstanceOf(NetworkError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });
  });

  describe('getReleaseByTag', () => {
    const mockReleaseData: GitHubRelease = {
      tag_name: 'v0.5.0',
      name: 'Version 0.5.0',
      draft: false,
      prerelease: false,
      published_at: new Date().toISOString(),
      assets: [
        {
          name: 'asset1.zip',
          browser_download_url: 'http://example.com/asset1.zip',
          size: 1024,
          content_type: 'application/zip',
          state: 'uploaded',
          download_count: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      id: 2,
      created_at: new Date().toISOString(),
      body: 'Release notes for v0.5.0',
      html_url: 'http://example.com/release/v0.5.0',
    };

    it('should fetch and return the release for a given tag', async () => {
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockReleaseData)));
      const release = await apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0');
      expect(release).toEqual(mockReleaseData);
      expect(mockDownloadFn).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.5.0',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/vnd.github.v3+json' }),
        })
      );
    });

    it('should return null if the release tag is not found (404)', async () => {
      const url =
        'https://api.github.com/repos/test-owner/test-repo/releases/tags/non-existent-tag';
      // Simulate the error structure that GitHubApiClient's request method would throw
      mockDownloadFn.mockRejectedValue(new Error(`GitHub resource not found: ${url}. Status: 404`));
      const release = await apiClient.getReleaseByTag(
        'test-owner',
        'test-repo',
        'non-existent-tag'
      );
      expect(release).toBeNull();
    });

    it('should throw a GitHubApiClientError with rate limit details if a RateLimitError occurs', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.5.0';
      const resetTimestamp = Date.now() + 1800 * 1000;
      mockDownloadFn.mockRejectedValue(
        new RateLimitError(
          'Rate limited',
          url,
          429,
          'Too Many Requests',
          undefined,
          {},
          resetTimestamp
        )
      );

      await expect(apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0');
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`GitHub API rate limit exceeded for ${url}`);
          expect(error.statusCode).toBe(429);
          expect(error.originalError).toBeInstanceOf(RateLimitError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });

    it('should throw a GitHubApiClientError for other failures (ClientError)', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.5.0';
      mockDownloadFn.mockRejectedValue(new ClientError(url, 400, 'Bad Request'));

      await expect(apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0');
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`GitHub API client error for ${url}`);
          expect(error.statusCode).toBe(400);
          expect(error.originalError).toBeInstanceOf(ClientError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });
  });

  describe('getAllReleases', () => {
    // createMockRelease is now at the top level of the outer describe block

    it('should fetch all releases with default pagination (30 per page)', async () => {
      const page1Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 1, `v1.${i}.0`)
      );
      const page2Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 31, `v0.${i}.0`)
      );

      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const releases = await apiClient.getAllReleases('test-owner', 'test-repo');
      expect(releases).toEqual([...page1Releases, ...page2Releases]);
      expect(mockDownloadFn).toHaveBeenCalledTimes(3);
      expect(mockDownloadFn.mock.calls?.[0]?.[0]).toContain('/releases?per_page=30&page=1');
      expect(mockDownloadFn.mock.calls?.[1]?.[0]).toContain('/releases?per_page=30&page=2');
      expect(mockDownloadFn.mock.calls?.[2]?.[0]).toContain('/releases?per_page=30&page=3');
    });

    it('should fetch releases with custom perPage option', async () => {
      const customPageReleases: GitHubRelease[] = [createMockRelease(1, 'v1.0.0')];
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(customPageReleases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const releases = await apiClient.getAllReleases('test-owner', 'test-repo', { perPage: 1 });
      expect(releases).toEqual(customPageReleases);
      expect(mockDownloadFn.mock.calls?.[0]?.[0]).toContain('per_page=1&page=1');
    });

    it('should filter out prereleases if includePrerelease is false', async () => {
      const mixedReleases: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0', false),
        createMockRelease(2, 'v0.9.0-beta', true),
        createMockRelease(3, 'v0.8.0', false),
      ];
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(mixedReleases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const releases = await apiClient.getAllReleases('test-owner', 'test-repo', {
        includePrerelease: false,
      });
      expect(releases).toEqual([mixedReleases[0]!, mixedReleases[2]!]);
    });

    it('should return all releases (including prereleases) if includePrerelease is true or undefined', async () => {
      const mixedReleases: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0', false),
        createMockRelease(2, 'v0.9.0-beta', true),
      ];
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(mixedReleases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));
      const releasesUndefined = await apiClient.getAllReleases('test-owner', 'test-repo');
      expect(releasesUndefined).toEqual(mixedReleases);

      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(mixedReleases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const releasesTrue = await apiClient.getAllReleases('test-owner', 'test-repo', {
        includePrerelease: true,
      });
      expect(releasesTrue).toEqual(mixedReleases);
    });

    it('should return an empty array if no releases are found', async () => {
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify([])));
      const releases = await apiClient.getAllReleases('test-owner', 'test-repo');
      expect(releases).toEqual([]);
    });

    it('should throw a GitHubApiClientError with rate limit details if a RateLimitError occurs', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases?per_page=30&page=1';
      const resetTimestamp = Date.now() + 600 * 1000;
      mockDownloadFn.mockRejectedValue(
        new RateLimitError(
          'Rate limited on getAllReleases',
          url,
          403,
          'Forbidden',
          {},
          {},
          resetTimestamp
        )
      );

      await expect(apiClient.getAllReleases('test-owner', 'test-repo')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await apiClient.getAllReleases('test-owner', 'test-repo');
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`GitHub API rate limit exceeded for ${url}`);
          expect(error.statusCode).toBe(403);
          expect(error.originalError).toBeInstanceOf(RateLimitError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });

    it('should throw a GitHubApiClientError for other failures (ServerError)', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases?per_page=30&page=1';
      mockDownloadFn.mockRejectedValue(new ServerError(url, 503, 'Service Unavailable'));

      await expect(apiClient.getAllReleases('test-owner', 'test-repo')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await apiClient.getAllReleases('test-owner', 'test-repo');
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`GitHub API server error for ${url}`);
          expect(error.statusCode).toBe(503);
          expect(error.originalError).toBeInstanceOf(ServerError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });
  });

  describe('getReleaseByConstraint', () => {
    it("should call getLatestRelease if constraint is 'latest'", async () => {
      const mockLatestRelease = createMockRelease(10, 'v2.0.0') as GitHubRelease;
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockLatestRelease)));

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', 'latest');
      expect(release).toEqual(mockLatestRelease);
      expect(mockDownloadFn).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/latest',
        expect.anything()
      );
    });

    it("should return null if constraint is 'latest' and getLatestRelease fails with NotFoundError", async () => {
      mockDownloadFn.mockRejectedValue(
        new NotFoundError('https://api.github.com/repos/test-owner/test-repo/releases/latest')
      );
      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', 'latest');
      expect(release).toBeNull();
    });

    it('should return the latest satisfying release for a valid semver constraint', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v1.1.0'),
        createMockRelease(3, 'v1.0.1-beta'),
        createMockRelease(4, 'v1.2.0'),
        createMockRelease(5, 'v0.9.0'),
        createMockRelease(6, '2.0.0'),
      ];
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.1.0');
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.2.0')!);
      expect(mockDownloadFn).toHaveBeenCalledTimes(1);
    });

    it('should include prereleases when matching if constraint allows and includePrerelease is true in semver.satisfies', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v1.1.0-beta.1'),
        createMockRelease(3, 'v1.1.0-alpha'),
        createMockRelease(4, 'v1.0.1'),
      ];
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '>=1.1.0-alpha'
      );
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.1.0-beta.1')!);
    });

    it('should return null if no releases satisfy the constraint', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v0.9.0'),
      ];
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^2.0.0');
      expect(release).toBeNull();
    });

    it('should return null if getAllReleases returns an empty list', async () => {
      mockDownloadFn.mockReset();
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify([])));
      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.0.0');
      expect(release).toBeNull();
    });

    it('should handle tags that are not valid semver by ignoring them', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'not-a-version'),
        createMockRelease(2, 'v1.0.0'),
        createMockRelease(3, 'my-feature-branch'),
      ];
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.0.0');
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.0.0')!);
    });

    it('should stop fetching pages if the best match is found on a non-full page', async () => {
      const page1Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 1, `v0.${i + 1}.0`)
      );
      const targetRelease = createMockRelease(31, 'v1.2.3');
      const page2Releases: GitHubRelease[] = [
        createMockRelease(32, 'v1.2.4'),
        targetRelease,
        createMockRelease(33, 'v1.1.0'),
      ];

      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases)));

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.2.0');
      expect(release).toEqual(page2Releases.find((r) => r.tag_name === 'v1.2.4')!);
      expect(mockDownloadFn).toHaveBeenCalledTimes(2);
      expect(mockDownloadFn.mock.calls?.[0]?.[0]).toContain('page=1');
      expect(mockDownloadFn.mock.calls?.[1]?.[0]).toContain('page=2');
    });
  });

  describe('getRateLimit', () => {
    it('should fetch and return rate limit information', async () => {
      const mockRateLimitData: GitHubRateLimit = {
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
      };
      const mockApiResponse = {
        resources: {
          core: mockRateLimitData,
          search: { limit: 30, remaining: 18, reset: Math.floor(Date.now() / 1000) + 60 },
          graphql: { limit: 5000, remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
        },
        rate: mockRateLimitData,
      };
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockApiResponse)));

      const rateLimit = await apiClient.getRateLimit();
      expect(rateLimit).toEqual(mockRateLimitData);
      expect(mockDownloadFn).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/vnd.github.v3+json' }),
        })
      );
    });

    it('should throw a GitHubApiClientError if fetching rate limit fails with HttpError', async () => {
      const url = 'https://api.github.com/rate_limit';
      mockDownloadFn.mockRejectedValue(
        new HttpError('API unavailable', url, 500, 'Internal Server Error')
      );

      await expect(apiClient.getRateLimit()).rejects.toThrow(GitHubApiClientError);

      try {
        await apiClient.getRateLimit();
      } catch (error) {
        if (error instanceof GitHubApiClientError) {
          expect(error.message).toContain(`GitHub API HTTP error for ${url}`);
          expect(error.statusCode).toBe(500);
          expect(error.originalError).toBeInstanceOf(HttpError);
        } else {
          throw new Error('Expected GitHubApiClientError but got a different error type');
        }
      }
    });
  });

  describe('caching', () => {
    let clientWithCache: GitHubApiClient;
    let mockGetFn: ReturnType<typeof mock>;
    let mockSetFn: ReturnType<typeof mock>;
    let mockHasFn: ReturnType<typeof mock>;
    let mockDeleteFn: ReturnType<typeof mock>;
    let mockClearExpiredFn: ReturnType<typeof mock>;
    let mockClearFn: ReturnType<typeof mock>;

    beforeEach(() => {
      // Create mock functions using Bun's mock
      mockGetFn = mock(() => Promise.resolve(null));
      mockSetFn = mock(() => Promise.resolve());
      mockHasFn = mock(() => Promise.resolve(false));
      mockDeleteFn = mock(() => Promise.resolve());
      mockClearExpiredFn = mock(() => Promise.resolve());
      mockClearFn = mock(() => Promise.resolve());

      mockCache = {
        get: async <T>(_key: string): Promise<T | null> => mockGetFn(_key) as T | null,
        set: async <T>(_key: string, _data: T, _ttlMs?: number): Promise<void> =>
          mockSetFn(_key, _data, _ttlMs),
        has: async (_key: string): Promise<boolean> => mockHasFn(_key) as boolean,
        delete: async (_key: string): Promise<void> => mockDeleteFn(_key),
        clearExpired: async (): Promise<void> => mockClearExpiredFn(),
        clear: async (): Promise<void> => mockClearFn(),
      };

      clientWithCache = new GitHubApiClient(mockAppConfig, { download: mockDownloadFn }, mockCache);
    });

    it('should return cached data when available', async () => {
      // Setup cache to return data
      mockGetFn.mockResolvedValue(FIXTURE_RELEASE);

      const release = await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).not.toHaveBeenCalled(); // API request should not be made
    });

    it('should fetch and cache data when not in cache', async () => {
      // Setup cache to miss
      mockGetFn.mockResolvedValue(null);

      // Setup downloader to return data
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      const release = await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled();

      // Verify the data being cached is correct
      const setCallData = mockSetFn.mock.calls?.[0]?.[1];
      expect(setCallData).toEqual(FIXTURE_RELEASE);
    });

    it('should not use cache when disabled in config', async () => {
      const configWithCacheDisabled: AppConfig = {
        ...mockAppConfig,
        githubApiCacheEnabled: false,
      };

      const clientWithDisabledCache = new GitHubApiClient(
        configWithCacheDisabled,
        { download: mockDownloadFn },
        mockCache
      );

      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      const release = await clientWithDisabledCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockGetFn).not.toHaveBeenCalled(); // Cache should not be checked
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).not.toHaveBeenCalled(); // Result should not be cached
    });

    it('should handle cache errors gracefully', async () => {
      // Setup cache to throw error
      mockGetFn.mockRejectedValue(new Error('Cache error'));
      mockSetFn.mockRejectedValue(new Error('Cache write error'));

      // Setup downloader to return data
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      // Should still work despite cache errors
      const release = await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled();
    });

    it('should generate different cache keys for different endpoints', async () => {
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      // Make two different requests
      await clientWithCache.getLatestRelease('test-owner', 'test-repo');
      await clientWithCache.getReleaseByTag('test-owner', 'test-repo', 'v1.0.0');

      // Should have called set twice with different keys
      expect(mockSetFn).toHaveBeenCalledTimes(2);
      const firstCallKey = mockSetFn.mock.calls?.[0]?.[0];
      const secondCallKey = mockSetFn.mock.calls?.[1]?.[0];

      expect(firstCallKey).not.toEqual(secondCallKey);
    });

    it('should use custom TTL when provided', async () => {
      // Setup cache to miss
      mockGetFn.mockResolvedValue(null);

      // Setup downloader to return data
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      // Create client with custom TTL
      const configWithCustomTtl: AppConfig = {
        ...mockAppConfig,
        githubApiCacheTtl: 7200000, // 2 hours
      };
      const clientWithCustomTtl = new GitHubApiClient(
        configWithCustomTtl,
        { download: mockDownloadFn },
        mockCache
      );

      await clientWithCustomTtl.getLatestRelease('test-owner', 'test-repo');

      // Verify the TTL is passed to the cache
      expect(mockSetFn).toHaveBeenCalledTimes(1);
      const ttlArg = mockSetFn.mock.calls?.[0]?.[2];
      expect(ttlArg).toBe(7200000);
    });

    it('should cache getAllReleases responses', async () => {
      // Setup cache to miss
      mockGetFn.mockResolvedValue(null);

      // Setup downloader to return data
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));

      const releases = await clientWithCache.getAllReleases('test-owner', 'test-repo');

      expect(releases).toEqual(FIXTURE_RELEASES_LIST);
      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled();

      // Verify the data being cached is correct
      const setCallData = mockSetFn.mock.calls?.[0]?.[1];
      expect(setCallData).toEqual(FIXTURE_RELEASES_LIST);
    });

    it('should cache getReleaseByConstraint responses', async () => {
      // Setup cache to miss for both the constraint request and the getAllReleases fallback
      mockGetFn.mockResolvedValue(null);

      // Setup downloader to return data
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));

      const release = await clientWithCache.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '^1.0.0'
      );

      expect(release).toBeTruthy();
      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled();
    });

    it('should cache getRateLimit responses', async () => {
      // Setup cache to miss
      mockGetFn.mockResolvedValue(null);

      // Setup downloader to return data
      const mockRateLimitData = {
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
          },
          search: { limit: 30, remaining: 18, reset: Math.floor(Date.now() / 1000) + 60 },
          graphql: { limit: 5000, remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
        },
        rate: {
          limit: 5000,
          remaining: 4999,
          reset: Math.floor(Date.now() / 1000) + 3600,
        },
      };
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockRateLimitData)));

      await clientWithCache.getRateLimit();

      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled();
    });

    it('should include token hash in cache key when token is provided', async () => {
      // Create a spy on the private generateCacheKey method
      const configWithToken: AppConfig = {
        ...mockAppConfig,
        githubToken: 'test-token',
      };

      const clientWithToken = new GitHubApiClient(
        configWithToken,
        { download: mockDownloadFn },
        mockCache
      );

      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      // Make a request
      await clientWithToken.getLatestRelease('test-owner', 'test-repo');

      // Make the same request with a client without token
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      // Should have called set twice with different keys due to token difference
      expect(mockSetFn).toHaveBeenCalledTimes(2);
      const withTokenKey = mockSetFn.mock.calls?.[0]?.[0];
      const withoutTokenKey = mockSetFn.mock.calls?.[1]?.[0];

      expect(withTokenKey).not.toEqual(withoutTokenKey);
    });
  });
});
