/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--getAllReleases.test.ts
 * @description Tests for the GitHubApiClient's getAllReleases method.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRelease } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import { RateLimitError, ServerError } from '../../downloader/errors';
import { GitHubApiClient } from '../GitHubApiClient';
import { GitHubApiClientError } from '../GitHubApiClientError';

// Common variables
let mockDownloadFn: ReturnType<typeof mock<IDownloader['download']>>;
let mockAppConfig: AppConfig;
let apiClient: GitHubApiClient;

// Helper function from original test file
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

  describe('getAllReleases', () => {
    it('should fetch all releases with default pagination (30 per page)', async () => {
      const page1Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 1, `v1.${i}.0`)
      );
      const page2Releases: GitHubRelease[] = Array.from({ length: 30 }, (_, i) =>
        createMockRelease(i + 31, `v0.${i}.0`)
      );

      mockDownloadFn.mockReset(); // Ensure clean mock for multi-call test
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // End of pagination

      const releases = await apiClient.getAllReleases('test-owner', 'test-repo');
      expect(releases).toEqual([...page1Releases, ...page2Releases]);
      expect(mockDownloadFn).toHaveBeenCalledTimes(3);
      expect(mockDownloadFn.mock.calls?.[0]?.[0]).toContain('/releases?per_page=30&page=1');
      expect(mockDownloadFn.mock.calls?.[1]?.[0]).toContain('/releases?per_page=30&page=2');
      expect(mockDownloadFn.mock.calls?.[2]?.[0]).toContain('/releases?per_page=30&page=3');
    });

    it('should fetch releases with custom perPage option', async () => {
      const customPageReleases: GitHubRelease[] = [createMockRelease(1, 'v1.0.0')];
      mockDownloadFn.mockReset();
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
      mockDownloadFn.mockReset();
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
      mockDownloadFn.mockReset();
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
      mockDownloadFn.mockReset();
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify([])));
      const releases = await apiClient.getAllReleases('test-owner', 'test-repo');
      expect(releases).toEqual([]);
    });

    it('should throw a GitHubApiClientError with rate limit details if a RateLimitError occurs', async () => {
      const url = 'https://api.github.com/repos/test-owner/test-repo/releases?per_page=30&page=1';
      const resetTimestamp = Date.now() + 600 * 1000;
      mockDownloadFn.mockReset();
      mockDownloadFn.mockRejectedValue(
        new RateLimitError(
          'Rate limited on getAllReleases',
          url,
          403,
          'Forbidden',
          {}, // responseBody - original test had {} here, RateLimitError expects string|object
          {}, // headers
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
      mockDownloadFn.mockReset();
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
});
