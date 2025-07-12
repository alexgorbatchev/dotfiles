import { beforeEach, describe, expect, it } from 'bun:test';
import type { GitHubRateLimit } from '@types';
import { HttpError } from '@modules/downloader';
import { GitHubApiClientError } from '../GitHubApiClientError';
import {
  type MockSetup,
  setupMockGitHubApiClient,
  createGitHubConfigOverride
} from './helpers/sharedGitHubApiClientTestSetup';

describe('GitHubApiClient', () => {
  let mocks: MockSetup;

  beforeEach(async () => {
    // Explicitly disable API cache for these non-caching tests
    mocks = await setupMockGitHubApiClient(createGitHubConfigOverride({ githubApiCacheEnabled: false }));
  });

  describe('getRateLimit', () => {
    it('should fetch and return rate limit information', async () => {
      const mockCoreRateLimitData: GitHubRateLimit = {
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
        used: 1,
        resource: 'core',
      };
      const mockApiResponse = {
        resources: {
          core: mockCoreRateLimitData,
          search: {
            limit: 30,
            remaining: 18,
            reset: Math.floor(Date.now() / 1000) + 60,
            used: 12,
            resource: 'search',
          },
          graphql: {
            limit: 5000,
            remaining: 5000,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 0,
            resource: 'graphql',
          },
        },
        rate: mockCoreRateLimitData,
      };
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(mockApiResponse)));

      const rateLimit = await mocks.apiClient.getRateLimit();
      expect(rateLimit).toEqual(mockCoreRateLimitData);
      expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
        'https://api.github.com/rate_limit',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': mocks.mockYamlConfig.github.userAgent,
          }),
        })
      );
    });

    it('should throw a GitHubApiClientError if fetching rate limit fails with HttpError', async () => {
      const url = 'https://api.github.com/rate_limit';
      mocks.mockDownloader.download.mockRejectedValue(
        new HttpError('API unavailable', url, 500, 'Internal Server Error')
      );

      expect(mocks.apiClient.getRateLimit()).rejects.toThrow(GitHubApiClientError);

      try {
        await mocks.apiClient.getRateLimit();
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
});
