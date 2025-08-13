import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { GitHubRelease, IGitHubApiClient } from '@modules/github-client';
import { GitHubApiClientError } from '@modules/github-client';
import { TestLogger } from '@testing-helpers';
import { VersionComparisonStatus } from '../IVersionChecker.ts';
import { VersionChecker } from '../VersionChecker.ts';

// Mock IGitHubApiClient
class MockGitHubApiClient implements IGitHubApiClient {
  getLatestRelease = mock(async (owner: string, repo: string): Promise<GitHubRelease | null> => {
    // Default behavior for an unconfigured call should be to throw,
    // as resolving with a generic GitHubRelease might hide issues.
    // Tests should explicitly mockResolvedValueOnce or mockRejectedValueOnce.
    throw new Error(
      `MockGitHubApiClient.getLatestRelease was called for ${owner}/${repo} but not mocked for this specific test case.`
    );
  });

  getReleaseByTag = mock(async (_owner: string, _repo: string, _tag: string): Promise<GitHubRelease | null> => {
    return null;
  });

  getAllReleases = mock(async (_owner: string, _repo: string): Promise<GitHubRelease[]> => {
    return [];
  });

  getRateLimit = mock(async () => {
    // Return a structure matching GitHubRateLimit from '../../types.ts'
    return {
      limit: 5000,
      remaining: 5000,
      reset: Math.floor(Date.now() / 1000) + 3600,
      used: 0, // Added to match updated GitHubRateLimit type
      resource: 'core', // Added to match updated GitHubRateLimit type
    };
  });

  getReleaseByConstraint = mock(
    async (owner: string, repo: string, constraint: string): Promise<GitHubRelease | null> => {
      // Default behavior for an unconfigured call should be to throw or return null
      // depending on typical usage. For VersionChecker, this method isn't directly used,
      // so throwing an error if called without a specific mock is safer.
      throw new Error(
        `MockGitHubApiClient.getReleaseByConstraint was called for ${owner}/${repo} with constraint ${constraint} but not mocked for this specific test case.`
      );
    }
  );
}

describe('VersionChecker', () => {
  let mockGithubClient: MockGitHubApiClient;
  let versionChecker: VersionChecker;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    mockGithubClient = new MockGitHubApiClient();
    versionChecker = new VersionChecker(logger, mockGithubClient);
  });

  describe('getLatestToolVersion', () => {
    it('should return the latest version string from GitHub', async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce({
        tag_name: '1.2.3',
        assets: [],
        body: '',
        name: '',
        html_url: '',
        published_at: '',
        prerelease: false,
        id: 0,
        created_at: '',
        draft: false,
      });
      const version = await versionChecker.getLatestToolVersion('owner', 'repo');
      expect(version).toBe('1.2.3');
      expect(mockGithubClient.getLatestRelease).toHaveBeenCalledWith('owner', 'repo');
    });

    it('should remove "v" prefix from the version string', async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce({
        tag_name: 'v0.5.0',
        assets: [],
        body: '',
        name: '',
        html_url: '',
        published_at: '',
        prerelease: false,
        id: 0,
        created_at: '',
        draft: false,
      });
      const version = await versionChecker.getLatestToolVersion('owner', 'repo');
      expect(version).toBe('0.5.0');
    });

    it('should return null if GitHub client returns release with no tag_name', async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce({
        // Testing invalid state - release without tag_name
        tag_name: '' as string, // Empty string instead of undefined
        assets: [],
        body: '',
        name: '',
        html_url: '',
        published_at: '',
        prerelease: false,
        id: 0,
        created_at: '',
        draft: false,
      });
      const version = await versionChecker.getLatestToolVersion('owner', 'repo');
      expect(version).toBeNull();
    });

    it('should return null if GitHub client returns null (404 error)', async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce(null);
      const version = await versionChecker.getLatestToolVersion('owner', 'repo');
      expect(version).toBeNull();
    });

    it('should return null if GitHub client throws an error', async () => {
      mockGithubClient.getLatestRelease.mockRejectedValueOnce(new GitHubApiClientError('API Error', 500));
      const version = await versionChecker.getLatestToolVersion('owner', 'repo');
      expect(version).toBeNull();
    });
  });

  describe('checkVersionStatus', () => {
    it('should return NEWER_AVAILABLE if latest is greater', async () => {
      const status = await versionChecker.checkVersionStatus('1.0.0', '1.1.0');
      expect(status).toBe(VersionComparisonStatus.NEWER_AVAILABLE);
    });

    it('should return UP_TO_DATE if versions are equal', async () => {
      const status = await versionChecker.checkVersionStatus('1.0.0', '1.0.0');
      expect(status).toBe(VersionComparisonStatus.UP_TO_DATE);
    });

    it('should return AHEAD_OF_LATEST if current is greater', async () => {
      const status = await versionChecker.checkVersionStatus('1.1.0', '1.0.0');
      expect(status).toBe(VersionComparisonStatus.AHEAD_OF_LATEST);
    });

    it('should return INVALID_CURRENT_VERSION for invalid current version', async () => {
      const status = await versionChecker.checkVersionStatus('invalid', '1.0.0');
      expect(status).toBe(VersionComparisonStatus.INVALID_CURRENT_VERSION);
    });

    it('should return INVALID_LATEST_VERSION for invalid latest version', async () => {
      const status = await versionChecker.checkVersionStatus('1.0.0', 'invalid');
      expect(status).toBe(VersionComparisonStatus.INVALID_LATEST_VERSION);
    });

    it('should handle "v" prefix in currentVersion', async () => {
      const status = await versionChecker.checkVersionStatus('v1.0.0', '1.1.0');
      expect(status).toBe(VersionComparisonStatus.NEWER_AVAILABLE);
    });

    it('should handle "v" prefix in latestVersion', async () => {
      const status = await versionChecker.checkVersionStatus('1.0.0', 'v1.1.0');
      expect(status).toBe(VersionComparisonStatus.NEWER_AVAILABLE);
    });

    it('should handle "v" prefix in both versions', async () => {
      const status = await versionChecker.checkVersionStatus('v1.0.0', 'v1.0.0');
      expect(status).toBe(VersionComparisonStatus.UP_TO_DATE);
    });
  });
});
