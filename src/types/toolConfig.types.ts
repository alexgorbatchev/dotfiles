/**
 * @file src/types/toolConfig.types.ts
 * @description Types related to tool configuration.
 *
 * ## Development Plan
 *
 * - [x] Define all core types for tool configuration (ToolConfig, InstallParams, hooks, etc.).
 * - [x] Add JSDoc comments to all exported types and interfaces.
 * - [x] Refactor ToolConfig to be a discriminated union based on installationMethod.
 * - [x] Ensure platform-specific configuration types are robust.
 * - [x] Remove all commented out code and meta-comments.
 * - [ ] Write tests for the module (Covered by tests of consuming modules like toolConfigBuilder and configLoader).
 * - [ ] Fix all errors and warnings.
 * - [ ] Ensure 100% test coverage for executable code (N/A for type definitions).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */
import type { ExtractResult } from './archive.types';
import type { SystemInfo } from './common.types';
import type { CompletionConfig } from './completion.types';
import type { GitHubReleaseAsset } from './githubApi.types';
import type { Platform, Architecture } from './platform.types';

/**
 * Defines the context object passed to asynchronous TypeScript installation hooks.
 * This context provides information about the current tool, installation paths,
 * system details, and results from previous steps (like download or extraction).
 * Hooks can use this information to perform custom setup or modification tasks.
 *
 * It is recommended to use a library like `zx` (google/zx) within hooks for
 * easily running shell commands and performing file system operations.
 */
export interface InstallHookContext {
  /** The name of the tool currently being installed. */
  toolName: string;
  /** The target directory where the tool's primary binary/executable should be (or has been) installed. */
  installDir: string;
  /**
   * The path to the downloaded file or archive.
   * This is available in `afterDownload`, `afterExtract`, and `afterInstall` hooks.
   */
  downloadPath?: string;
  /**
   * The path to the directory where an archive's contents were extracted.
   * This is available in `afterExtract` and `afterInstall` hooks if archive extraction occurred.
   */
  extractDir?: string;
  /**
   * The result of the archive extraction process, including lists of extracted files and executables.
   * This is available in `afterExtract` and `afterInstall` hooks if archive extraction occurred.
   * @see ExtractResult
   */
  extractResult?: ExtractResult;
  /**
   * Information about the system on which the installation is occurring (platform, architecture).
   * This is available in all hooks.
   * @see SystemInfo
   */
  systemInfo?: SystemInfo;
}

/**
 * Defines the signature for an asynchronous TypeScript installation hook function.
 * These hooks allow for custom logic to be executed at various stages of the tool installation process.
 * @param context - The {@link InstallHookContext} providing details about the current installation.
 * @returns A Promise that resolves when the hook's operations are complete.
 * @example
 * ```typescript
 * // An example afterExtract hook to move a specific binary and set permissions
 * import { $ } from 'zx';
 * import path from 'path';
 *
 * const myHook: AsyncInstallHook = async (context) => {
 *   if (context.extractDir && context.extractResult?.executables.includes('my-binary')) {
 *     const sourcePath = path.join(context.extractDir, 'my-binary');
 *     const targetPath = path.join(context.installDir, context.toolName);
 *     await $`mv ${sourcePath} ${targetPath}`;
 *     await $`chmod +x ${targetPath}`;
 *     console.log(`Moved and made ${targetPath} executable.`);
 *   }
 * };
 * ```
 */
export type AsyncInstallHook = (context: InstallHookContext) => Promise<void>;

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
   * An optional path or new name to which the extracted binary should be moved or renamed.
   * This path is relative to the `installDir` (see {@link InstallHookContext.installDir}).
   * If it's just a name (e.g., `mytool`), the binary will be placed in `installDir/mytool`.
   * If it's a relative path (e.g., `libexec/mytool`), it will be `installDir/libexec/mytool`.
   * Similar to Zinit's `mv` ice or how `pick` implies the final binary name within the tool's directory.
   * @example Zinit conceptual `mv` ice:
   * ```zsh
   * zinit ice mv"oldname newname" pick"oldname"
   * zinit light "user/tool"
   * ```
   */
  moveBinaryTo?: string;
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
  assetSelector?: (
    assets: GitHubReleaseAsset[],
    systemInfo: SystemInfo
  ) => GitHubReleaseAsset | undefined;
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
   * An optional path or new name to which the extracted file/binary (identified by `extractPath` or auto-detection)
   * should be moved or renamed, relative to the `installDir`.
   */
  moveBinaryTo?: string;
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

/**
 * Defines the fluent interface for configuring a tool.
 * An instance of this builder is passed to the `AsyncConfigureTool` function
 *  in each tool's configuration file (e.g., `fzf.tool.ts`).
 *  Methods are chainable, allowing for a declarative way to define how a tool
 *  should be named, versioned, installed, and integrated into the system.
 */
export interface PlatformConfigBuilder {
  /**
   * Specifies the name(s) of the binary or binaries that this tool provides for this specific platform configuration.
   * @param names - A single binary name or an array of binary names.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  bin(names: string | string[]): this;

  /**
   * Specifies the desired version of the tool for this specific platform configuration.
   * @param version - The version string or constraint.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  version(version: string): this;

  /**
   * Configures the installation method for this specific platform configuration.
   * @param method - The installation method.
   * @param params - Parameters specific to the chosen installation method.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;

  /**
   * Defines asynchronous TypeScript hook functions for this specific platform configuration.
   * @param hooks - An object containing one or more optional hook functions.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;

  /**
   * Adds raw Zsh shell code for this specific platform configuration.
   * @param code - A string containing valid Zsh script code.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  zsh(code: string): this;

  /**
   * Configures a symbolic link for this specific platform configuration.
   * @param source - The path to the source file/directory.
   * @param target - The path where the symlink should be created.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  symlink(source: string, target: string): this;

  /**
   * Configures shell command-line completions for this specific platform configuration.
   * @param config - A `CompletionConfig` object.
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  completions(config: CompletionConfig): this;
}

/**
 * Defines the fluent interface for configuring a tool.
 * An instance of this builder is passed to the `AsyncConfigureTool` function
 *  in each tool's configuration file (e.g., `fzf.tool.ts`).
 *  Methods are chainable, allowing for a declarative way to define how a tool
 *  should be named, versioned, installed, and integrated into the system.
 */

/**
 * Defines the fluent interface for configuring a tool.
 * An instance of this builder is passed to the `AsyncConfigureTool` function
 * in each tool's configuration file (e.g., `fzf.tool.ts`).
 * Methods are chainable, allowing for a declarative way to define how a tool
 * should be named, versioned, installed, and integrated into the system.
 */
export interface ToolConfigBuilder {
  /**
   * Specifies the name(s) of the binary or binaries that this tool provides.
   * For each name provided, a shim (an executable script) will be generated in the `binDir`
   * (e.g., `~/.generated/bin/`). This shim will then point to the actual installed tool binary.
   * @param names - A single binary name (e.g., `'fzf'`) or an array of binary names (e.g., `['git', 'git-lfs']`).
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example Generator:
   * ```typescript
   * c.bin('mytool')
   * c.bin(['main-tool', 'helper-tool'])
   * ```
   * @example Zinit `as'program'` or `id-as` define the tool's identity, and `pick` points to the binary:
   * ```zsh
   * zinit ice id-as"mytool" as"program" pick"actual_binary_name"
   * zinit light "user/repo"
   * ```
   */
  bin(names: string | string[]): this;

  /**
   * Specifies the desired version of the tool to be installed.
   * This can be a specific version string (e.g., `'1.2.3'`), a SemVer constraint (e.g., `'^1.0.0'`),
   * or the keyword `'latest'` to always attempt to install the most recent version.
   * This is analogous to Zinit's `ver` ice.
   * @param version - The version string or constraint.
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @default 'latest'
   * @example Generator:
   * ```typescript
   * c.version('2.5.1')
   * c.version('^3.0.0')
   * c.version('latest')
   * ```
   * @example Zinit:
   * ```zsh
   * zinit ice ver"v1.2.3"
   * zinit light "user/mycli"
   * ```
   */
  version(version: string): this;

  /**
   * Configures the installation method and its specific parameters for the tool.
   * This is a polymorphic method; the `params` argument's type depends on the `method` specified.
   *
   * ## GitHub Release Method (`'github-release'`)
   * Installs the tool from a GitHub release asset. Requires `repo` (owner/repo).  Can specify `assetPattern` or
   * `assetSelector` to find the correct download, `binaryPath` for the executable within an archive, and `version`.
   * See {@link GithubReleaseInstallParams}.
   *
   * @example Zinit `from"gh-r"`:
   * ```zsh
   * zinit ice from"gh-r"
   * zinit light "junegunn/fzf"
   * ```
   *
   * ## Homebrew Method (`'brew'`)
   * Installs the tool using Homebrew. Requires `formula` name. Can specify `cask: true` or `tap`.
   * See {@link BrewInstallParams}.
   *
   * ## Curl Script Method (`'curl-script'`)
   * Downloads and executes an installation script via `curl`. Requires `url` of the script and `shell` to use.
   * Similar to Zinit's `dl` and `atclone` for scripts.
   * See {@link CurlScriptInstallParams}.
   *
   * @example Zinit `dl` and `atclone` for script:
   * ```zsh
   * zinit ice dl"https://install.sh/myscript" atclone"sh myscript"
   * zinit snippet "https://install.sh/myscript"
   * ```
   *
   * ## Curl Tarball Method (`'curl-tar'`)
   * Downloads and extracts a tarball. Requires `url`. Can specify `extractPath` within the tarball and `moveBinaryTo`
   * for the final binary location. Similar to Zinit's `dl` for archives, combined with `extract` and `pick`.
   * See {@link CurlTarInstallParams}.
   *
   * @example Zinit `dl` for tarball (conceptual):
   * ```zsh
   * zinit ice dl"https://example.com/tool.tar.gz" extract pick"bin/tool" # Conceptual
   * zinit light "user/tool-from-tarball"
   * ```
   *
   * ## Manual Method (`'manual'`)
   * For tools installed outside this system. Requires `binaryPath` to check for existence.  Hooks can be used for custom
   * validation.
   * See {@link ManualInstallParams}.
   *
   * @param method - The installation method to use.
   * @param params - Parameters specific to the chosen installation method.
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;

  /**
   * Defines asynchronous TypeScript hook functions to be executed at various stages of the installation lifecycle.
   * These hooks allow for custom logic, such as pre-installation setup, post-download processing, archive manipulation
   * after extraction, or final validation steps.
   *
   * @param hooks - An object containing one or more optional hook functions:
   *   `beforeInstall`: Runs before any installation steps.
   *   `afterDownload`: Runs after the tool's artifact is downloaded. Similar to Zinit's `atclone` when used after a `dl` operation.
   *   `afterExtract`: Runs after an archive is extracted (if applicable). Can be used for `make`, `configure` steps.
   *   `afterInstall`: Runs after the main installation process completes. Similar to Zinit's `atpull` (for updates) or post-`make`/`configure` steps.
   *
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @see AsyncInstallHook
   * @see InstallHookContext
   * @example Zinit `make` equivalent:
   * ```zsh
   * zinit ice make"PREFIX=$ZPFX install"
   * ```
   * @example Generator `hooks` for make:
   * ```typescript
   * c.hooks({
   *   afterInstall: async (ctx) => { // Or afterExtract depending on when make should run
   *     if (ctx.extractDir) {
   *       await $`cd ${ctx.extractDir} && make PREFIX=${ctx.installDir} install`;
   *     }
   *   }
   * })
   * ```
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;

  /**
   * Adds raw Zsh shell code to be included in the generated Zsh initialization file (typically
   * `~/.generated/zsh/init.zsh`, which is then sourced by the user's `.zshrc`).  This is useful for setting environment
   * variables, defining aliases or functions, adding directories to the `PATH`, or sourcing other scripts related to the
   * tool.  Multiple calls to `zsh()` will append the code.
   *
   * @param code - A string containing valid Zsh script code.
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * c.zsh('export MYTOOL_CONFIG_DIR="$HOME/.mytool"')
   * c.zsh('alias m="mytool"')
   */
  zsh(code: string): this;

  /**
   * Configures a symbolic link to be created from a source file or directory within the dotfiles
   * repository to a target path, typically in the user's home directory.
   * This is used for managing configuration files (dotfiles) that the tool might expect at specific locations.
   * Multiple calls to `symlink()` will configure multiple links.
   * @param source - The path to the source file/directory, relative to the dotfiles project root.
   * @param target - The path where the symlink should be created, relative to the user's home directory.
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * c.symlink('mytool/config.yaml', '.config/mytool/config.yaml')
   */
  symlink(source: string, target: string): this;

  /**
   * Defines platform-specific configurations for the tool.
   * This allows tailoring installation methods, binaries, versions, etc., for different
   * operating systems and optionally CPU architectures.
   *
   * @param platforms - A bitmask of `Platform` enum values specifying the target operating systems.
   * @param architecturesOrConfigure - Either a bitmask of `Architecture` enum values or the configuration callback.
   * @param configure (optional) - The callback function that receives a `PlatformConfigBuilder` instance
   *                               to define the overrides for the specified platform(s) and architecture(s).
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * // Configure for Linux and MacOS
   * c.platform(Platform.Linux | Platform.MacOS, (builder) => {
   *   builder.install('github-release', { repo: 'owner/tool', assetPattern: '*unix*.tar.gz' });
   * });
   *
   * // Configure for Windows on Arm64
   * c.platform(Platform.Windows, Architecture.Arm64, (builder) => {
   *   builder.install('manual', { binaryPath: 'C:\\custom\\tool-arm64.exe' });
   * });
   */
  platform(
    platforms: Platform,
    configure: (builder: PlatformConfigBuilder) => void,
  ): this;
  platform(
    platforms: Platform,
    architectures: Architecture,
    configure: (builder: PlatformConfigBuilder) => void,
  ): this;

  /**
   * Configures shell command-line completions for the tool.
   * This involves specifying where the completion scripts are located within the tool's downloaded/extracted files
   * for different shells like Zsh, Bash, or Fish.
   * @param config - A {@link CompletionConfig} object that maps shell types to their specific
   *                 {@link ShellCompletionConfig} (source path, name, target directory).
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * c.completions({
   *   zsh: { source: 'completions/_mytool.zsh' },
   *   bash: { source: 'completions/mytool.bash' }
   * })
   */
  completions(config: CompletionConfig): this;
}

/**
 * Defines the type for the main configuration function exported by each tool's `.tool.ts` file.
 * This asynchronous function receives an instance of {@link ToolConfigBuilder} and uses its methods
 * to declaratively define all aspects of the tool's setup and integration.
 * @param c - The {@link ToolConfigBuilder} instance used to configure the tool.
 * @returns A Promise that resolves when the configuration is complete.
 * @example
 * ```typescript
 * // In generator/configs/tools/my-cli-tool.tool.ts
 * import type { AsyncConfigureTool } from '@types';
 *
 * export const configure: AsyncConfigureTool = async (c) => {
 *   c.name('my-cli-tool');
 *   c.version('1.5.0');
 *   c.bin('my-cli');
 *   c.install('github-release', {
 *     repo: 'user/my-cli-tool',
 *     assetPattern: '*linux_amd64.tar.gz',
 *     binaryPath: 'bin/my-cli',
 *   });
 *   c.zsh('export MY_CLI_ENABLE_FEATURE_X=true');
 * };
 * ```
 */
export type AsyncConfigureTool = (c: ToolConfigBuilder) => Promise<void>;

export type ToolConfigUpdateCheck = {
  /**
   * Whether update checking is enabled for this tool.
   * Can be overridden globally by `AppConfig.checkUpdatesOnRun`.
   * @default true
   */
  enabled?: boolean;
  /**
   * An optional SemVer constraint for updates. If specified, only updates satisfying
   * this constraint relative to the currently installed version will be considered.
   * E.g., if `1.2.3` is installed and constraint is `~1.2.x`, then `1.2.4` is an update, but `1.3.0` is not.
   * If `^1.2.3` is installed, then `1.3.0` is an update, but `2.0.0` is not.
   */
  constraint?: string;
};

/**
 * Represents a single platform-specific configuration entry.
 * It specifies the target platforms (and optionally architectures) and the
 * configuration overrides that apply to them.
 */
export interface PlatformConfigEntry {
  /** A bitmask of target platforms for this configuration. */
  platforms: Platform;
  /** An optional bitmask of target architectures for this configuration. If undefined, applies to all architectures on the specified platforms. */
  architectures?: Architecture;
  /** The actual configuration settings for this platform/architecture combination. This would be the result of the PlatformConfigBuilder. */
  config: Partial<Omit<ToolConfig, 'name' | 'platformConfigs'>>; // For platform-specific configurations
}

/**
 * Base properties common to all variants of a fully resolved {@link ToolConfig}.
 * This represents the internal data structure after the `ToolConfigBuilder` has been processed.
 */
interface BaseToolConfigProperties {
  /** The unique name of the tool, as defined by `c.name()`. */
  name: string;
  /**
   * An array of binary names that should have shims generated for this tool.
   * Defined by `c.bin()`. Can be undefined if no binaries are specified (e.g., for a config-only tool).
   */
  binaries?: string[];
  /** The desired version of the tool, defined by `c.version()`. Defaults to 'latest'. */
  version: string;
  /** An array of Zsh initialization script snippets, added via `c.zsh()`. */
  zshInit?: string[];
  /** An array of symlink configurations, added via `c.symlink()`. Each object has `source` and `target` paths. */
  symlinks?: { source: string; target: string }[];
  /** Shell completion configurations, defined by `c.completions()`. */
  completions?: CompletionConfig;
  /**
   * Configuration for automatic update checking for this tool.
   */
  updateCheck?: ToolConfigUpdateCheck;
  /**
   * An array of platform-specific configurations.
   * Each entry defines configurations for a specific set of platforms and optionally architectures.
   */
  platformConfigs?: PlatformConfigEntry[];
}

/**
 * Represents a single platform-specific configuration entry.
 * It specifies the target platforms (and optionally architectures) and the
 * configuration overrides that apply to them.
 */
export interface PlatformConfigEntry {
  /** A bitmask of target platforms for this configuration. */
  platforms: Platform;
  /** An optional bitmask of target architectures for this configuration. If undefined, applies to all architectures on the specified platforms. */
  architectures?: Architecture;
  /** The actual configuration settings for this platform/architecture combination. This would be the result of the PlatformConfigBuilder. */
  config: Partial<Omit<ToolConfig, 'name' | 'platformConfigs'>>; // For platform-specific configurations
}

/** Resolved tool configuration for the 'github-release' installation method. */
export type GithubReleaseToolConfig = BaseToolConfigProperties & {
  installationMethod: 'github-release';
  installParams: GithubReleaseInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'brew' installation method. */
export type BrewToolConfig = BaseToolConfigProperties & {
  installationMethod: 'brew';
  installParams: BrewInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'curl-script' installation method. */
export type CurlScriptToolConfig = BaseToolConfigProperties & {
  installationMethod: 'curl-script';
  installParams: CurlScriptInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'curl-tar' installation method. */
export type CurlTarToolConfig = BaseToolConfigProperties & {
  installationMethod: 'curl-tar';
  installParams: CurlTarInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'manual' installation method. */
export type ManualToolConfig = BaseToolConfigProperties & {
  installationMethod: 'manual';
  installParams: ManualInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/**
 * Resolved tool configuration for tools that do not have a primary installation method defined
 * at the top level (e.g., they might only consist of Zsh initializations, symlinks, or rely entirely
 * on architecture-specific overrides for installation).
 * The `binaries` property is optional here, inherited from {@link BaseToolConfigProperties}.
 */
export type NoInstallToolConfig = BaseToolConfigProperties & {
  /** Indicates that no top-level installation method is specified. */
  installationMethod: 'none';
  /** Installation parameters are explicitly undefined or absent for this type. */
  installParams?: undefined;
};

/**
 * Represents a tool's complete, resolved configuration after being processed by the `ToolConfigBuilder`.
 * This is a discriminated union based on the `installationMethod` property, allowing TypeScript
 * to correctly infer the type of `installParams` and other method-specific properties.
 */
export type ToolConfig =
  | GithubReleaseToolConfig
  | BrewToolConfig
  | CurlScriptToolConfig
  | CurlTarToolConfig
  | ManualToolConfig
  | NoInstallToolConfig;

export type ToolConfigInstallationMethod = ToolConfig['installationMethod'];
export type ToolConfigInstallParams = ToolConfig['installParams'];
