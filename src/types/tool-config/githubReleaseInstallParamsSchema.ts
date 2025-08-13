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
   * The path to the executable binary within the extracted archive.
   * For example, if an archive extracts to `fzf-0.30.0/` and the binary is `fzf-0.30.0/bin/fzf`,
   * this would be `bin/fzf` (relative to the archive's root after stripping components).
   * If not provided, the system may try to auto-detect the binary.
   * Similar to Zinit's `pick'{file}'` ice.
   * @example Zinit `pick`:
   * ```zsh
   * zinit ice from"gh-r" pick"mytool-*\/bin/mytool"
   * zinit light "user/mytool"
   * ```
   */
  binaryPath: z.string().optional(),
  /** Target path where the binary should be moved after extraction */
  moveBinaryTo: z.string().optional(),
  /**
   * The number of leading directory components to strip from file paths during archive extraction.
   * For example, if an archive contains `tool-v1.0/bin/tool` and `stripComponents` is 1,
   * the extracted path will be `bin/tool`.
   * This is similar to `tar --strip-components=N` and Zinit's `extract` ice capabilities (though Zinit's `extract` is more complex).
   * @example Zinit conceptual `extract` with stripping:
   * ```zsh
   * zinit ice extract"strip_components=1" # Conceptual, Zinit's actual mechanism is part of `ziextract`
   * zinit light "user/archived-tool"
   * ```
   * @default 0
   */
  stripComponents: z.number().int().min(0).optional(),
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
