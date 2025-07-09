import { beforeEach, describe, expect, it } from 'bun:test';
import type { GitHubRelease } from '@types';
import { NetworkError, RateLimitError, NotFoundError } from '@modules/downloader';
import { GitHubApiClientError } from '../GitHubApiClientError';
import {
  type MockSetup,
  setupMockGitHubApiClient,
  createGitHubConfigOverride
} from './helpers/sharedGitHubApiClientTestSetup';

describe('GitHubApiClient', () => {
  let mocks: MockSetup;

  beforeEach(() => {
    // Explicitly disable API cache for these non-caching tests
    mocks = setupMockGitHubApiClient(createGitHubConfigOverride({ githubApiCacheEnabled: false }));
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
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(mockReleaseData)));

      const release = await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');
      expect(release).toEqual(mockReleaseData);
      expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': mocks.mockYamlConfig.github.userAgent,
          },
        }
      );
    });

    it('should return null if the release is not found (404)', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/latest';
      mocks.mockDownloader.download.mockRejectedValue(
        new NotFoundError(url, new Error('Original 404 from downloader'))
      );

      const release = await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');
      expect(release).toBeNull();
    });

    it('should throw a GitHubApiClientError with rate limit details if a RateLimitError is thrown by downloader', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases/latest';
      const resetTimestamp = Date.now() + 3600 * 1000;
      mocks.mockDownloader.download.mockRejectedValue(
        new RateLimitError(
          'API rate limit exceeded',
          url,
          403,
          'Forbidden',
          'Rate limit details', // responseBody
          {}, // headers
          resetTimestamp
        )
      );

      expect(mocks.apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');
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
      mocks.mockDownloader.download.mockRejectedValue(new NetworkError('Connection lost', url));

      expect(mocks.apiClient.getLatestRelease('test-owner', 'test-repo')).rejects.toThrow(
        GitHubApiClientError
      );

      try {
        await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');
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
});
