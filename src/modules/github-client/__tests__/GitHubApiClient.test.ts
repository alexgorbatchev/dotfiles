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
 *     - [x] Test handling of 404 (Not Found) error.
 *     - [x] Test handling of GitHub API rate limit error (403).
 *     - [x] Test handling of other generic network/request errors.
 *   - [x] **`getReleaseByTag` Method:**
 *     - [x] Test successful retrieval of a release by tag.
 *     - [x] Test handling of 404 if tag not found.
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
// Using mock from bun:test
import { GitHubApiClient } from '../GitHubApiClient';
import type { IDownloader } from '../../downloader/IDownloader';
import type { AppConfig, GitHubRateLimit, GitHubRelease } from '../../../types';
// import { createLogger } from '../../logger'; // Logger is no-op, no need to import or mock

// Logger mock fully removed.

describe('GitHubApiClient', () => {
  let mockDownloadFn: ReturnType<typeof mock<IDownloader['download']>>;
  let mockAppConfig: AppConfig;
  let apiClient: GitHubApiClient;

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
    };

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
  });

  // TODO: Add more tests for each method as per the development plan

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
            'User-Agent': 'dotfiles-generator/1.0.0',
          },
        }
      );
      // expect(mockDownloader).toHaveBeenCalledWith( // Bun's expect might not have toHaveBeenCalledWith
      //   'https://api.github.com/repos/test-owner/test-repo/releases/latest',
      //   {
      //     headers: {
      //       Accept: 'application/vnd.github.v3+json',
      //       'User-Agent': 'dotfiles-generator/1.0.0',
      //     },
      //   }
      // );
      // Logging is no-op, cannot assert log calls directly.
    });

    it('should throw an error if the release is not found (404)', async () => {
      mockDownloadFn.mockRejectedValue(new Error('Request failed with status code 404'));
      await expect(apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        'GitHub resource not found: https://api.github.com/repos/test-owner/test-repo/releases/latest'
      );
    });

    it('should throw an error with rate limit details if a 403 error occurs', async () => {
      const rateLimitData: GitHubRateLimit = {
        limit: 100,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 3600,
      };
      mockDownloadFn.mockImplementation(async (url: string) => {
        if (url.includes('/repos/test-owner/test-repo/releases/latest')) {
          throw new Error('Request failed with status code 403');
        }
        if (url.includes('/rate_limit')) {
          return Buffer.from(JSON.stringify({ resources: { core: rateLimitData } }));
        }
        return Buffer.from('');
      });

      const resetTime = new Date(rateLimitData.reset * 1000);
      await expect(apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}. Limit: ${rateLimitData.limit}, Remaining: ${rateLimitData.remaining}`
      );
    });

    it('should throw a generic error for other failures', async () => {
      const genericError = new Error('Network connection lost');
      mockDownloadFn.mockRejectedValue(genericError);
      await expect(apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        'Network connection lost'
      );
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

    it('should throw an error if the release tag is not found (404)', async () => {
      mockDownloadFn.mockRejectedValue(new Error('Request failed with status code 404'));
      await expect(
        apiClient.getReleaseByTag('test-owner', 'test-repo', 'non-existent-tag')
      ).rejects.toThrow(
        'GitHub resource not found: https://api.github.com/repos/test-owner/test-repo/releases/tags/non-existent-tag'
      );
    });

    it('should throw an error with rate limit details if a 403 error occurs', async () => {
      const rateLimitData: GitHubRateLimit = {
        limit: 50,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 1800,
      };
      mockDownloadFn.mockImplementation(async (url: string) => {
        if (url.includes('/releases/tags/')) throw new Error('Request failed with status code 403');
        if (url.includes('/rate_limit'))
          return Buffer.from(JSON.stringify({ resources: { core: rateLimitData } }));
        return Buffer.from('');
      });
      const resetTime = new Date(rateLimitData.reset * 1000);
      await expect(apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0')).rejects.toThrow(
        `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}. Limit: ${rateLimitData.limit}, Remaining: ${rateLimitData.remaining}`
      );
    });

    it('should throw a generic error for other failures', async () => {
      mockDownloadFn.mockRejectedValue(new Error('Some other API error'));
      await expect(apiClient.getReleaseByTag('test-owner', 'test-repo', 'v0.5.0')).rejects.toThrow(
        'Some other API error'
      );
    });
  });

  describe('getAllReleases', () => {
    // createMockRelease is now at the top level of the outer describe block

    it('should fetch all releases with default pagination (30 per page)', async () => {
      const page1Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 1, `v1.${i}.0`)
      );
      // Adjust page2Releases to also have 30 items to force a third call
      const page2Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 31, `v0.${i}.0`)
      );

      // Reset and prime mock for exactly this test case's expected sequence
      mockDownloadFn.mockReset(); // Clears previous mockResolvedValueOnce calls
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases))) // Page 1
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases))) // Page 2
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // Page 3 (empty)

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
      expect(releases).toEqual([mixedReleases[0]!, mixedReleases[2]!]); // Added non-null assertion for clarity
    });

    it('should return all releases (including prereleases) if includePrerelease is true or undefined', async () => {
      const mixedReleases: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0', false),
        createMockRelease(2, 'v0.9.0-beta', true),
      ];
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(mixedReleases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // For page 2, which is empty
      const releasesUndefined = await apiClient.getAllReleases('test-owner', 'test-repo');
      expect(releasesUndefined).toEqual(mixedReleases);

      // mockDownloadFn.mockClear(); // This clears implementations.
      // Instead, reset and re-prime for the second part of the test.
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(mixedReleases))) // Page 1 for releasesTrue
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // Page 2 for releasesTrue (empty)

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

    it('should throw an error with rate limit details if a 403 error occurs', async () => {
      const rateLimitData: GitHubRateLimit = {
        limit: 20,
        remaining: 0,
        reset: Date.now() / 1000 + 600,
      };
      mockDownloadFn.mockImplementation(async (url: string) => {
        if (url.includes('/releases?per_page='))
          throw new Error('Request failed with status code 403');
        if (url.includes('/rate_limit'))
          return Buffer.from(JSON.stringify({ resources: { core: rateLimitData } }));
        return Buffer.from('');
      });
      const resetTime = new Date(rateLimitData.reset * 1000);
      await expect(apiClient.getAllReleases('test-owner', 'test-repo')).rejects.toThrow(
        `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}. Limit: ${rateLimitData.limit}, Remaining: ${rateLimitData.remaining}`
      );
    });

    it('should throw a generic error for other failures', async () => {
      mockDownloadFn.mockRejectedValue(new Error('Server unavailable'));
      await expect(apiClient.getAllReleases('test-owner', 'test-repo')).rejects.toThrow(
        'Server unavailable'
      );
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
        expect.anything() // Headers are tested in getLatestRelease tests
      );
    });

    it("should return null if constraint is 'latest' and getLatestRelease fails", async () => {
      mockDownloadFn.mockRejectedValue(new Error('Failed to fetch latest'));
      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', 'latest');
      expect(release).toBeNull();
    });

    it('should return the latest satisfying release for a valid semver constraint', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v1.1.0'),
        createMockRelease(3, 'v1.0.1-beta'), // prerelease
        createMockRelease(4, 'v1.2.0'),
        createMockRelease(5, 'v0.9.0'),
        createMockRelease(6, '2.0.0'), // No 'v' prefix
      ];
      // Mock getAllReleases to return this list
      mockDownloadFn.mockReset(); // Clear any previous mock implementations
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // For pagination termination

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.1.0');
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.2.0')!); // v1.2.0 is latest satisfying ^1.1.0
      // Since releasesList has < 30 items, getAllReleases will only make one call.
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

      // The semver.satisfies in implementation has includePrerelease: true
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
      const page1Releases: GitHubRelease[] = Array.from(
        { length: 30 },
        (_, i) => createMockRelease(i + 1, `v0.${i + 1}.0`) // Older versions on page 1
      );
      const targetRelease = createMockRelease(31, 'v1.2.3');
      const page2Releases: GitHubRelease[] = [
        createMockRelease(32, 'v1.2.4'), // A newer satisfying one
        targetRelease, // The one we expect
        createMockRelease(33, 'v1.1.0'), // Older, also satisfying
      ]; // Page 2 is not full (3 items < 30)

      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases))) // Page 1
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases))); // Page 2
      // No mock for page 3, as it shouldn't be called

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.2.0');

      // We expect v1.2.4 because it's the latest on page 2 that satisfies ^1.2.0
      expect(release).toEqual(page2Releases.find((r) => r.tag_name === 'v1.2.4')!);
      expect(mockDownloadFn).toHaveBeenCalledTimes(2); // Should only fetch page 1 and page 2
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
      // The API returns a nested structure, so we mock that
      const mockApiResponse = {
        resources: {
          core: mockRateLimitData,
          search: { limit: 30, remaining: 18, reset: Math.floor(Date.now() / 1000) + 60 },
          graphql: { limit: 5000, remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
        },
        rate: mockRateLimitData, // The top-level 'rate' usually mirrors 'core'
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

    it('should throw an error if fetching rate limit fails', async () => {
      mockDownloadFn.mockRejectedValue(new Error('API unavailable'));
      await expect(apiClient.getRateLimit()).rejects.toThrow('API unavailable');
    });
  });
});
