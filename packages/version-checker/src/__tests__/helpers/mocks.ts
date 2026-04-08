import type { IGitHubRelease } from "@dotfiles/core";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import { mock } from "bun:test";

// Mock IGitHubApiClient
export class MockGitHubApiClient implements IGitHubApiClient {
  getLatestRelease = mock(async (owner: string, repo: string): Promise<IGitHubRelease | null> => {
    // Default behavior for an unconfigured call should be to throw,
    // as resolving with a generic IGitHubRelease might hide issues.
    // Tests should explicitly mockResolvedValueOnce or mockRejectedValueOnce.
    throw new Error(
      `MockGitHubApiClient.getLatestRelease was called for ${owner}/${repo} but not mocked for this specific test case.`,
    );
  });

  getReleaseByTag = mock(async (_owner: string, _repo: string, _tag: string): Promise<IGitHubRelease | null> => {
    return null;
  });

  getAllReleases = mock(async (_owner: string, _repo: string): Promise<IGitHubRelease[]> => {
    return [];
  });

  getRateLimit = mock(async () => {
    // Return a structure matching IGitHubRateLimit from '../../types.ts'
    return {
      limit: 5000,
      remaining: 5000,
      reset: Math.floor(Date.now() / 1000) + 3600,
      used: 0, // Added to match updated IGitHubRateLimit type
      resource: "core", // Added to match updated IGitHubRateLimit type
    };
  });

  getReleaseByConstraint = mock(
    async (owner: string, repo: string, constraint: string): Promise<IGitHubRelease | null> => {
      // Default behavior for an unconfigured call should be to throw or return null
      // depending on typical usage. For VersionChecker, this method isn't directly used,
      // so throwing an error if called without a specific mock is safer.
      throw new Error(
        `MockGitHubApiClient.getReleaseByConstraint was called for ${owner}/${repo} with constraint ${constraint} but not mocked for this specific test case.`,
      );
    },
  );

  probeLatestTag = mock(async (_owner: string, _repo: string): Promise<string | null> => {
    return null;
  });

  getLatestReleaseTags = mock(async (_owner: string, _repo: string, _count?: number): Promise<string[]> => {
    return [];
  });
}
