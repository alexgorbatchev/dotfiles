/**
 * @file src/types/githubApi.types.ts
 * @description Types related to the GitHub API.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for the GitHub API.
 * - [x] Add JSDoc comments to all types and properties.
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
 * Represents the rate limit information returned by the GitHub API.
 * This helps in understanding the current API usage status and when limits reset.
 * @see https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting
 */
export interface GitHubRateLimit {
  /** The maximum number of requests allowed in the current rate limit window. */
  limit: number;
  /** The number of requests remaining in the current rate limit window. */
  remaining: number;
  /** The Unix timestamp (seconds since epoch) indicating when the current rate limit window resets. */
  reset: number;
  /** The number of requests used in the current rate limit window. */
  used: number;
  /** The resource category for which this rate limit applies (e.g., 'core', 'search'). */
  resource: string;
}

/**
 * Represents an asset associated with a GitHub Release.
 * This typically includes compiled binaries, source code archives, or other distributable files.
 * The structure is based on the GitHub API response for release assets.
 * @see https://docs.github.com/en/rest/releases/assets#get-a-release-asset
 */
export interface GitHubReleaseAsset {
  /** The name of the asset file (e.g., `mytool-linux-amd64.tar.gz`). */
  name: string;
  /** The direct URL to download the asset. */
  browser_download_url: string;
  /** The size of the asset in bytes. */
  size: number;
  /** The MIME type of the asset (e.g., `application/gzip`). */
  content_type: string;
  /** The state of the asset, typically 'uploaded'. */
  state: 'uploaded' | 'open';
  /** The number of times this asset has been downloaded. */
  download_count: number;
  /** An ISO 8601 timestamp string for when the asset was created. */
  created_at: string;
  /** An ISO 8601 timestamp string for when the asset was last updated. */
  updated_at: string;
}

/**
 * Represents a GitHub Release, including its metadata and associated assets.
 * This structure is based on the GitHub API response for releases.
 * @see https://docs.github.com/en/rest/releases/releases#get-a-release
 */
export interface GitHubRelease {
  /** The unique identifier for the release. */
  id: number;
  /** The tag name associated with the release (e.g., `v1.0.0`). */
  tag_name: string;
  /** The display name of the release (e.g., `Version 1.0.0`). */
  name: string;
  /** `true` if the release is a draft (unpublished), `false` otherwise. */
  draft: boolean;
  /** `true` if the release is marked as a pre-release, `false` otherwise. */
  prerelease: boolean;
  /** An ISO 8601 timestamp string for when the release was created. */
  created_at: string;
  /** An ISO 8601 timestamp string for when the release was published. Can be null for drafts. */
  published_at: string;
  /** An array of {@link GitHubReleaseAsset} objects associated with this release. */
  assets: GitHubReleaseAsset[];
  /** The release notes or description, often in Markdown format. */
  body?: string;
  /** The URL to view this release on GitHub. */
  html_url: string;
}

/**
 * Defines the contract for a client that interacts with the GitHub API.
 * Implementations of this interface are responsible for fetching release information,
 * handling authentication, and managing rate limits.
 */
export interface IGitHubApiClient {
  /**
   * Fetches the latest published release for a given repository.
   * @param owner The owner of the repository (e.g., 'octocat').
   * @param repo The name of the repository (e.g., 'Spoon-Knife').
   * @returns A promise that resolves with the {@link GitHubRelease} object for the latest release.
   *          Throws an error if no releases are found or if the API request fails.
   */
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease>;

  /**
   * Fetches a specific release by its tag name for a given repository.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param tag The tag name of the release to fetch (e.g., 'v1.0.0').
   * @returns A promise that resolves with the {@link GitHubRelease} object for the specified tag.
   *          Throws an error if the release is not found or if the API request fails.
   */
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease>;

  /**
   * Fetches all releases for a given repository, optionally paginated and filtered by pre-release status.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param options Optional parameters for pagination and filtering.
   * @param options.perPage The number of releases to fetch per page (max 100).
   * @param options.includePrerelease If `true`, pre-releases will be included in the results. Defaults to `false`.
   * @returns A promise that resolves with an array of {@link GitHubRelease} objects.
   */
  getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]>;

  /**
   * Fetches a release that satisfies a given version constraint (e.g., SemVer range).
   * This method typically involves fetching multiple releases and then finding the best match.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param constraint A version constraint string (e.g., `^1.2.3`, `~2.0.x`, `>=3.0.0 <4.0.0`).
   * @returns A promise that resolves with the {@link GitHubRelease} object that best matches the constraint,
   *          or `null` if no matching release is found.
   */
  getReleaseByConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null>;

  /**
   * Fetches the current rate limit status from the GitHub API.
   * @returns A promise that resolves with a {@link GitHubRateLimit} object.
   */
  getRateLimit(): Promise<GitHubRateLimit>;
}
