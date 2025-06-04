/**
 * @file IGitHubApiClient.ts
 * @description Defines the interface for the GitHub API client.
 *
 * ## Development Plan
 *
 * - [x] Define `GitHubRateLimit`, `GitHubReleaseAsset`, `GitHubRelease` types (or ensure importable from `../../types.ts`)
 * - [x] Define `IGitHubApiClient` interface:
 *   - [x] `getLatestRelease(owner: string, repo: string): Promise<GitHubRelease>`
 *   - [x] `getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease>`
 *   - [x] `getAllReleases(owner: string, repo: string, options?: { perPage?: number; includePrerelease?: boolean }): Promise<GitHubRelease[]>`
 *   - [x] `getReleaseByConstraint(owner: string, repo: string, constraint: string): Promise<GitHubRelease | null>`
 *   - [x] `getRateLimit(): Promise<GitHubRateLimit>`
 * - [x] Implement `GitHubApiClient.ts` that implements `IGitHubApiClient`.
 * - [x] Write tests for `GitHubApiClient.ts` using `bun:test`'s `mock` (not `fetch-mock`).
 *   - [x] Test `getLatestRelease`
 *   - [x] Test `getReleaseByTag`
 *   - [x] Test `getAllReleases` (including pagination and prerelease options)
 *   - [x] Test `getReleaseByConstraint` (various constraint types, 'latest' for now)
 *   - [x] Test `getRateLimit`
 *   - [x] Test API error handling (404, 403, etc.)
 *   - [x] Test rate limit parsing and error handling.
 * - [ ] Implement caching for API responses (optional, consider for future enhancement if not in initial scope).
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { GitHubRateLimit, GitHubRelease, GitHubReleaseAsset } from '../../types';

/**
 * Interface for a client that interacts with the GitHub API.
 */
export interface IGitHubApiClient {
  /**
   * Fetches the latest release for a given repository.
   * Zinit uses: https://api.github.com/repos/{owner}/{repo}/releases/latest
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @returns A promise that resolves to the latest GitHub release.
   */
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease>;

  /**
   * Fetches a specific release by tag name.
   * Zinit uses: https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param tag The tag name of the release.
   * @returns A promise that resolves to the GitHub release.
   */
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease>;

  /**
   * Fetches all releases for a given repository.
   * Handles pagination.
   * Zinit uses: https://api.github.com/repos/{owner}/{repo}/releases
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param options Optional parameters for fetching releases.
   * @param options.perPage Number of results per page (max 100).
   * @param options.includePrerelease Whether to include pre-releases.
   * @returns A promise that resolves to an array of GitHub releases.
   */
  getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]>;

  /**
   * Fetches a release that satisfies a given version constraint (e.g., "v1.2.x", "^2.0.0").
   * This might involve fetching all releases and then filtering.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param constraint The version constraint string.
   * @returns A promise that resolves to the matching GitHub release or null if not found.
   */
  getReleaseByConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null>;

  /**
   * Fetches the current rate limit status from the GitHub API.
   * @returns A promise that resolves to the GitHub rate limit information.
   */
  getRateLimit(): Promise<GitHubRateLimit>;
}
