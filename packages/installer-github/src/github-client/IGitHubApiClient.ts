import type { IGitHubRateLimit, IGitHubRelease } from "@dotfiles/core";

/**
 * Interface for a client that interacts with the GitHub API.
 */
export interface IGitHubApiClient {
  /**
   * Fetches the latest release for a given repository.
   * Zinit uses: https://api.github.com/repos/{owner}/{repo}/releases/latest
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @returns A promise that resolves to the latest GitHub release, or null if not found.
   */
  getLatestRelease(owner: string, repo: string): Promise<IGitHubRelease | null>;

  /**
   * Fetches a specific release by tag name.
   * Zinit uses: https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param tag The tag name of the release.
   * @returns A promise that resolves to the GitHub release, or null if not found.
   */
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<IGitHubRelease | null>;

  /**
   * Fetches all releases for a given repository.
   * Handles pagination.
   * Zinit uses: https://api.github.com/repos/{owner}/{repo}/releases
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param options Optional parameters for fetching releases.
   * @param options.perPage Number of results per page (max 100).
   * @param options.includePrerelease Whether to include pre-releases.
   * @param options.limit Maximum total number of releases to fetch (stops pagination early).
   * @returns A promise that resolves to an array of GitHub releases.
   */
  getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean; limit?: number },
  ): Promise<IGitHubRelease[]>;

  /**
   * Fetches a release that satisfies a given version constraint (e.g., "v1.2.x", "^2.0.0").
   * This might involve fetching all releases and then filtering.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param constraint The version constraint string.
   * @returns A promise that resolves to the matching GitHub release or null if not found.
   */
  getReleaseByConstraint(owner: string, repo: string, constraint: string): Promise<IGitHubRelease | null>;

  /**
   * Fetches the current rate limit status from the GitHub API.
   * @returns A promise that resolves to the GitHub rate limit information.
   */
  getRateLimit(): Promise<IGitHubRateLimit>;

  /**
   * Probes the tag pattern used by a repository by checking the latest release redirect.
   * This uses a HEAD request to github.com (not the API), so it does NOT count against rate limits.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @returns A promise that resolves to the latest release tag name, or null if detection fails.
   */
  probeLatestTag(owner: string, repo: string): Promise<string | null>;

  /**
   * Fetches the tags from the most recent releases.
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param count The number of release tags to fetch (default: 5).
   * @returns A promise that resolves to an array of release tag names.
   */
  getLatestReleaseTags(owner: string, repo: string, count?: number): Promise<string[]>;

  /**
   * Downloads a release asset to a local path.
   * Optional method - only implemented by clients that support authenticated downloads
   * (e.g., gh CLI for private repos).
   *
   * @param owner The owner of the repository.
   * @param repo The name of the repository.
   * @param tag The release tag.
   * @param assetName The name of the asset to download.
   * @param destinationPath The local file path to save the asset.
   * @returns A promise that resolves when download is complete.
   * @throws Error if download fails.
   */
  downloadAsset?(owner: string, repo: string, tag: string, assetName: string, destinationPath: string): Promise<void>;
}
