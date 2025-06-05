/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--getReleaseByConstraint.test.ts
 * @description Tests for the GitHubApiClient's getReleaseByConstraint method.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig, GitHubRelease } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import { NotFoundError } from '../../downloader/errors'; // Used for 'latest' fallback test
import { GitHubApiClient } from '../GitHubApiClient';
// GitHubApiClientError is not directly thrown in these specific positive tests,
// but could be relevant for future error case tests for this method.

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

    it("should return null if constraint is 'latest' and getLatestRelease fails with NotFoundError from downloader", async () => {
      // This simulates the scenario where the internal call to getLatestRelease encounters a 404
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
        createMockRelease(3, 'v1.0.1-beta'), // Should be ignored unless prerelease allowed by constraint
        createMockRelease(4, 'v1.2.0'),
        createMockRelease(5, 'v0.9.0'),
        createMockRelease(6, '2.0.0'), // Valid semver, ensure 'v' prefix is handled
      ];
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // End pagination for getAllReleases

      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.1.0');
      // For ^1.1.0, v1.2.0 is the latest satisfying version.
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.2.0')!);
      expect(mockDownloadFn).toHaveBeenCalledTimes(1); // Should fetch full list once
    });

    it('should include prereleases when matching if constraint allows and includePrerelease is true in semver.satisfies', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v1.1.0-beta.1', true),
        createMockRelease(3, 'v1.1.0-alpha', true),
        createMockRelease(4, 'v1.0.1'),
      ];
      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      // Constraint >=1.1.0-alpha should match v1.1.0-beta.1 as the latest
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
      mockDownloadFn.mockResolvedValue(Buffer.from(JSON.stringify([]))); // getAllReleases returns empty
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

    it('should stop fetching pages if the best match is found on a non-full page (getAllReleases optimization)', async () => {
      // This test assumes getAllReleases is smart enough to stop early,
      // or that getReleaseByConstraint processes pages one by one.
      // The current implementation of getReleaseByConstraint fetches ALL releases first.
      // So this specific optimization test might be more about getAllReleases behavior if it were paginated lazily.
      // However, the original test implies this behavior for getReleaseByConstraint.
      const page1Releases: GitHubRelease[] = Array.from(
        { length: 30 },
        (_, i) => createMockRelease(i + 1, `v0.${i + 1}.0`) // Older versions
      );
      // Target release is on page 2, and is the highest satisfying.
      const targetRelease = createMockRelease(32, 'v1.2.4', false); // Highest satisfying ^1.2.0
      const page2Releases: GitHubRelease[] = [
        createMockRelease(31, 'v1.1.0'), // Older than target
        targetRelease,
        createMockRelease(33, 'v1.2.3'), // Older than target but satisfies
      ].sort((a, b) => b.id - a.id); // Simulate typical GitHub API sort (newest first on page)

      mockDownloadFn.mockReset();
      mockDownloadFn
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases))) // Page 1 (older)
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases))) // Page 2 (contains best match)
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // Page 3 (should not be called if optimized)

      // The client's getReleaseByConstraint fetches all pages then filters.
      // So it will make 3 calls to mockDownloadFn for getAllReleases (page1, page2, empty page3)
      const release = await apiClient.getReleaseByConstraint('test-owner', 'test-repo', '^1.2.0');

      // The best match is v1.2.4
      const expectedRelease = page2Releases.find((r) => r.tag_name === 'v1.2.4')!;
      expect(release).toEqual(expectedRelease);

      // Current getReleaseByConstraint calls getAllReleases, which fetches all pages.
      // The original test expected 2 calls, implying an optimization that might not be in getAllReleases.
      // Let's adjust expectation to how it currently works (fetches all pages from getAllReleases).
      // getAllReleases will make calls for page 1, page 2, and then page 3 (which is empty).
      expect(mockDownloadFn).toHaveBeenCalledTimes(2); // page 1, page 2 (last page with data)
      expect(mockDownloadFn.mock.calls?.[0]?.[0]).toContain('page=1');
      expect(mockDownloadFn.mock.calls?.[1]?.[0]).toContain('page=2');
    });
  });
});
