import type {
  BaseInstallParams,
  BaseToolContext,
  GitHubRelease,
  GitHubReleaseAsset,
  SystemInfo,
  ToolConfig,
} from '@dotfiles/core';
import { baseInstallParamsSchema } from '@dotfiles/core';
import { z } from 'zod';

/**
 * Context object for asset selection functions.
 * Provides consistent interface with install hooks, including access to
 * system information, logging, tool configuration, and release data.
 */
export interface AssetSelectionContext extends BaseToolContext {
  /** Available release assets to choose from */
  assets: GitHubReleaseAsset[];
  /** System information for platform/architecture matching */
  systemInfo: SystemInfo;
  /** The GitHub release being processed */
  release: GitHubRelease;
  /** The tool configuration being processed */
  toolConfig: ToolConfig;
  /** Asset pattern from configuration (if provided) */
  assetPattern?: string;
}

/**
 * Asset selector function signature using context object.
 * Receives rich context object for consistent interface with install hooks.
 *
 * @param context - Complete context including assets, system info, logger, and configuration
 * @returns Selected asset or undefined if no suitable asset found
 *
 * @example
 * ```typescript
 * const assetSelector: AssetSelector = (context) => {
 *   context.logger.debug('Selecting asset for', context.toolName);
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
export type AssetSelector = (context: AssetSelectionContext) => GitHubReleaseAsset | undefined;

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
  assetPattern: z.string().optional(),

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
   * If `true`, pre-releases will be considered when searching for the specified `version` or the latest release.
   * @default false
   */
  includePrerelease: z.boolean().optional(),
  /**
   * An optional custom function to select the desired asset from a list of available assets for a release.
   * This provides more fine-grained control than `assetPattern` for complex selection logic.
   *
   * Uses context-based signature: `(context: AssetSelectionContext) => GitHubReleaseAsset | undefined`
   */
  assetSelector: z.custom<AssetSelector>((val) => typeof val === 'function', 'Must be a function').optional(),
  /** Custom GitHub host URL for GitHub Enterprise installations */
  githubHost: z.string().url().optional(),
});

/**
 * Parameters for installing a tool from a GitHub Release.
 * This method involves fetching release information from GitHub, downloading a release asset,
 * extracting it (if it's an archive), and then locating/moving the binary.
 * This is analogous to Zinit's `from"gh-r"` ice.
 */
type GithubReleaseSchemaParams = z.infer<typeof githubReleaseInstallParamsSchema>;

export interface GithubReleaseInstallParams extends BaseInstallParams {
  repo: GithubReleaseSchemaParams['repo'];
  assetPattern?: GithubReleaseSchemaParams['assetPattern'];
  version?: GithubReleaseSchemaParams['version'];
  includePrerelease?: GithubReleaseSchemaParams['includePrerelease'];
  assetSelector?: GithubReleaseSchemaParams['assetSelector'];
  githubHost?: GithubReleaseSchemaParams['githubHost'];
}
