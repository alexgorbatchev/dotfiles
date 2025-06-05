/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--getLatestRelease.test.ts
 * @description Tests for the GitHubApiClient's getLatestRelease method.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRelease } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import { NetworkError, RateLimitError, NotFoundError } from '../../downloader/errors';
import { GitHubApiClient } from '../GitHubApiClient';
import { GitHubApiClientError } from '../GitHubApiClientError';
// Note: IGitHubApiCache is not directly used in these specific tests for getLatestRelease,
// but it's part of the constructor signature. We'll use a minimal mock if needed.

// Common variables
let mockDownloadFn: ReturnType<typeof mock<IDownloader['download']>>;
let mockAppConfig: AppConfig;
let apiClient: GitHubApiClient;

describe('GitHubApiClient', () => {
  beforeEach(() => {
    mockDownloadFn = mock<IDownloader['download']>(async () => Buffer.from(''));

    const mockDownloaderInstance: IDownloader = {
      download: mockDownloadFn,
    };

    mockAppConfig = {
      githubToken: undefined,
      targetDir: '/usr/bin',
      dotfilesDir: '/test/dotfiles',
      generatedDir: '/test/dotfiles/.generated',
      toolConfigDir: '/test/dotfiles/generator/src/tools',
      debug: '',
      cacheEnabled: true, // Caching tests are separate
      cacheDir: '/test/dotfiles/.generated/cache',
      binariesDir: '/test/dotfiles/.generated/binaries',
      binDir: '/test/dotfiles/.generated/bin',
      zshInitDir: '/test/dotfiles/.generated/zsh',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
      completionsDir: '/test/dotfiles/.generated/completions',
      githubClientUserAgent: 'dotfiles-generator-test/1.0.0',
      githubApiCacheEnabled: false, // Explicitly disable for non-caching tests unless specified
      githubApiCacheTtl: 3600000,
    };

    // For these tests, we are not focusing on cache, so pass undefined or a minimal mock
    apiClient = new GitHubApiClient(mockAppConfig, mockDownloaderInstance, undefined);
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
      // In the original test, it was a generic Error. The client handles NotFoundError specifically.
      // Let's assume the downloader throws an error that the client interprets as "not found".
      // The client's `request` method catches `NotFoundError` from the downloader.
      // If the downloader throws a generic error with status 404, the client's `request`
      // method might wrap it or re-throw.
      // For this test, we need to ensure the client's `getLatestRelease` returns null.
      // The simplest way is to mock the internal `request` to throw something that leads to null.
      // However, we are testing the public API.
      // The original test used: mockDownloadFn.mockRejectedValue(new Error(`GitHub resource not found: ${url}. Status: 404`));
      // The GitHubApiClient's `request` method would catch a `NotFoundError` from the downloader.
      // If the downloader throws a generic Error, the `request` method in `GitHubApiClient` might not convert it to `NotFoundError`
      // unless the status code is explicitly checked and a `NotFoundError` is thrown by the `request` method itself.
      // The `GitHubApiClient`'s `request` method is designed to throw specific `HttpError` subtypes.
      // Let's stick to what the `GitHubApiClient` expects from its `request` method, which is that `NotFoundError`
      // from the downloader (or a generic error that it interprets as such) should lead to `null`.
      // The client's `getLatestRelease` catches `GitHubApiClientError` if its `statusCode` is 404.
      mockDownloadFn.mockRejectedValue(
        new NotFoundError(url, new Error('Original 404 from downloader'))
      );

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
          'Rate limit details', // responseBody
          {}, // headers
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
});
