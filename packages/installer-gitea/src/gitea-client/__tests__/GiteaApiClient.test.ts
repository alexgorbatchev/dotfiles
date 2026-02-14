import type { IGitHubRelease } from '@dotfiles/core';
import { NetworkError, NotFoundError } from '@dotfiles/downloader';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import { GiteaApiClientError } from '../GiteaApiClientError';
import latestReleaseFixture from './fixtures/latestRelease.json';
import {
  type IMockSetup,
  setupMockGiteaApiClient,
} from './helpers/sharedGiteaApiClientTestSetup';

describe('GiteaApiClient', () => {
  let mocks: IMockSetup;

  beforeEach(() => {
    mocks = setupMockGiteaApiClient({ cacheEnabled: false, token: '' });
  });

  describe('getLatestRelease', () => {
    it('should fetch and return the latest release', async () => {
      mocks.mockDownloader.download.mockResolvedValue(
        Buffer.from(JSON.stringify(latestReleaseFixture)),
      );

      const release = await mocks.apiClient.getLatestRelease('Codeberg', 'pages-server');
      assert(release !== null);
      expect(release.tag_name).toBe('v6.4');
      expect(release.name).toBe('v6.4');
      expect(release.draft).toBe(false);
      expect(release.prerelease).toBe(false);
      expect(release.assets).toHaveLength(1);
      expect(release.assets[0]!.name).toBe('codeberg-pages-server-v6.4-debian-x86_64.tar.gz');
      expect(release.html_url).toBe('https://codeberg.org/Codeberg/pages-server/releases/tag/v6.4');
      expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
        expect.anything(),
        'https://codeberg.org/api/v1/repos/Codeberg/pages-server/releases/latest',
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );
    });

    it('should return null if the release is not found (404)', async () => {
      const url = 'https://codeberg.org/api/v1/repos/Codeberg/pages-server/releases/latest';
      mocks.mockDownloader.download.mockRejectedValue(
        new NotFoundError(mocks.logger, url, new Error('404')),
      );

      const release = await mocks.apiClient.getLatestRelease('Codeberg', 'pages-server');
      expect(release).toBeNull();
    });

    it('should throw a GiteaApiClientError for network errors', async () => {
      const url = 'https://codeberg.org/api/v1/repos/Codeberg/pages-server/releases/latest';
      mocks.mockDownloader.download.mockRejectedValue(
        new NetworkError(mocks.logger, 'Connection lost', url),
      );

      expect(mocks.apiClient.getLatestRelease('Codeberg', 'pages-server')).rejects.toThrow(GiteaApiClientError);

      try {
        await mocks.apiClient.getLatestRelease('Codeberg', 'pages-server');
      } catch (error) {
        assert(error instanceof GiteaApiClientError);
        expect(error.message).toMatchInlineSnapshot(
          `"Network error while requesting https://codeberg.org/api/v1/repos/Codeberg/pages-server/releases/latest: Connection lost"`,
        );
        expect(error.originalError).toBeInstanceOf(NetworkError);
      }
    });

    it('should map Gitea asset format to IGitHubReleaseAsset', async () => {
      mocks.mockDownloader.download.mockResolvedValue(
        Buffer.from(JSON.stringify(latestReleaseFixture)),
      );

      const release = await mocks.apiClient.getLatestRelease('Codeberg', 'pages-server');
      assert(release !== null);
      const asset = release.assets[0];
      assert(asset !== undefined);
      expect(asset.name).toBe('codeberg-pages-server-v6.4-debian-x86_64.tar.gz');
      expect(asset.browser_download_url).toBe(
        'https://codeberg.org/Codeberg/pages-server/releases/download/v6.4/codeberg-pages-server-v6.4-debian-x86_64.tar.gz',
      );
      expect(asset.size).toBe(38132162);
      expect(asset.download_count).toBe(237);
      expect(asset.state).toBe('uploaded');
      expect(asset.content_type).toBe('application/octet-stream');
    });
  });

  describe('getReleaseByTag', () => {
    it('should fetch release by tag', async () => {
      const releaseData = latestReleaseFixture;
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(releaseData)));

      const release = await mocks.apiClient.getReleaseByTag('Codeberg', 'pages-server', 'v6.4');
      assert(release !== null);
      expect(release.tag_name).toBe('v6.4');
      expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
        expect.anything(),
        'https://codeberg.org/api/v1/repos/Codeberg/pages-server/releases/tags/v6.4',
        expect.anything(),
      );
    });

    it('should return null for non-existent tag', async () => {
      const url = 'https://codeberg.org/api/v1/repos/Codeberg/pages-server/releases/tags/v99.99';
      mocks.mockDownloader.download.mockRejectedValue(
        new NotFoundError(mocks.logger, url, new Error('404')),
      );

      const release = await mocks.apiClient.getReleaseByTag('Codeberg', 'pages-server', 'v99.99');
      expect(release).toBeNull();
    });
  });

  describe('getAllReleases', () => {
    it('should fetch and map all releases', async () => {
      const allReleasesFixture = await import('./fixtures/allReleasesPage1.json');
      mocks.mockDownloader.download.mockResolvedValueOnce(
        Buffer.from(JSON.stringify(allReleasesFixture.default)),
      );
      // Empty second page to stop pagination
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from('[]'));

      const releases = await mocks.apiClient.getAllReleases('Codeberg', 'pages-server');
      expect(releases).toHaveLength(3);
      expect(releases[0]!.tag_name).toBe('v6.4');
      expect(releases[1]!.tag_name).toBe('v6.3');
      expect(releases[2]!.tag_name).toBe('v6.2.1');
    });

    it('should filter out prereleases when includePrerelease is false', async () => {
      const releasesWithPrerelease: IGitHubRelease[] = [
        {
          id: 1,
          tag_name: 'v2.0.0',
          name: 'v2.0.0',
          draft: false,
          prerelease: false,
          created_at: '2025-01-01T00:00:00Z',
          published_at: '2025-01-01T00:00:00Z',
          assets: [],
          html_url: 'https://codeberg.org/owner/repo/releases/tag/v2.0.0',
        },
        {
          id: 2,
          tag_name: 'v2.1.0-beta',
          name: 'v2.1.0-beta',
          draft: false,
          prerelease: true,
          created_at: '2025-02-01T00:00:00Z',
          published_at: '2025-02-01T00:00:00Z',
          assets: [],
          html_url: 'https://codeberg.org/owner/repo/releases/tag/v2.1.0-beta',
        },
      ];

      // Gitea API returns IGiteaRelease format, so we need the raw format
      const rawReleases = releasesWithPrerelease.map((r) => {
        return {
          id: r.id,
          tag_name: r.tag_name,
          name: r.name,
          draft: r.draft,
          prerelease: r.prerelease,
          created_at: r.created_at,
          published_at: r.published_at,
          assets: r.assets,
          html_url: r.html_url,
          url: '',
          tarball_url: '',
          zipball_url: '',
          target_commitish: 'main',
          author: { id: 1, login: 'test' },
        };
      });

      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from(JSON.stringify(rawReleases)));
      mocks.mockDownloader.download.mockResolvedValueOnce(Buffer.from('[]'));

      const releases = await mocks.apiClient.getAllReleases('owner', 'repo', {
        includePrerelease: false,
      });
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tag_name).toBe('v2.0.0');
    });
  });

  describe('getLatestReleaseTags', () => {
    it('should return tag names from releases', async () => {
      const allReleasesFixture = await import('./fixtures/allReleasesPage1.json');
      mocks.mockDownloader.download.mockResolvedValue(
        Buffer.from(JSON.stringify(allReleasesFixture.default)),
      );

      const tags = await mocks.apiClient.getLatestReleaseTags('Codeberg', 'pages-server', 3);
      expect(tags).toEqual(['v6.4', 'v6.3', 'v6.2.1']);
    });

    it('should return empty array on error', async () => {
      mocks.mockDownloader.download.mockRejectedValue(new Error('Network error'));

      const tags = await mocks.apiClient.getLatestReleaseTags('Codeberg', 'pages-server');
      expect(tags).toEqual([]);
    });
  });

  describe('caching', () => {
    it('should return cached data when available', async () => {
      const cachedMocks = setupMockGiteaApiClient({ cacheEnabled: true });
      const cachedRelease: IGitHubRelease = {
        id: 1,
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        draft: false,
        prerelease: false,
        created_at: '2025-01-01T00:00:00Z',
        published_at: '2025-01-01T00:00:00Z',
        assets: [],
        html_url: 'https://codeberg.org/owner/repo/releases/tag/v1.0.0',
      };

      cachedMocks.mockCache.get.mockResolvedValue(cachedRelease);

      const release = await cachedMocks.apiClient.getLatestRelease('owner', 'repo');
      expect(release).toEqual(cachedRelease);
      expect(cachedMocks.mockDownloader.download).not.toHaveBeenCalled();
    });

    it('should cache responses when cache is enabled', async () => {
      const cachedMocks = setupMockGiteaApiClient({ cacheEnabled: true });
      cachedMocks.mockCache.get.mockResolvedValue(null);
      cachedMocks.mockDownloader.download.mockResolvedValue(
        Buffer.from(JSON.stringify(latestReleaseFixture)),
      );

      await cachedMocks.apiClient.getLatestRelease('Codeberg', 'pages-server');
      expect(cachedMocks.mockCache.set).toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    it('should include token in headers when configured', async () => {
      const authedMocks = setupMockGiteaApiClient({ token: 'test-token-123' });
      authedMocks.mockDownloader.download.mockResolvedValue(
        Buffer.from(JSON.stringify(latestReleaseFixture)),
      );

      await authedMocks.apiClient.getLatestRelease('Codeberg', 'pages-server');
      expect(authedMocks.mockDownloader.download).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {
          headers: {
            Accept: 'application/json',
            Authorization: 'token test-token-123',
          },
        },
      );
    });
  });
});
