import type { BaseInstallParams, IGitHubRelease, IGitHubReleaseAsset, IInstallContext } from "@dotfiles/core";
import { baseInstallParamsSchema } from "@dotfiles/core";
import { z } from "zod";
import { type AssetPattern, isValidAssetPatternString } from "../matchAssetPattern";

/**
 * Context object for asset selection functions.
 */
export interface IGiteaAssetSelectionContext extends IInstallContext {
  assets: IGitHubReleaseAsset[];
  release: IGitHubRelease;
  assetPattern?: AssetPattern;
}

/**
 * Asset selector function signature.
 */
export type GiteaAssetSelector = (context: IGiteaAssetSelectionContext) => IGitHubReleaseAsset | undefined;

export const giteaReleaseInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The base URL of the Gitea/Forgejo instance (e.g., `https://codeberg.org`).
   */
  instanceUrl: z.string().url("instanceUrl must be a valid URL"),
  /**
   * The repository in "owner/repo" format (e.g., `Codeberg/pages-server`).
   */
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Repository must be in "owner/repo" format'),
  /**
   * A glob pattern or regular expression string used to match the desired asset filename.
   */
  assetPattern: z
    .union([
      z.string().refine(isValidAssetPatternString, "assetPattern must be a valid glob or a regex string like /.../"),
      z.instanceof(RegExp),
    ])
    .optional(),
  /**
   * A specific version string (e.g., `v1.2.3`, `0.48.0`) for the release to target.
   * If omitted, the latest stable release is targeted.
   */
  version: z.string().optional(),
  /**
   * A custom function to select the desired asset from available release assets.
   */
  assetSelector: z.custom<GiteaAssetSelector>((val) => typeof val === "function", "Must be a function").optional(),
  /**
   * When true, includes prerelease versions when fetching the latest release.
   */
  prerelease: z.boolean().optional(),
  /**
   * Optional API token for authentication with the Gitea instance.
   */
  token: z.string().optional(),
});

/**
 * Parameters for installing a tool from a Gitea/Forgejo release.
 */
export interface IGiteaReleaseInstallParams extends BaseInstallParams {
  instanceUrl: string;
  repo: string;
  assetPattern?: string | RegExp;
  version?: string;
  assetSelector?: GiteaAssetSelector;
  prerelease?: boolean;
  token?: string;
}

export type GiteaReleaseInstallParams = IGiteaReleaseInstallParams;
