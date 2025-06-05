/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--getReleaseByConstraint.test.ts
 * @description Tests for the GitHubApiClient's getReleaseByConstraint method.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { GitHubRelease } from '../../../types';
import { NotFoundError } from '../../downloader/errors';
import { type MockSetup, setupMockGitHubApiClient } from './helpers/sharedGitHubApiClientTestSetup';

// Helper function
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
  let mocks: MockSetup;

  beforeEach(() => {
    // Explicitly disable API cache for these non-caching tests
    mocks = setupMockGitHubApiClient({ githubApiCacheEnabled: false });
  });

  describe('getReleaseByConstraint', () => {
    it("should call getLatestRelease if constraint is 'latest'", async () => {
      const mockLatestRelease = createMockRelease(10, 'v2.0.0');
      mocks.mockDownloader.download.mockResolvedValue(
        Buffer.from(JSON.stringify(mockLatestRelease))
      );

      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        'latest'
      );
      expect(release).toEqual(mockLatestRelease);
      expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/latest',
        expect.anything()
      );
    });

    it("should return null if constraint is 'latest' and getLatestRelease fails with NotFoundError from downloader", async () => {
      mocks.mockDownloader.download.mockRejectedValue(
        new NotFoundError('https://api.github.com/repos/test-owner/test-repo/releases/latest')
      );
      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        'latest'
      );
      expect(release).toBeNull();
    });

    it('should return the latest satisfying release for a valid semver constraint', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v1.1.0'),
        createMockRelease(3, 'v1.0.1-beta'),
        createMockRelease(4, 'v1.2.0'),
        createMockRelease(5, 'v0.9.0'),
        createMockRelease(6, '2.0.0'),
      ];
      mocks.mockDownloader.download.mockReset();
      mocks.mockDownloader.download
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '^1.1.0'
      );
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.2.0')!);
      expect(mocks.mockDownloader.download).toHaveBeenCalledTimes(1);
    });

    it('should include prereleases when matching if constraint allows', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'v1.0.0'),
        createMockRelease(2, 'v1.1.0-beta.1', true),
        createMockRelease(3, 'v1.1.0-alpha', true),
        createMockRelease(4, 'v1.0.1'),
      ];
      mocks.mockDownloader.download.mockReset();
      mocks.mockDownloader.download
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await mocks.apiClient.getReleaseByConstraint(
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
      mocks.mockDownloader.download.mockReset();
      mocks.mockDownloader.download
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '^2.0.0'
      );
      expect(release).toBeNull();
    });

    it('should return null if getAllReleases returns an empty list', async () => {
      mocks.mockDownloader.download.mockReset();
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify([])));
      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '^1.0.0'
      );
      expect(release).toBeNull();
    });

    it('should handle tags that are not valid semver by ignoring them', async () => {
      const releasesList: GitHubRelease[] = [
        createMockRelease(1, 'not-a-version'),
        createMockRelease(2, 'v1.0.0'),
        createMockRelease(3, 'my-feature-branch'),
      ];
      mocks.mockDownloader.download.mockReset();
      mocks.mockDownloader.download
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(releasesList)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([])));

      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '^1.0.0'
      );
      expect(release).toEqual(releasesList.find((r) => r.tag_name === 'v1.0.0')!);
    });

    it('should correctly identify the latest satisfying release from multiple pages', async () => {
      const perPage = 30; // Align with GitHubApiClient's internal default
      const page1Releases: GitHubRelease[] = Array.from({ length: perPage }, (_, i) =>
        createMockRelease(i + 1, `v0.${i + 1}.0`)
      );
      // Ensure IDs are unique across pages for clarity, starting page 2 IDs after page 1
      const targetReleaseId = perPage + 2;
      const targetRelease = createMockRelease(targetReleaseId, 'v1.2.4', false);
      const page2Releases: GitHubRelease[] = [
        createMockRelease(perPage + 1, 'v1.1.0'),
        targetRelease,
        createMockRelease(perPage + 3, 'v1.2.3'),
      ].sort((a, b) => (new Date(b.published_at) as any) - (new Date(a.published_at) as any)); // Simulate API sort

      mocks.mockDownloader.download.mockReset();
      mocks.mockDownloader.download
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page1Releases))) // Page 1
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(page2Releases))) // Page 2
        .mockResolvedValueOnce(Buffer.from(JSON.stringify([]))); // Page 3 (empty, to stop pagination)

      const release = await mocks.apiClient.getReleaseByConstraint(
        'test-owner',
        'test-repo',
        '^1.2.0'
      );
      expect(release).toEqual(targetRelease);
      // Expect 2 calls: page 1, and page 2. The loop terminates after page 2 because releasesPage.length < perPage.
      expect(mocks.mockDownloader.download).toHaveBeenCalledTimes(2);
      expect(mocks.mockDownloader.download.mock.calls[0]?.[0]).toContain(
        `per_page=${perPage}&page=1`
      );
      expect(mocks.mockDownloader.download.mock.calls[1]?.[0]).toContain(
        `per_page=${perPage}&page=2`
      );
    });
  });
});
