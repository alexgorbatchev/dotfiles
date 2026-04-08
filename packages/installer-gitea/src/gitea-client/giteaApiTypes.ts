import type { IGitHubReleaseAsset } from "@dotfiles/core";

/**
 * Gitea/Forgejo release asset as returned by the API.
 * Contains additional fields not present in the GitHub API response.
 */
export interface IGiteaReleaseAsset {
  id: number;
  name: string;
  size: number;
  download_count: number;
  created_at: string;
  uuid: string;
  browser_download_url: string;
  type: string;
}

/**
 * Gitea/Forgejo release as returned by the API.
 * The structure is similar to GitHub releases but with some differences.
 */
export interface IGiteaRelease {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string;
  body?: string;
  url: string;
  html_url: string;
  tarball_url: string;
  zipball_url: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  author: {
    id: number;
    login: string;
  };
  assets: IGiteaReleaseAsset[];
}

/**
 * Maps a Gitea release asset to the shared IGitHubReleaseAsset format.
 */
export function mapGiteaAsset(asset: IGiteaReleaseAsset): IGitHubReleaseAsset {
  const result: IGitHubReleaseAsset = {
    name: asset.name,
    browser_download_url: asset.browser_download_url,
    size: asset.size,
    content_type: "application/octet-stream",
    state: "uploaded",
    download_count: asset.download_count,
    created_at: asset.created_at,
    updated_at: asset.created_at,
  };
  return result;
}
