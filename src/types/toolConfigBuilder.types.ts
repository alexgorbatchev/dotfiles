import type { CompletionConfig } from './completion.types';
import type { Platform, Architecture } from './platform.types';
import type { ShellScript } from './shellScript.types';
import type { AsyncInstallHook } from './installHooks.types';
import type { 
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  ManualInstallParams
} from './installParams.types';

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
   * Adds Zsh shell scripts for this specific platform configuration.
   * @param scripts - Branded shell scripts (OnceScript or AlwaysScript)
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  zsh(...scripts: ShellScript[]): this;

  /**
   * Adds Bash shell scripts for this specific platform configuration.
   * @param scripts - Branded shell scripts (OnceScript or AlwaysScript)
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  bash(...scripts: ShellScript[]): this;

  /**
   * Adds PowerShell scripts for this specific platform configuration.
   * @param scripts - Branded shell scripts (OnceScript or AlwaysScript)
   * @returns The `PlatformConfigBuilder` instance for chaining.
   */
  powershell(...scripts: ShellScript[]): this;

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
 * Defines the main interface for configuring a tool.  An instance of this builder is passed to the `AsyncConfigureTool`
 * function in each tool's configuration file (e.g., `fzf.tool.ts`).  Methods are chainable, allowing for a declarative
 * way to define how a tool should be named, versioned, installed, and integrated into the system.
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
   * Specifies the desired version of the tool to be installed.  This can be a specific version string (e.g., `'1.2.3'`),
   * a SemVer constraint (e.g., `'^1.0.0'`), or the keyword `'latest'` to always attempt to install the most recent
   * version.  This is analogous to Zinit's `ver` ice.
   * 
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
   * Downloads and extracts a tarball. Requires `url`. Can specify `extractPath` within the tarball
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
   * Adds Zsh shell scripts to be included in the generated Zsh initialization file (typically
   * `~/.generated/shell-scripts/main.zsh`, which is then sourced by the user's `.zshrc`). This is useful for setting environment
   * variables, defining aliases or functions, adding directories to the `PATH`, or sourcing other scripts related to the
   * tool. Multiple calls to `zsh()` will append the scripts.
   *
   * @param scripts - Branded shell scripts (OnceScript for one-time setup, AlwaysScript for every shell startup)
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * import { once, always } from '@types';
   * 
   * c.zsh(
   *   once`
   *     # Generate completions (runs only once after installation/update)
   *     tool completion zsh > "$DOTFILES/.generated/completions/_tool"
   *   `,
   *   always`
   *     # Fast runtime setup (runs every shell startup)
   *     export MYTOOL_CONFIG_DIR="$HOME/.mytool"
   *     alias m="mytool"
   *   `
   * )
   */
  zsh(...scripts: ShellScript[]): this;

  /**
   * Adds Bash shell scripts to be included in the generated Bash initialization file (typically
   * `~/.generated/shell-scripts/main.bash`). This is useful for setting environment variables,
   * defining aliases or functions, adding directories to the `PATH`, or sourcing other scripts
   * related to the tool. Multiple calls to `bash()` will append the scripts.
   *
   * @param scripts - Branded shell scripts (OnceScript for one-time setup, AlwaysScript for every shell startup)
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * import { once, always } from '@types';
   * 
   * c.bash(
   *   once`
   *     # Generate completions (runs only once after installation/update)
   *     tool completion bash > "$HOME/.bash_completion.d/tool"
   *   `,
   *   always`
   *     # Fast runtime setup (runs every shell startup)
   *     export MYTOOL_CONFIG_DIR="$HOME/.mytool"
   *     alias m="mytool"
   *   `
   * )
   */
  bash(...scripts: ShellScript[]): this;

  /**
   * Adds PowerShell scripts to be included in the generated PowerShell initialization file
   * (typically `~/.generated/shell-scripts/main.ps1`). This is useful for setting environment
   * variables, defining functions, adding directories to the `PATH`, or dot-sourcing other
   * scripts related to the tool. Multiple calls to `powershell()` will append the scripts.
   *
   * @param scripts - Branded shell scripts (OnceScript for one-time setup, AlwaysScript for every shell startup)
   * @returns The `ToolConfigBuilder` instance for chaining.
   * @example
   * import { once, always } from '@types';
   * 
   * c.powershell(
   *   once`
   *     # Generate completions (runs only once after installation/update)
   *     & tool completion powershell > "$env:HOME\\.powershell_completions\\tool.ps1"
   *   `,
   *   always`
   *     # Fast runtime setup (runs every shell startup)
   *     $env:MYTOOL_CONFIG_DIR = "$env:HOME\\.mytool"
   *     function m { mytool @args }
   *   `
   * )
   */
  powershell(...scripts: ShellScript[]): this;

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
   * Defines platform-specific configurations for the tool.  This allows tailoring installation methods, binaries,
   * versions, etc., for different operating systems and optionally CPU architectures.
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
 * Context object providing access to configuration paths and directories for tool configuration.
 * All paths are sourced from the yamlConfig rather than OS-specific defaults.
 */
export interface ToolConfigContext {
  /**
   * Current tool's installation directory
   */
  toolDir: string;

  /**
   * Get the installation directory for any tool
   * @param toolName - Name of the tool
   * @returns Full path to the specified tool's installation directory
   */
  getToolDir(toolName: string): string;

  /**
   * User's home directory path (from yamlConfig.paths.homeDir)
   */
  homeDir: string;

  /**
   * Generated binaries directory (from yamlConfig.paths.binariesDir)
   */
  binDir: string;

  /**
   * Generated shell scripts directory (from yamlConfig.paths.shellScriptsDir)
   */
  shellScriptsDir: string;

  /**
   * Root dotfiles directory (from yamlConfig.paths.dotfilesDir)
   */
  dotfilesDir: string;

  /**
   * Generated files directory (from yamlConfig.paths.generatedDir)
   */
  generatedDir: string;
}

/**
 * Defines the type for the main configuration function exported by each tool's `.tool.ts` file.
 * This asynchronous function receives an instance of {@link ToolConfigBuilder} and a context object
 * with path information to declaratively define all aspects of the tool's setup and integration.
 * @param c - The {@link ToolConfigBuilder} instance used to configure the tool.
 * @param ctx - The {@link ToolConfigContext} providing access to configuration paths and directories.
 * @returns A Promise that resolves when the configuration is complete.
 * @example
 * ```typescript
 * // In generator/configs/tools/my-cli-tool.tool.ts
 * import type { AsyncConfigureTool } from '@types';
 *
 * export const configure: AsyncConfigureTool = async (c, ctx) => {
 *   c.bin('my-cli');
 *   c.version('1.5.0');
 *   c.install('github-release', {
 *     repo: 'user/my-cli-tool',
 *     assetPattern: '*linux_amd64.tar.gz',
 *     binaryPath: 'bin/my-cli',
 *   });
 *   c.zsh(`export MY_CLI_CONFIG_DIR="${ctx.homeDir}/.my-cli"`);
 * };
 * ```
 */
export type AsyncConfigureTool = (c: ToolConfigBuilder, ctx: ToolConfigContext) => Promise<void>;

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