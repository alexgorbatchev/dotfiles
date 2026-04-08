/**
 * Represents the rate limit information returned by the GitHub API.
 *
 * This interface helps in understanding the current API usage status and when
 * the limits will reset, allowing clients to behave respectfully and avoid
 * being blocked.
 *
 * @see https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting
 */
export interface IGitHubRateLimit {
  /** The maximum number of requests allowed in the current rate limit window. */
  limit: number;
  /** The number of requests remaining in the current window. */
  remaining: number;
  /** The Unix timestamp (in seconds since the epoch) when the current window resets. */
  reset: number;
  /** The number of requests that have been used in the current window. */
  used: number;
  /** The resource category to which this rate limit applies (e.g., 'core', 'search'). */
  resource: string;
}

/**
 * Represents an asset associated with a GitHub Release.
 *
 * This typically includes compiled binaries, source code archives, or other
 * distributable files. The structure is based on the GitHub API response for
 * release assets.
 *
 * @see https://docs.github.com/en/rest/releases/assets#get-a-release-asset
 */
export interface IGitHubReleaseAsset {
  /** The name of the asset file (e.g., `mytool-linux-amd64.tar.gz`). */
  name: string;
  /** The direct URL for downloading the asset. */
  browser_download_url: string;
  /** The size of the asset in bytes. */
  size: number;
  /** The MIME type of the asset (e.g., `application/gzip`). */
  content_type: string;
  /** The state of the asset, typically 'uploaded'. */
  state: "uploaded" | "open";
  /** The number of times this asset has been downloaded. */
  download_count: number;
  /** An ISO 8601 timestamp string for when the asset was created. */
  created_at: string;
  /** An ISO 8601 timestamp string for when the asset was last updated. */
  updated_at: string;
}

/**
 * Represents a GitHub Release, including its metadata and associated assets.
 *
 * This structure is based on the GitHub API response for a single release.
 *
 * @see https://docs.github.com/en/rest/releases/releases#get-a-release
 */
export interface IGitHubRelease {
  /** The unique identifier for the release. */
  id: number;
  /** The tag name associated with the release (e.g., `v1.0.0`). */
  tag_name: string;
  /** The display name of the release (e.g., `Version 1.0.0`). */
  name: string;
  /** `true` if the release is a draft (unpublished); `false` otherwise. */
  draft: boolean;
  /** `true` if the release is marked as a pre-release; `false` otherwise. */
  prerelease: boolean;
  /** An ISO 8601 timestamp string for when the release was created. */
  created_at: string;
  /** An ISO 8601 timestamp string for when the release was published. Can be `null` for drafts. */
  published_at: string;
  /** An array of {@link IGitHubReleaseAsset} objects associated with this release. */
  assets: IGitHubReleaseAsset[];
  /** The release notes or description, often in Markdown format. */
  body?: string;
  /** The URL to view this release on the GitHub website. */
  html_url: string;
}
