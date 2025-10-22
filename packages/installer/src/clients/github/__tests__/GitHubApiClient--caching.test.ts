import { beforeEach, describe, expect, it } from 'bun:test';
import type { GitHubRateLimit } from '@dotfiles/schemas';
import { FIXTURE_RELEASE, FIXTURE_RELEASES_LIST } from './fixtures/cacheTestFixtures';
import {
  createGitHubConfigOverride,
  type MockSetup,
  setupMockGitHubApiClient,
} from './helpers/sharedGitHubApiClientTestSetup';

describe('GitHubApiClient', () => {
  describe('caching', () => {
    let mocks: MockSetup;

    beforeEach(async () => {
      // Default setup for most caching tests, cache enabled.
      mocks = await setupMockGitHubApiClient(
        createGitHubConfigOverride({ githubApiCacheEnabled: true, githubToken: '' })
      );
    });

    it('should return cached data for getLatestRelease when available', async () => {
      mocks.mockCache.get.mockResolvedValue(FIXTURE_RELEASE);

      const release = await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mocks.mockCache.get).toHaveBeenCalledWith(
        expect.stringMatching(/^GET:\/repos\/test-owner\/test-repo\/releases\/latest$/)
      );
      expect(mocks.mockDownloader.download).not.toHaveBeenCalled();
    });

    it('should fetch and cache data for getLatestRelease when not in cache', async () => {
      mocks.mockCache.get.mockResolvedValue(null); // Cache miss
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      const release = await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mocks.mockCache.get).toHaveBeenCalledWith('GET:/repos/test-owner/test-repo/releases/latest');
      expect(mocks.mockDownloader.download).toHaveBeenCalled();
      expect(mocks.mockCache.set).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases/latest',
        FIXTURE_RELEASE,
        mocks.mockYamlConfig.github.cache.ttl
      );
    });

    it('should not use cache for getLatestRelease when disabled in config', async () => {
      // Specific setup for this test: cache disabled
      const localMocks = await setupMockGitHubApiClient(createGitHubConfigOverride({ githubApiCacheEnabled: false }));

      localMocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      await localMocks.apiClient.getLatestRelease('test-owner', 'test-repo');

      expect(localMocks.mockCache.get).not.toHaveBeenCalled();
      expect(localMocks.mockDownloader.download).toHaveBeenCalled();
      expect(localMocks.mockCache.set).not.toHaveBeenCalled();
    });

    it('should handle cache errors gracefully during getLatestRelease (e.g., still fetch from network)', async () => {
      mocks.mockCache.get.mockRejectedValue(new Error('Cache read error'));
      mocks.mockCache.set.mockRejectedValue(new Error('Cache write error')); // Simulate set error too
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      const release = await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE); // Should still succeed by fetching
      expect(mocks.mockCache.get).toHaveBeenCalled();
      expect(mocks.mockDownloader.download).toHaveBeenCalled();
      expect(mocks.mockCache.set).toHaveBeenCalled(); // Attempt to set should still happen
    });

    it('should generate different cache keys for different endpoints/params', async () => {
      mocks.mockDownloader.download.mockReset(); // Reset to allow specific sequencing

      // 1. For getLatestRelease('owner1', 'repo1')
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      // 2. For getReleaseByTag('owner2', 'repo2', 'v1.0.0')
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      // 3. For getAllReleases('owner3', 'repo3', { perPage: 10 })
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));
      // 4. For getAllReleases('owner3', 'repo3', { perPage: 30 })
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));

      await mocks.apiClient.getLatestRelease('owner1', 'repo1');
      const key1 = mocks.mockCache.set.mock.calls[0]![0];

      await mocks.apiClient.getReleaseByTag('owner2', 'repo2', 'v1.0.0');
      const key2 = mocks.mockCache.set.mock.calls[1]![0];

      await mocks.apiClient.getAllReleases('owner3', 'repo3', { perPage: 10 });
      const key3 = mocks.mockCache.set.mock.calls[2]![0];

      await mocks.apiClient.getAllReleases('owner3', 'repo3', { perPage: 30 }); // Different perPage
      const key4 = mocks.mockCache.set.mock.calls[3]![0];

      expect(mocks.mockCache.set).toHaveBeenCalledTimes(4);
      expect(key1).not.toEqual(key2);
      expect(key2).not.toEqual(key3);
      expect(key3).not.toEqual(key4);

      expect(key1).toBe('GET:/repos/owner1/repo1/releases/latest');
      expect(key2).toBe('GET:/repos/owner2/repo2/releases/tags/v1.0.0');
      expect(key3).toBe('GET:/repos/owner3/repo3/releases?per_page=10&page=1');
      expect(key4).toBe('GET:/repos/owner3/repo3/releases?per_page=30&page=1');
    });

    it('should use custom TTL from AppConfig when caching', async () => {
      const customTtl = 7200000; // 2 hours
      const localMocks = await setupMockGitHubApiClient(createGitHubConfigOverride({ githubApiCacheTtl: customTtl }));

      localMocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      await localMocks.apiClient.getLatestRelease('test-owner', 'test-repo');

      expect(localMocks.mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        FIXTURE_RELEASE,
        customTtl // Expect the custom TTL
      );
    });

    it('should cache getAllReleases responses', async () => {
      mocks.mockCache.get.mockResolvedValue(null); // Cache miss
      mocks.mockDownloader.download
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // End pagination

      const releases = await mocks.apiClient.getAllReleases('test-owner', 'test-repo');

      expect(releases).toEqual(FIXTURE_RELEASES_LIST);
      expect(mocks.mockCache.get).toHaveBeenCalledWith('GET:/repos/test-owner/test-repo/releases?per_page=30&page=1');
      expect(mocks.mockCache.get).toHaveBeenCalledTimes(1);
      expect(mocks.mockDownloader.download).toHaveBeenCalledTimes(1);
      expect(mocks.mockCache.set).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1',
        FIXTURE_RELEASES_LIST,
        mocks.mockYamlConfig.github.cache.ttl
      );
      expect(mocks.mockCache.set).toHaveBeenCalledTimes(1);
    });

    it('should cache getReleaseByConstraint responses (when not "latest")', async () => {
      mocks.mockCache.get.mockResolvedValue(null); // Cache miss for the page data
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from(JSON.stringify(FIXTURE_RELEASES_LIST)));

      const constraint = '^1.0.0';
      const expectedRelease = FIXTURE_RELEASES_LIST.find((r) => r.tag_name === 'v1.1.0-beta.1')!;
      const release = await mocks.apiClient.getReleaseByConstraint('test-owner', 'test-repo', constraint);

      expect(release).toEqual(expectedRelease);
      expect(mocks.mockCache.get).toHaveBeenCalledWith('GET:/repos/test-owner/test-repo/releases?per_page=30&page=1');
      const relevantGetCalls = mocks.mockCache.get.mock.calls.filter(
        (call) => call[0] === 'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1'
      );
      expect(relevantGetCalls.length).toBeGreaterThanOrEqual(1);

      expect(mocks.mockDownloader.download).toHaveBeenCalledTimes(1);
      expect(mocks.mockCache.set).toHaveBeenCalledWith(
        'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1',
        FIXTURE_RELEASES_LIST,
        mocks.mockYamlConfig.github.cache.ttl
      );
      const relevantSetCalls = mocks.mockCache.set.mock.calls.filter(
        (call) => call[0] === 'GET:/repos/test-owner/test-repo/releases?per_page=30&page=1'
      );
      expect(relevantSetCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should cache getRateLimit responses', async () => {
      mocks.mockCache.get.mockResolvedValue(null); // Cache miss
      const mockRateLimitData = {
        resources: {
          core: { limit: 5000, remaining: 4999, reset: Date.now() / 1000 + 3600, used: 1 },
        },
        rate: {
          limit: 60,
          remaining: 59,
          reset: Date.now() / 1000 + 3600,
          used: 1,
          resource: 'core',
        },
      } as unknown as GitHubRateLimit;
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(mockRateLimitData)));

      await mocks.apiClient.getRateLimit();

      expect(mocks.mockCache.get).toHaveBeenCalledWith('GET:/rate_limit');
      expect(mocks.mockDownloader.download).toHaveBeenCalled();
      expect(mocks.mockCache.set).toHaveBeenCalledWith(
        'GET:/rate_limit',
        mockRateLimitData,
        mocks.mockYamlConfig.github.cache.ttl
      );
    });

    it('should include token hash in cache key when token is provided', async () => {
      const mocksWithToken = await setupMockGitHubApiClient(createGitHubConfigOverride({ githubToken: 'test-token' }));
      // mocks (without token) is from the outer beforeEach

      mocksWithToken.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(FIXTURE_RELEASE)));

      // Request with token
      await mocksWithToken.apiClient.getLatestRelease('test-owner', 'test-repo');
      const keyWithToken = mocksWithToken.mockCache.set.mock.calls[0]![0];

      // Request without token
      await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');
      const keyWithoutToken = mocks.mockCache.set.mock.calls[0]![0]; // First call for this instance

      expect(mocksWithToken.mockCache.set).toHaveBeenCalledTimes(1);
      expect(mocks.mockCache.set).toHaveBeenCalledTimes(1);

      expect(keyWithToken).not.toEqual(keyWithoutToken);
      expect(keyWithToken).toMatch(/^GET:\/repos\/test-owner\/test-repo\/releases\/latest:[a-f0-9]{8}$/);
      expect(keyWithoutToken).toBe('GET:/repos/test-owner/test-repo/releases/latest');
    });
  });
});
