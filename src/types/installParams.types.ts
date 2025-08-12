import type { SystemInfo } from './common.types';
import type { GitHubReleaseAsset } from './githubApi.types';
import type { AsyncInstallHook } from './installHooks.types';

/**
 * Base interface for parameters common to all installation methods.
 * This includes environment variables to set during installation and a set of lifecycle hooks.
 */
export interface BaseInstallParams {
  /**
   * A record of environment variables to be set specifically for the duration of this tool's installation process.
   * These variables are applied before any installation commands or hooks are executed.
   * @example
   * env: {
   *   CUSTOM_FLAG: 'true',
   *   API_KEY: 'secret'
   * }
   */
  env?: { [key: string]: string };

  /**
   * A collection of optional asynchronous hook functions that can be executed at different stages
   * of the installation lifecycle.
   */
  hooks?: {
    /** Runs before any other installation steps (download, extract, main install command) begin. */
    beforeInstall?: AsyncInstallHook;
    /** Runs after the tool's primary artifact (e.g., archive, script) has been downloaded but before extraction or execution. */
    afterDownload?: AsyncInstallHook;
    /** Runs after an archive has been extracted (if applicable to the installation method) but before the main binary is finalized. */
    afterExtract?: AsyncInstallHook;
    /** Runs after the main installation command or process for the tool has completed and the binary is expected to be in place. */
    afterInstall?: AsyncInstallHook;
  };
}

/**
 * Parameters for installing a tool from a GitHub Release.
 * This method involves fetching release information from GitHub, downloading a release asset,
 * extracting it (if it's an archive), and then locating/moving the binary.
 * This is analogous to Zinit's `from"gh-r"` ice.
 * @example Zinit equivalent for fetching a release:
 * ```zsh
 * zinit ice from"gh-r"
 * zinit light "junegunn/fzf"
 * ```
 */
export interface GithubReleaseInstallParams extends BaseInstallParams {
  /**
   * The GitHub repository in "owner/repo" format (e.g., `junegunn/fzf`).
   * Corresponds to the main argument for Zinit's `from"gh-r"`.
   */
  repo: string;
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
  assetPattern?: string;
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
  binaryPath?: string;
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
  version?: string;
  /**
   * If `true`, pre-releases will be considered when searching for the specified `version` or the latest release.
   * @default false
   */
  includePrerelease?: boolean;
  /**
   * An optional custom function to select the desired asset from a list of available assets for a release.
   * This provides more fine-grained control than `assetPattern` for complex selection logic.
   * @param assets - An array of {@link GitHubReleaseAsset} objects available for the selected release.
   * @param systemInfo - The {@link SystemInfo} of the current system.
   * @returns The selected {@link GitHubReleaseAsset} or `undefined` if no suitable asset is found.
   * @example
   * assetSelector: (assets, sysInfo) => {
   *   const platformKey = sysInfo.platform === 'darwin' ? 'macos' : sysInfo.platform;
   *   const archKey = sysInfo.arch === 'arm64' ? 'aarch64' : sysInfo.arch;
   *   return assets.find(asset =>
   *     asset.name.includes(platformKey) && asset.name.includes(archKey)
   *   );
   * }
   */
  assetSelector?: (assets: GitHubReleaseAsset[], systemInfo: SystemInfo) => GitHubReleaseAsset | undefined;
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
  stripComponents?: number;
}

/**
 * Parameters for installing a tool using Homebrew (`brew`).
 * This method is typically used on macOS and Linux (via Linuxbrew).
 * It involves running `brew install` commands.
 */
export interface BrewInstallParams extends BaseInstallParams {
  /**
   * The name of the Homebrew formula to install (e.g., `ripgrep`).
   * Either `formula` or `cask` (by setting `cask: true` and using `formula` for the cask name) should be specified.
   */
  formula?: string;
  /**
   * If `true`, the `formula` property is treated as a Homebrew Cask name (e.g., `visual-studio-code`).
   * @default false
   */
  cask?: boolean;
  /**
   * An optional Homebrew tap or an array of taps that need to be added (`brew tap <tap_name>`)
   * before the formula can be installed.
   * Example: `homebrew/core` or `['user/custom-tap', 'another/tap']`.
   */
  tap?: string | string[];
}

/**
 * Parameters for installing a tool by downloading and executing a shell script using `curl`.
 * This method involves fetching a script from a URL and piping it to a shell.
 * Example: `curl -fsSL <url> | sh`.
 * This is analogous to Zinit's `dl` ice combined with `atclone` for script execution.
 * @example Zinit equivalent:
 * ```zsh
 * zinit ice dl"https://install.sh/myscript" atclone"sh myscript"
 * zinit snippet "https://install.sh/myscript"
 * ```
 */
export interface CurlScriptInstallParams extends BaseInstallParams {
  /** The URL of the installation script to download. */
  url: string;
  /** The shell to use for executing the downloaded script (e.g., `bash`, `sh`). */
  shell: 'bash' | 'sh';
}

/**
 * Parameters for installing a tool by downloading a tarball (`.tar`, `.tar.gz`, etc.) using `curl`,
 * then extracting it and potentially moving a binary from within.
 * This is analogous to Zinit's `dl` ice for archives, combined with `extract` and `pick`.
 * @example Zinit equivalent:
 * ```zsh
 * zinit ice dl"https://example.com/tool.tar.gz" extract pick"bin/tool" # Conceptual
 * zinit light "user/tool-from-tarball"
 * ```
 */
export interface CurlTarInstallParams extends BaseInstallParams {
  /** The URL of the tarball to download. */
  url: string;
  /**
   * An optional path within the extracted tarball that points to the specific file or directory
   * to be considered the primary artifact (e.g., `bin/mytool` if the tarball extracts to a root folder
   * and the binary is inside `bin/`). If not provided, the entire extracted content might be used,
   * or auto-detection might occur.
   */
  extractPath?: string;
  /**
   * The number of leading directory components to strip from file paths during tarball extraction.
   * @default 0
   */
  stripComponents?: number;
}

/**
 * Parameters for a "manual" installation method.
 * This method is used when the tool is expected to be installed by some other means
 * (e.g., system package manager not covered, user installs it manually, or it's part of the OS).
 * The generator will primarily check for the existence of the binary at the specified path.
 * Hooks can be used to provide custom validation or setup steps.
 */
export interface ManualInstallParams extends BaseInstallParams {
  /**
   * The expected absolute path to the tool's binary if it's installed manually or by other means.
   * The generator will check this path to verify installation.
   */
  binaryPath: string;
}

/**
 * A union type representing all possible sets of installation parameters for the different installation methods.
 * This is used by the `install` method of the {@link ToolConfigBuilder}.
 */
export type InstallParams =
  | GithubReleaseInstallParams
  | BrewInstallParams
  | CurlScriptInstallParams
  | CurlTarInstallParams
  | ManualInstallParams;
