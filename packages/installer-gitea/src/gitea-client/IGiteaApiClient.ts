import type { IGitHubRelease } from "@dotfiles/core";
import type { IGiteaReleaseQueryOptions } from "./types";

/**
 * Interface for a client that interacts with the Gitea/Forgejo API.
 * Uses the same IGitHubRelease types since the response shapes are compatible.
 */
export interface IGiteaApiClient {
  /**
   * Fetches the latest release for a given repository.
   * Uses: {instanceUrl}/api/v1/repos/{owner}/{repo}/releases/latest
   */
  getLatestRelease(owner: string, repo: string): Promise<IGitHubRelease | null>;

  /**
   * Fetches a specific release by tag name.
   * Uses: {instanceUrl}/api/v1/repos/{owner}/{repo}/releases/tags/{tag}
   */
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<IGitHubRelease | null>;

  /**
   * Fetches all releases for a given repository.
   * Uses: {instanceUrl}/api/v1/repos/{owner}/{repo}/releases?limit={limit}&page={page}
   */
  getAllReleases(owner: string, repo: string, options?: IGiteaReleaseQueryOptions): Promise<IGitHubRelease[]>;

  /**
   * Fetches the tags from the most recent releases.
   */
  getLatestReleaseTags(owner: string, repo: string, count?: number): Promise<string[]>;
}
