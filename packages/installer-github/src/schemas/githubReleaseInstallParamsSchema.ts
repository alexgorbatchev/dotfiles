import type { BaseInstallParams, IGitHubRelease, IGitHubReleaseAsset, IInstallContext } from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';
import { type AssetPattern, isValidAssetPatternString } from '../matchAssetPattern';

/**
 * Context object for asset selection functions.
 * Provides consistent interface with install hooks, including access to
 * system information, logging, tool configuration, and release data.
 */
export interface IAssetSelectionContext extends IInstallContext {
  /** Available release assets to choose from */
  assets: IGitHubReleaseAsset[];
  /** The GitHub release being processed */
  release: IGitHubRelease;
  /** Asset pattern from configuration (if provided) */
  assetPattern?: AssetPattern;
}

/**
 * Asset selector function signature using context object.
 * Receives rich context object for consistent interface with install hooks.
 *
 * @param context - Complete context including assets, system info, log, and configuration
 * @returns Selected asset or undefined if no suitable asset found
 *
 * @example
 * ```typescript
 * const assetSelector: AssetSelector = (context) => {
 *   context.log.debug('Selecting asset for ' + context.toolName);
 *
 *   const { assets, systemInfo } = context;
 *   const osMap = { 'darwin': 'macos', 'linux': 'linux', 'win32': 'windows' };
 *   const archMap = { 'x64': 'amd64', 'arm64': 'arm64' };
 *
 *   const osKey = osMap[systemInfo.platform];
 *   const archKey = archMap[systemInfo.arch];
 *
 *   return assets.find(asset =>
 *     asset.name.toLowerCase().includes(osKey) &&
 *     asset.name.toLowerCase().includes(archKey) &&
 *     asset.name.endsWith('.tar.gz')
 *   );
 * };
 * ```
 */
export type AssetSelector = (context: IAssetSelectionContext) => IGitHubReleaseAsset | undefined;

export const githubReleaseInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * The GitHub repository in "owner/repo" format (e.g., `junegunn/fzf`).
   * Corresponds to the main argument for Zinit's `from"gh-r"`.
   */
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Repository must be in "owner/repo" format'),
  /**
   * A glob pattern or regular expression string used to match the desired asset filename within a GitHub Release.
   * This helps select the correct file if a release has multiple assets (e.g., for different OS/architectures).
   * Example: `*linux_amd64.tar.gz` or `/fzf-.*-linux_amd64\.tar\.gz/`.
   * If `assetSelector` is provided, this pattern might be used by it or ignored.
   * Similar to Zinit's `bpick'{pattern}'` ice.
   * @example Zinit `bpick`:
   * ```zsh
   * zinit ice from"gh-r" bpick"*linux_amd64.tar.gz"
   * zinit light "sharkdp/bat"
   * ```
   */
  assetPattern: z
    .union([
      z.string().refine(isValidAssetPatternString, 'assetPattern must be a valid glob or a regex string like /.../'),
      z.instanceof(RegExp),
    ])
    .optional(),

  /**
   * A specific version string (e.g., `v1.2.3`, `0.48.0`) or a SemVer constraint
   * (e.g., `^1.0.0`, `~2.3.x`) for the release to target.
   * If omitted, the latest stable release is typically targeted.
   * Similar to Zinit's `ver'{version_tag}'` ice.
   * @example Zinit `ver`:
   * ```zsh
   * zinit ice ver"v1.2.3" from"gh-r"
   * zinit light "user/mycli"
   * ```
   */
  version: z.string().optional(),
  /**
   * An optional custom function to select the desired asset from a list of available assets for a release.
   * This provides more fine-grained control than `assetPattern` for complex selection logic.
   *
   * Uses context-based signature: `(context: IAssetSelectionContext) => IGitHubReleaseAsset | undefined`
   */
  assetSelector: z.custom<AssetSelector>((val) => typeof val === 'function', 'Must be a function').optional(),
  /**
   * When true, uses the `gh` CLI for GitHub API requests instead of direct fetch.
   * This is useful when:
   * - Working behind corporate proxies that `gh` handles better
   * - Leveraging existing `gh` authentication
   * - Avoiding rate limits (gh uses authenticated requests by default)
   *
   * Requires the `gh` CLI to be installed and authenticated.
   * Uses the same caching mechanism as the fetch-based client.
   *
   * @default false
   * @example
   * ```typescript
   * install('github-release', {
   *   repo: 'junegunn/fzf',
   *   ghCli: true,
   * }).bin('fzf')
   * ```
   */
  ghCli: z.boolean().optional(),
});

/**
 * Parameters for installing a tool from a GitHub Release.
 *
 * NOTE: This is an explicit interface (not z.infer) to ensure TypeScript fully resolves
 * the property names, which is required for proper `keyof` behavior in declaration files.
 */
export interface GithubReleaseInstallParams extends BaseInstallParams {
  /**
   * The GitHub repository in "owner/repo" format (e.g., `junegunn/fzf`).
   */
  repo: string;
  /**
   * A glob pattern or regular expression used to match the desired asset filename.
   * Example: `*linux_amd64.tar.gz` or `/fzf-.*-linux_amd64\.tar\.gz/`.
   */
  assetPattern?: string | RegExp;
  /**
   * A specific version string (e.g., `v1.2.3`, `0.48.0`) or a SemVer constraint.
   */
  version?: string;
  /**
   * A custom function to select the desired asset from available release assets.
   */
  assetSelector?: AssetSelector;
}
