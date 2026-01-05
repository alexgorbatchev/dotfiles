import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { IGitHubRelease } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import type { IGitHubApiClient } from '../github-client';
import { fetchGitHubRelease } from '../installFromGitHubRelease';

describe('fetchGitHubRelease', () => {
  let logger: TestLogger;
  let mockGitHubApiClient: IGitHubApiClient;

  const createMockRelease = (tagName: string): IGitHubRelease => {
    const release: IGitHubRelease = {
      id: 1,
      tag_name: tagName,
      name: `Release ${tagName}`,
      draft: false,
      prerelease: false,
      created_at: '2024-01-01T00:00:00Z',
      published_at: '2024-01-01T00:00:00Z',
      assets: [],
      html_url: `https://github.com/owner/repo/releases/tag/${tagName}`,
      body: 'Release notes',
    };
    return release;
  };

  beforeEach(() => {
    logger = new TestLogger();
    mockGitHubApiClient = {
      getLatestRelease: mock(async () => null),
      getReleaseByTag: mock(async () => null),
      getAllReleases: mock(async () => []),
      getReleaseByConstraint: mock(async () => null),
      getRateLimit: mock(async () => ({ limit: 5000, remaining: 5000, reset: 0, used: 0, resource: 'core' })),
      probeLatestTag: mock(async () => null),
      getLatestReleaseTags: mock(async () => []),
    };
  });

  describe('invalid repo format', () => {
    it('should return error for invalid repo format', async () => {
      const result = await fetchGitHubRelease('invalid-repo', '1.0.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid GitHub repository format');
      }
    });
  });

  describe('latest version', () => {
    it('should fetch latest release when version is "latest"', async () => {
      const mockRelease = createMockRelease('v1.0.0');
      mockGitHubApiClient.getLatestRelease = mock(async () => mockRelease);

      const result = await fetchGitHubRelease('owner/repo', 'latest', mockGitHubApiClient, logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tag_name).toBe('v1.0.0');
      }
    });

    it('should return error when latest release is not found', async () => {
      mockGitHubApiClient.getLatestRelease = mock(async () => null);

      const result = await fetchGitHubRelease('owner/repo', 'latest', mockGitHubApiClient, logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to fetch latest release');
      }
    });
  });

  describe('specific version', () => {
    it('should fetch release by exact tag when found', async () => {
      const mockRelease = createMockRelease('v2.23.0');
      mockGitHubApiClient.getReleaseByTag = mock(async () => mockRelease);

      const result = await fetchGitHubRelease('owner/repo', 'v2.23.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tag_name).toBe('v2.23.0');
      }
    });
  });

  describe('tag pattern detection', () => {
    it('should detect v prefix and correct tag', async () => {
      // First call (with user version "2.23.0") returns null
      // Second call (with corrected "v2.23.0") returns the release
      const mockRelease = createMockRelease('v2.23.0');
      const getReleaseByTagMock = mock(async (_owner: string, _repo: string, tag: string) => {
        if (tag === 'v2.23.0') {
          return mockRelease;
        }
        return null;
      });
      mockGitHubApiClient.getReleaseByTag = getReleaseByTagMock;
      mockGitHubApiClient.probeLatestTag = mock(async () => 'v2.24.0');

      const result = await fetchGitHubRelease('owner/repo', '2.23.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tag_name).toBe('v2.23.0');
      }
      // Verify log message about corrected tag
      logger.expect(
        ['INFO'],
        ['fetchGitHubRelease', 'fetchWithTagPatternDetection'],
        [],
        [/Found release with corrected tag 'v2.23.0'/]
      );
    });

    it('should detect tool-name prefix and correct tag', async () => {
      // User requests "1.7.0", repo uses "jq-1.8.1" pattern
      const mockRelease = createMockRelease('jq-1.7.0');
      const getReleaseByTagMock = mock(async (_owner: string, _repo: string, tag: string) => {
        if (tag === 'jq-1.7.0') {
          return mockRelease;
        }
        return null;
      });
      mockGitHubApiClient.getReleaseByTag = getReleaseByTagMock;
      mockGitHubApiClient.probeLatestTag = mock(async () => 'jq-1.8.1');

      const result = await fetchGitHubRelease('jqlang/jq', '1.7.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tag_name).toBe('jq-1.7.0');
      }
    });

    it('should strip user v prefix when repo uses no prefix', async () => {
      // User requests "v15.0.0", repo uses "15.1.0" pattern (no prefix)
      const mockRelease = createMockRelease('15.0.0');
      const getReleaseByTagMock = mock(async (_owner: string, _repo: string, tag: string) => {
        if (tag === '15.0.0') {
          return mockRelease;
        }
        return null;
      });
      mockGitHubApiClient.getReleaseByTag = getReleaseByTagMock;
      mockGitHubApiClient.probeLatestTag = mock(async () => '15.1.0');

      const result = await fetchGitHubRelease('BurntSushi/ripgrep', 'v15.0.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tag_name).toBe('15.0.0');
      }
    });
  });

  describe('show available tags on failure', () => {
    it('should show available tags when release is not found', async () => {
      mockGitHubApiClient.getReleaseByTag = mock(async () => null);
      mockGitHubApiClient.probeLatestTag = mock(async () => null);
      mockGitHubApiClient.getLatestReleaseTags = mock(async () => ['v2.24.0', 'v2.23.0', 'v2.22.0']);

      const result = await fetchGitHubRelease('owner/repo', 'invalid-tag', mockGitHubApiClient, logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Release 'invalid-tag' not found");
      }
      // Verify available tags are logged (header + 3 tags)
      logger.expect(
        ['INFO'],
        ['fetchGitHubRelease', 'showAvailableReleaseTags'],
        [],
        [/Available release tags/, /v2\.24\.0/, /v2\.23\.0/, /v2\.22\.0/]
      );
    });

    it('should show error when no tags are available', async () => {
      mockGitHubApiClient.getReleaseByTag = mock(async () => null);
      mockGitHubApiClient.probeLatestTag = mock(async () => null);
      mockGitHubApiClient.getLatestReleaseTags = mock(async () => []);

      const result = await fetchGitHubRelease('owner/repo', 'invalid-tag', mockGitHubApiClient, logger);

      expect(result.success).toBe(false);
      // Should show error about no release tags
      logger.expect(
        ['ERROR'],
        ['fetchGitHubRelease', 'showAvailableReleaseTags'],
        [],
        [/No release tags available/]
      );
    });
  });

  describe('tag detection failure scenarios', () => {
    it('should fail gracefully when probeLatestTag returns null', async () => {
      mockGitHubApiClient.getReleaseByTag = mock(async () => null);
      mockGitHubApiClient.probeLatestTag = mock(async () => null);
      mockGitHubApiClient.getLatestReleaseTags = mock(async () => ['v1.0.0']);

      const result = await fetchGitHubRelease('owner/repo', '2.0.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(false);
    });

    it('should fail when corrected tag also does not exist', async () => {
      // User requests "2.0.0", but even with v prefix it doesn't exist
      mockGitHubApiClient.getReleaseByTag = mock(async () => null);
      mockGitHubApiClient.probeLatestTag = mock(async () => 'v1.0.0');
      mockGitHubApiClient.getLatestReleaseTags = mock(async () => ['v1.0.0', 'v0.9.0']);

      const result = await fetchGitHubRelease('owner/repo', '2.0.0', mockGitHubApiClient, logger);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Release '2.0.0' not found");
      }
    });
  });
});
