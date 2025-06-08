/**
 * @file generator/src/types/githubApi.types.ts
 * @description Types related to the GitHub API.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for the GitHub API.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// GitHub API Types
// ============================================

/**
 * GitHub rate limit information
 */
export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  used: number;
  resource: string;
}

/**
 * Enhanced GitHub Release Asset with additional metadata
 */
export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
  state: 'uploaded' | 'open';
  download_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Enhanced GitHub Release with additional metadata
 */
export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: GitHubReleaseAsset[];
  body?: string; // Release notes
  html_url: string;
}

/**
 * Interface for the GitHub API client
 */
export interface IGitHubApiClient {
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease>;
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease>;
  getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]>;
  getReleaseByConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null>;
  getRateLimit(): Promise<GitHubRateLimit>;
}
