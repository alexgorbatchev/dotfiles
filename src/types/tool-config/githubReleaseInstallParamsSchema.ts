import { z } from 'zod';
import type { SystemInfo } from '../common.types';
import type { GitHubReleaseAsset } from '../githubApi.types';
import { baseInstallParamsSchema } from './baseInstallParamsSchema';

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
   */
  assetSelector: z
    .custom<(assets: GitHubReleaseAsset[], systemInfo: SystemInfo) => GitHubReleaseAsset | undefined>(
      (val) => typeof val === 'function',
      'Must be a function'
    )
    .optional(),
  /** Custom GitHub host URL for GitHub Enterprise installations */
  githubHost: z.string().url().optional(),
});

/**
 * Parameters for installing a tool from a GitHub Release.
 * This method involves fetching release information from GitHub, downloading a release asset,
 * extracting it (if it's an archive), and then locating/moving the binary.
 * This is analogous to Zinit's `from"gh-r"` ice.
 */
export type GithubReleaseInstallParams = z.infer<typeof githubReleaseInstallParamsSchema>;
