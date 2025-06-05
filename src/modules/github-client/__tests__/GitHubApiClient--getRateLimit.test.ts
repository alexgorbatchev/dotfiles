/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--getRateLimit.test.ts
 * @description Tests for the GitHubApiClient's getRateLimit method.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRateLimit } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import { HttpError } from '../../downloader/errors';
import { GitHubApiClient } from '../GitHubApiClient';
import { GitHubApiClientError } from '../GitHubApiClientError';

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
      cacheEnabled: true,
      cacheDir: '/test/dotfiles/.generated/cache',
      binariesDir: '/test/dotfiles/.generated/binaries',
      binDir: '/test/dotfiles/.generated/bin',
      zshInitDir: '/test/dotfiles/.generated/zsh',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
      completionsDir: '/test/dotfiles/.generated/completions',
      githubClientUserAgent: 'dotfiles-generator-test/1.0.0',
      githubApiCacheEnabled: false, // Explicitly disable for non-caching tests
      githubApiCacheTtl: 3600000,
    };

    apiClient = new GitHubApiClient(mockAppConfig, mockDownloaderInstance, undefined);
  });

  describe('getRateLimit', () => {
    it('should fetch and return rate limit information', async () => {
      const mockCoreRateLimitData: GitHubRateLimit = {
        // Renamed to avoid conflict
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
        used: 1, // Added based on type definition
        resource: 'core', // Added based on type definition
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
        rate: mockCoreRateLimitData, // The API returns the 'core' limit under 'rate' as well
      };
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify(mockApiResponse)));

      const rateLimit = await apiClient.getRateLimit();
      // The method is expected to return the 'core' rate limit specifically
      expect(rateLimit).toEqual(mockCoreRateLimitData);
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
});
