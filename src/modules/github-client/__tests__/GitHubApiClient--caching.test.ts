/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--caching.test.ts
 * @description Tests for the GitHubApiClient's caching behavior.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRateLimit, GitHubRelease } from '../../../types'; // GitHubRelease for fixtures
import type { IDownloader } from '../../downloader/IDownloader';
import { GitHubApiClient } from '../GitHubApiClient';
import type { IGitHubApiCache } from '../IGitHubApiCache';
import { FIXTURE_RELEASE, FIXTURE_RELEASES_LIST } from './fixtures/cacheTestFixtures';

// Common variables
let mockDownloadFn: ReturnType<typeof mock<IDownloader['download']>>;
let mockAppConfig: AppConfig;
// No global apiClient here, as it's created with specific cache mocks in the describe block

describe('GitHubApiClient', () => {
  // beforeEach for outer describe is not strictly necessary if all tests are within 'caching'
  // but let's keep mockAppConfig and mockDownloadFn setup here for consistency.
  beforeEach(() => {
    mockDownloadFn = mock<IDownloader['download']>(async () => Buffer.from('')); // Default mock

    mockAppConfig = {
      githubToken: undefined,
      targetDir: '/usr/bin',
      dotfilesDir: '/test/dotfiles',
      generatedDir: '/test/dotfiles/.generated',
      toolConfigDir: '/test/dotfiles/generator/src/tools',
      debug: '',
      cacheEnabled: true, // Default to true for AppConfig
      cacheDir: '/test/dotfiles/.generated/cache',
      binariesDir: '/test/dotfiles/.generated/binaries',
      binDir: '/test/dotfiles/.generated/bin',
      zshInitDir: '/test/dotfiles/.generated/zsh',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
      completionsDir: '/test/dotfiles/.generated/completions',
      githubClientUserAgent: 'dotfiles-generator-test/1.0.0',
      githubApiCacheEnabled: true, // Crucial for these tests
      githubApiCacheTtl: 3600000, // 1 hour
    };
  });

  describe('caching', () => {
    let clientWithCache: GitHubApiClient;
    let mockCache: IGitHubApiCache;
    let mockGetFn: ReturnType<typeof mock>;
    let mockSetFn: ReturnType<typeof mock>;
    // Add other mock cache functions if they become necessary for new tests
    // let mockHasFn: ReturnType<typeof mock>;
    // let mockDeleteFn: ReturnType<typeof mock>;

    beforeEach(() => {
      mockGetFn = mock(async () => null); // Default to cache miss
      mockSetFn = mock(async () => {}); // Default no-op

      mockCache = {
        get: mockGetFn,
        set: mockSetFn,
        // Provide dummy implementations for other IGitHubApiCache methods
        has: async (_key: string): Promise<boolean> => false,
        delete: async (_key: string): Promise<void> => {},
        clearExpired: async (): Promise<void> => {},
        clear: async (): Promise<void> => {},
      };

      // Create client with the mock cache for each test in this block
      clientWithCache = new GitHubApiClient(
        mockAppConfig, // Uses the appConfig from outer beforeEach
        { download: mockDownloadFn }, // Uses downloadFn from outer beforeEach
        mockCache
      );
    });

    it('should return cached data for getLatestRelease when available', async () => {
      mockGetFn.mockResolvedValue(FIXTURE_RELEASE);

      const release = await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockGetFn).toHaveBeenCalledWith('GET:/repos/test-owner/test-repo/releases/latest');
      expect(mockDownloadFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache data for getLatestRelease when not in cache', async () => {
      mockGetFn.mockResolvedValue(null); // Cache miss
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      const release = await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockGetFn).toHaveBeenCalledWith('GET:/repos/test-owner/test-repo/releases/latest');
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases/latest',
        FIXTURE_RELEASE,
        mockAppConfig.githubApiCacheTtl
      );
    });

    it('should not use cache for getLatestRelease when disabled in config', async () => {
      const configWithCacheDisabled: AppConfig = {
        ...mockAppConfig,
        githubApiCacheEnabled: false,
      };
      const clientWithDisabledCache = new GitHubApiClient(
        configWithCacheDisabled,
        { download: mockDownloadFn },
        mockCache // Cache instance is still passed but should be ignored by client
      );

      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      await clientWithDisabledCache.getLatestRelease('test-owner', 'test-repo');

      expect(mockGetFn).not.toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).not.toHaveBeenCalled();
    });

    it('should handle cache errors gracefully during getLatestRelease (e.g., still fetch from network)', async () => {
      mockGetFn.mockRejectedValue(new Error('Cache read error'));
      mockSetFn.mockRejectedValue(new Error('Cache write error')); // Simulate set error too
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      const release = await clientWithCache.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE); // Should still succeed by fetching
      expect(mockGetFn).toHaveBeenCalled();
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled(); // Attempt to set should still happen
    });

    it('should generate different cache keys for different endpoints/params', async () => {
      mockDownloadFn.mockReset(); // Reset to allow specific sequencing

      // 1. For getLatestRelease('owner1', 'repo1')
      mockDownloadFn.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      // 2. For getReleaseByTag('owner2', 'repo2', 'v1.0.0')
      mockDownloadFn.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      // 3. For getAllReleases('owner3', 'repo3', { perPage: 10 }) - will fetch 1 page as FIXTURE_RELEASES_LIST.length < 10
      mockDownloadFn.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));
      // 4. For getAllReleases('owner3', 'repo3', { perPage: 30 }) - will fetch 1 page as FIXTURE_RELEASES_LIST.length < 30
      mockDownloadFn.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));

      await clientWithCache.getLatestRelease('owner1', 'repo1');
      const key1 = mockSetFn.mock.calls[0]![0];

      await clientWithCache.getReleaseByTag('owner2', 'repo2', 'v1.0.0');
      const key2 = mockSetFn.mock.calls[1]![0];

      await clientWithCache.getAllReleases('owner3', 'repo3', { perPage: 10 });
      const key3 = mockSetFn.mock.calls[2]![0]; // Cache key for the single page of this getAllReleases call

      await clientWithCache.getAllReleases('owner3', 'repo3', { perPage: 30 }); // Different perPage
      const key4 = mockSetFn.mock.calls[3]![0]; // Cache key for the single page of this second getAllReleases call

      expect(mockSetFn).toHaveBeenCalledTimes(4); // 1 (latest) + 1 (tag) + 1 (getAll p10) + 1 (getAll p30)
      expect(key1).not.toEqual(key2);
      expect(key2).not.toEqual(key3);
      expect(key3).not.toEqual(key4);

      expect(key1).toBe('GET:/repos/owner1/repo1/releases/latest');
      expect(key2).toBe('GET:/repos/owner2/repo2/releases/tags/v1.0.0');
      // For getAllReleases, the key will include pagination. This tests the first page.
      expect(key3).toBe('GET:/repos/owner3/repo3/releases?per_page=10&page=1');
      expect(key4).toBe('GET:/repos/owner3/repo3/releases?per_page=30&page=1');
    });

    it('should use custom TTL from AppConfig when caching', async () => {
      const customTtl = 7200000; // 2 hours
      const configWithCustomTtl: AppConfig = {
        ...mockAppConfig,
        githubApiCacheTtl: customTtl,
      };
      const clientWithCustomTtl = new GitHubApiClient(
        configWithCustomTtl,
        { download: mockDownloadFn },
        mockCache
      );

      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      await clientWithCustomTtl.getLatestRelease('test-owner', 'test-repo');

      expect(mockSetFn).toHaveBeenCalledWith(
        expect.any(String),
        FIXTURE_RELEASE,
        customTtl // Expect the custom TTL
      );
    });

    it('should cache getAllReleases responses', async () => {
      mockGetFn.mockResolvedValue(null); // Cache miss
      // getAllReleases makes multiple calls if paginated, but cache is for the final aggregated list.
      // For this test, assume getAllReleases fetches one page for simplicity of mocking download.
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // End pagination

      const releases = await clientWithCache.getAllReleases('test-owner', 'test-repo');

      expect(releases).toEqual(FIXTURE_RELEASES_LIST);
      // Check that get was called for page 1
      expect(mockGetFn).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1'
      );
      expect(mockGetFn).toHaveBeenCalledTimes(1); // Only page 1 is checked in cache before download
      expect(mockDownloadFn).toHaveBeenCalledTimes(1); // Only page 1 is downloaded
      // Check that set was called for page 1 data
      expect(mockSetFn).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1',
        FIXTURE_RELEASES_LIST, // Data for page 1
        mockAppConfig.githubApiCacheTtl
      );
      expect(mockSetFn).toHaveBeenCalledTimes(1); // Only page 1 data is set
    });

    it('should cache getReleaseByConstraint responses (when not "latest")', async () => {
      mockGetFn.mockResolvedValue(null); // Cache miss for the constraint itself
      // getReleaseByConstraint internally calls getAllReleases, which might hit cache or network.
      // Assume getAllReleases also misses cache for this test, then gets cached.
      const mockDownloaderForGetAllReleases = mockDownloadFn.mockResolvedValueOnce(
        Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST))
      ); // For page 1

      const constraint = '^1.0.0';
      const expectedRelease = FIXTURE_RELEASES_LIST.find((r) => r.tag_name === 'v1.1.0-beta.1')!; // FIXTURE_PRERELEASE
      const release = await clientWithCache.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        constraint
      );

      expect(release).toEqual(expectedRelease);

      // mockGetFn is called once by the first page fetch.
      // It's important to ensure this test doesn't get polluted by mockGetFn calls from previous tests
      // if beforeEach doesn't reset its call count or if it's not specific enough.
      // Assuming mockGetFn.mock.calls is clean or specific to this path:
      expect(mockGetFn).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1'
      );
      // Count calls to mockGetFn specifically for this test's logic if needed, or ensure reset.
      // For this specific flow, it's called once for the page data.
      const relevantGetCalls = mockGetFn.mock.calls.filter(
        (call) => call[0] === 'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1'
      );
      expect(relevantGetCalls.length).toBeGreaterThanOrEqual(1); // At least one call for the page

      expect(mockDownloaderForGetAllReleases).toHaveBeenCalledTimes(1);

      // Page 1 from the internal getAllReleases-like fetch should be cached
      expect(mockSetFn).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1',
        FIXTURE_RELEASES_LIST,
        mockAppConfig.githubApiCacheTtl
      );
      // Similar to mockGetFn, ensure mockSetFn call count is what's expected for this test's flow.
      const relevantSetCalls = mockSetFn.mock.calls.filter(
        (call) => call[0] === 'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1'
      );
      expect(relevantSetCalls.length).toBeGreaterThanOrEqual(1);

      // The GitHubApiClient.getReleaseByConstraint method, as currently written,
      // does not introduce its own separate cache layer for the *final computed result* of the constraint.
      // It relies on the caching of the individual page requests it makes.
    });

    it('should cache getRateLimit responses', async () => {
      mockGetFn.mockResolvedValue(null); // Cache miss
      const mockRateLimitData = {
        resources: {
          /* ... */
        },
        rate: {
          limit: 60,
          remaining: 59,
          reset: Date.now() / 1000 + 3600,
          used: 1,
          resource: 'core',
        },
      } as any; // Simplified for test
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockRateLimitData)));

      await clientWithCache.getRateLimit();

      expect(mockGetFn).toHaveBeenCalledWith('GET:/rate_limit');
      expect(mockDownloadFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalledWith(
        'GET:/rate_limit',
        mockRateLimitData, // The entire response from /rate_limit is cached by the request method
        mockAppConfig.githubApiCacheTtl
      );
    });

    it('should include token hash in cache key when token is provided', async () => {
      const configWithToken: AppConfig = { ...mockAppConfig, githubToken: 'test-token' };
      const clientWithTokenCache = new GitHubApiClient(
        configWithToken,
        { download: mockDownloadFn },
        mockCache
      );

      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE))); // Same response

      // Request with token
      await clientWithTokenCache.getLatestRelease('test-owner', 'test-repo');
      const keyWithToken = mockSetFn.mock.calls[0]![0];

      // Request without token (using clientWithCache from beforeEach)
      await clientWithCache.getLatestRelease('test-owner', 'test-repo');
      const keyWithoutToken = mockSetFn.mock.calls[1]![0];

      expect(mockSetFn).toHaveBeenCalledTimes(2);
      expect(keyWithToken).not.toEqual(keyWithoutToken);
      expect(keyWithToken).toMatch(
        /^GET:\/repos\/test-owner\/test-repo\/releases\/latest:[a-f0-9]{8}$/
      );
      expect(keyWithoutToken).toBe('GET:/repos/test-owner/test-repo/releases/latest');
    });
  });
});
