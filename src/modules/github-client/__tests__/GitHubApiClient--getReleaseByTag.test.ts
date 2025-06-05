/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--getReleaseByTag.test.ts
 * @description Tests for the GitHubApiClient's getReleaseByTag method.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRelease } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import {
  ClientError,
  RateLimitError,
  NotFoundError, // For consistency, though direct 404 test uses it
} from '../../downloader/errors';
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
          // Reverted to original asset structure, removing added fields like id, node_id etc.
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
      // Similar to getLatestRelease, if downloader throws NotFoundError, client converts to GitHubApiClientError(404)
      // which is then caught by getReleaseByTag to return null.
      mockDownloadFn.mockRejectedValue(
        new NotFoundError(url, new Error('Original 404 from downloader'))
      );
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
          429, // GitHub often uses 403 for primary rate limits, but 429 for secondary. Test uses 429.
          'Too Many Requests',
          undefined, // responseBody
          {}, // headers
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
});
