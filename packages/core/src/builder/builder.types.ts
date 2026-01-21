/**
 * Install-first API: Type-safe builder types with plugin system
 *
 * This module defines the new API where the installer method is chosen first.
 * Plugin types are loaded via module augmentation from installer packages.
 */

import type { Resolvable } from '@dotfiles/unwrap-value';
import type { Architecture, IBaseToolContext, Platform } from '../common';
import type {
  AsyncInstallHook,
  IAfterInstallContext,
  IDownloadContext,
  IExtractContext,
  IInstallContext,
} from '../installer';
import type { AlwaysScript, OnceScript } from '../shell';
import type { IInstallParamsRegistry, ToolConfig } from '../types';
import type { ICompletionContext } from './ICompletionContext';

/**
 * Configuration options for shell completions.
 *
 * @example
 * shell.completions({ source: '_tool', name: '_mytool' })
 * shell.completions({ cmd: 'tool completion zsh' })
 */
export interface IShellCompletionConfigOptions {
  /**
   * Path to a static completion file.
   *
   * - **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
   * - **Absolute paths** → used as-is
   * - **Files from downloaded archives** (GitHub releases, tarballs) are extracted to
   *   `ctx.currentDir`. Use this to build an absolute path: `${ctx.currentDir}/completions/_tool`
   *
   * Either `source` or `cmd` must be provided, but not both (unless using `url`).
   *
   * Equivalent bash:
   * ```bash
   * # Relative: '_tool.zsh' resolves to toolDir (next to .tool.ts)
   * ln -s ${ctx.toolDir}/_tool.zsh ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_mytool
   *
   * # Extracted archive: ctx.currentDir = ${ctx.projectConfig.paths.installDir}/mytool/1.0.0
   * ln -s ${ctx.currentDir}/completions/_tool ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_mytool
   * ```
   *
   * @example '_tool.zsh'
   * @example `${ctx.currentDir}/completions/_tool`
   */
  source?: string;

  /**
   * URL to download the completion file or archive from.
   *
   * The file is downloaded during shell script generation to `toolInstallDir`.
   * If `source` is not provided, the filename is derived from the URL.
   * For archives, use `source` with an absolute path: `${ctx.currentDir}/path/in/archive`.
   * Cannot be combined with `cmd`.
   *
   * Equivalent bash:
   * ```bash
   * curl -fsSL "https://raw.githubusercontent.com/user/repo/main/_mycli" \
   *   -o ${ctx.projectConfig.paths.installDir}/mytool/1.0.0/_mycli
   * ```
   *
   * @example 'https://raw.githubusercontent.com/user/repo/main/_mycli'
   */
  url?: string;

  /**
   * Command to generate completion content dynamically.
   *
   * Executes in the tool's installation directory during shell script generation.
   * The tool must be installed before this command can run.
   * Cannot be combined with `source` or `url`.
   *
   * Equivalent bash:
   * ```bash
   * cd ${ctx.projectConfig.paths.installDir}/mytool/1.0.0
   * ./bin/tool completion zsh > ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_tool
   * ```
   *
   * @example 'tool completion zsh'
   * @example 'fnm completions --shell zsh'
   */
  cmd?: string;

  /**
   * Binary name for shell-specific completion filename.
   *
   * Applies naming conventions: `_bin` for zsh, `bin.bash` for bash.
   * Use when tool name differs from binary name.
   *
   * Equivalent bash:
   * ```bash
   * # bin: 'fnm' → output filename
   * # zsh:  _fnm
   * # bash: fnm.bash
   * ```
   *
   * @example 'fnm' → '_fnm' for zsh
   */
  bin?: string;

  /**
   * Custom filename for the completion file.
   *
   * Overrides default naming and `bin` option.
   *
   * Equivalent bash:
   * ```bash
   * # name: '_mytool' → exact filename used
   * ... > ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_mytool
   * ```
   *
   * @example '_mytool'
   */
  name?: string;

  /**
   * Output directory where the completion file will be written.
   *
   * Affects both file placement and shell initialization (e.g., `fpath` for zsh).
   * Defaults to `${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/`.
   *
   * Equivalent bash:
   * ```bash
   * # Default (using shellScriptsDir)
   * cp _tool ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_tool
   * fpath=("${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions" $fpath)
   *
   * # Custom targetDir
   * cp _tool ${targetDir}/_tool
   * fpath=("${targetDir}" $fpath)
   * ```
   *
   * @example `${ctx.projectConfig.paths.homeDir}/.zsh/completions`
   */
  targetDir?: string;
}

/**
 * Static completion configuration value (string path or options object).
 * Used when completion configuration is known at definition time.
 */
export type ShellCompletionConfigValue = string | IShellCompletionConfigOptions;

/**
 * Input type for configuring shell completions.
 *
 * Accepts a string path, a configuration object, or a callback.
 * See `IShellCompletionConfigOptions` for object configuration details.
 *
 * **String paths:**
 * - **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
 * - **Files from downloaded archives** (GitHub releases, tarballs) are extracted to
 *   `ctx.currentDir`. Use this to build an absolute path.
 *
 * Equivalent bash:
 * ```bash
 * # Relative: '_tool.zsh' resolves to toolDir (next to .tool.ts)
 * ln -s ${ctx.toolDir}/_tool.zsh ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_mytool
 *
 * # Extracted archive: ctx.currentDir = ${ctx.projectConfig.paths.installDir}/mytool/1.0.0
 * ln -s ${ctx.currentDir}/completions/_tool ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_mytool
 * ```
 *
 * @example
 * shell.completions('_tool.zsh')
 * shell.completions(`${ctx.currentDir}/completions/_tool.zsh`)
 * shell.completions({ cmd: 'tool completion zsh' })
 * shell.completions({ url: 'https://raw.githubusercontent.com/user/repo/main/_mycli' })
 */
export type ShellCompletionConfigInput = Resolvable<ICompletionContext, ShellCompletionConfigValue>;

/**
 * Install params come from plugins via IInstallParamsRegistry module augmentation.
 * Each plugin registers its param types by augmenting the IInstallParamsRegistry interface.
 */

/**
 * Fluent configurator used inside shell callbacks for the new shell API.
 */
export interface IShellConfigurator {
  /**
   * Sets environment variables for the shell.
   * @param values - A record of environment variable names and values.
   */
  environment(values: Record<string, string>): IShellConfigurator;

  /**
   * Sets shell aliases.
   * @param values - A record of alias names and their commands.
   */
  aliases(values: Record<string, string>): IShellConfigurator;

  /**
   * Sources a script file during shell initialization.
   *
   * - **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
   * - **Absolute paths** → used as-is
   * - **Files from downloaded archives** (GitHub releases, tarballs) are extracted to
   *   `ctx.currentDir`. Use this to build an absolute path: `${ctx.currentDir}/init.sh`
   *
   * Equivalent bash:
   * ```bash
   * # Relative: 'init.sh' resolves to toolDir (next to .tool.ts)
   * source ${ctx.toolDir}/init.sh
   *
   * # Extracted archive: ctx.currentDir = ${ctx.projectConfig.paths.installDir}/mytool/1.0.0
   * source ${ctx.currentDir}/init.sh
   * ```
   *
   * @param relativePath - Path to the script file relative to the tool directory.
   *
   * @example shell.source('init.zsh')
   * @example shell.source(`${ctx.currentDir}/shell/init.sh`)
   */
  source(relativePath: string): IShellConfigurator;

  /**
   * Configures shell completions from static files or generated dynamically.
   *
   * - **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
   * - **Files from downloaded archives** (GitHub releases, tarballs) are extracted to
   *   `ctx.currentDir`. Use this to build an absolute path.
   * - **Dynamic** → use `{ cmd: 'tool completion zsh' }`
   *
   * @param completion - Path string, config object, or callback
   *
   * @example shell.completions('_tool.zsh')
   * @example shell.completions(`${ctx.currentDir}/completions/_tool`)
   * @example shell.completions({ cmd: 'tool completion zsh' })
   */
  completions(completion: ShellCompletionConfigInput): IShellConfigurator;

  /**
   * Adds a script to be executed once during shell initialization.
   * @param script - The script content or OnceScript object.
   */
  once(script: OnceScript): IShellConfigurator;
  once(script: string): IShellConfigurator;

  /**
   * Adds a script to be executed always during shell initialization.
   * @param script - The script content or AlwaysScript object.
   */
  always(script: AlwaysScript): IShellConfigurator;
  always(script: string): IShellConfigurator;

  /**
   * Defines shell functions with automatic HOME override.
   * Function bodies are wrapped in subshells with HOME set to the configured home directory,
   * consistent with the behavior of `always` and `once` scripts.
   *
   * @param values - A record of function names to their body content.
   *
   * @example
   * shell.functions({
   *   mycommand: 'echo "Running with HOME=$HOME"'
   * })
   * // Generates:
   * // mycommand() {
   * //   (
   * //     HOME="/configured/home/path"
   * //     echo "Running with HOME=$HOME"
   * //   )
   * // }
   */
  functions(values: Record<string, string>): IShellConfigurator;
}

export type ShellConfiguratorSyncResult = IShellConfigurator | undefined;
export type ShellConfiguratorAsyncResult = Promise<ShellConfiguratorSyncResult>;

export type ShellConfiguratorCallback = (shell: IShellConfigurator) => ShellConfiguratorSyncResult;
export type ShellConfiguratorAsyncCallback = (shell: IShellConfigurator) => ShellConfiguratorAsyncResult;

/**
 * Known binary names for type-safe dependsOn() calls.
 * Generated tool type definitions augment this registry with string literal properties.
 * The fallback behaviour resolves to `string` when no binary names are registered.
 */
export interface IKnownBinNameRegistry {
  __placeholder__?: never;
}

type KnownBinNameKeys = Exclude<keyof IKnownBinNameRegistry, '__placeholder__'>;

export type KnownBinName = [KnownBinNameKeys] extends [never] ? string : KnownBinNameKeys;

/**
 * Hook event names that plugins can emit during installation.
 */
export type PluginEmittedHookEvent = 'after-download' | 'after-extract';

/**
 * Hook event names used in the installation lifecycle.
 */
export type HookEventName = 'before-install' | PluginEmittedHookEvent | 'after-install';

/**
 * Fluent builder interface for configuring a tool.
 * Returned by InstallFunction after selecting installer method.
 */
export interface IToolConfigBuilder {
  /**
   * Define a binary that this tool provides.
   * @param name - The name of the binary executable
   * @param pattern - Optional glob pattern to locate the binary within extracted archives
   */
  bin(name: string, pattern?: string): this;

  /**
   * Set a specific version for this tool.
   * @param version - The version string (e.g., "1.2.3", "latest")
   */
  version(version: string): this;

  /**
   * Declare binary dependencies that must be installed before this tool.
   *
   * During generation, the system:
   * 1. Builds a dependency graph mapping binaries to their provider tools
   * 2. Validates that all dependencies exist and are unambiguous
   * 3. Detects circular dependencies and platform mismatches
   * 4. Topologically sorts tools so dependencies are processed first
   *
   * @param binaryNames - Names of binaries this tool depends on (from other tools' `.bin()` calls)
   */
  dependsOn(...binaryNames: KnownBinName[]): this;

  /**
   * Attach a hook handler to a specific lifecycle event.
   * Multiple handlers can be added by calling this method multiple times with the same event name.
   * @param event - The lifecycle event name (kebab-case)
   * @param handler - The async hook function to execute
   */
  hook(event: 'before-install', handler: AsyncInstallHook<IInstallContext>): this;
  hook(event: 'after-download', handler: AsyncInstallHook<IDownloadContext>): this;
  hook(event: 'after-extract', handler: AsyncInstallHook<IExtractContext>): this;
  hook(event: 'after-install', handler: AsyncInstallHook<IAfterInstallContext>): this;
  hook(event: HookEventName, handler: AsyncInstallHook<never>): this;

  /**
   * Configure zsh shell initialization for this tool.
   * @param callback - Function that receives shell configurator to add paths, aliases, env vars
   */
  zsh(callback: ShellConfiguratorCallback): this;
  zsh(callback: ShellConfiguratorAsyncCallback): Promise<this>;

  /**
   * Configure bash shell initialization for this tool.
   * @param callback - Function that receives shell configurator to add paths, aliases, env vars
   */
  bash(callback: ShellConfiguratorCallback): this;
  bash(callback: ShellConfiguratorAsyncCallback): Promise<this>;

  /**
   * Configure PowerShell initialization for this tool.
   * @param callback - Function that receives shell configurator to add paths, aliases, env vars
   */
  powershell(callback: ShellConfiguratorCallback): this;
  powershell(callback: ShellConfiguratorAsyncCallback): Promise<this>;

  /**
   * Create a symbolic link from source to target.
   * @param source - The source path (what to link from)
   * @param target - The target path (where to create the symlink)
   */
  symlink(source: string, target: string): this;

  /**
   * Add platform-specific configuration overrides.
   * @param platforms - Target platform(s): 'macos', 'linux', 'windows', or array
   * @param configure - Function to configure platform-specific settings
   */
  platform(platforms: Platform, configure: (install: IPlatformInstallFunction) => IPlatformConfigBuilder): this;

  /**
   * Add platform and architecture-specific configuration overrides.
   * @param platforms - Target platform(s): 'macos', 'linux', 'windows', or array
   * @param architectures - Target architecture(s): 'x64', 'arm64', or array
   * @param configure - Function to configure platform-specific settings
   */
  platform(
    platforms: Platform,
    architectures: Architecture,
    configure: (install: IPlatformInstallFunction) => IPlatformConfigBuilder,
  ): this;

  /**
   * Mark this tool as disabled.
   * A disabled tool is skipped during generation with a warning message.
   * Useful for temporarily disabling a tool without removing its configuration.
   */
  disable(): this;

  /**
   * Finalize and build the tool configuration.
   * Call this as the last method in the chain.
   * @returns The complete ToolConfig object
   */
  build(): ToolConfig;
}

/**
 * Platform-specific configuration builder.
 * Used within `.platform()` calls to configure platform-specific overrides.
 */
export interface IPlatformConfigBuilder {
  /**
   * Define a binary that this tool provides on this platform.
   * @param name - The name of the binary executable
   * @param pattern - Optional glob pattern to locate the binary within extracted archives
   */
  bin(name: string, pattern?: string): this;

  /**
   * Set a specific version for this tool on this platform.
   * @param version - The version string (e.g., "1.2.3", "latest")
   */
  version(version: string): this;

  /**
   * Declare binary dependencies for this platform.
   *
   * During generation, the system validates dependencies exist and orders tools
   * so that dependencies are processed first.
   *
   * @param binaryNames - Names of binaries this tool depends on (from other tools' `.bin()` calls)
   */
  dependsOn(...binaryNames: KnownBinName[]): this;

  /**
   * Attach a hook handler to a specific lifecycle event.
   * Multiple handlers can be added by calling this method multiple times with the same event name.
   * @param event - The lifecycle event name (kebab-case)
   * @param handler - The async hook function to execute
   */
  hook(event: 'before-install', handler: AsyncInstallHook<IInstallContext>): this;
  hook(event: 'after-download', handler: AsyncInstallHook<IDownloadContext>): this;
  hook(event: 'after-extract', handler: AsyncInstallHook<IExtractContext>): this;
  hook(event: 'after-install', handler: AsyncInstallHook<IAfterInstallContext>): this;
  hook(event: HookEventName, handler: AsyncInstallHook<never>): this;

  /**
   * Configure zsh shell initialization for this platform.
   * @param callback - Function that receives shell configurator
   */
  zsh(callback: ShellConfiguratorCallback): this;
  zsh(callback: ShellConfiguratorAsyncCallback): Promise<this>;

  /**
   * Configure bash shell initialization for this platform.
   * @param callback - Function that receives shell configurator
   */
  bash(callback: ShellConfiguratorCallback): this;
  bash(callback: ShellConfiguratorAsyncCallback): Promise<this>;

  /**
   * Configure PowerShell initialization for this platform.
   * @param callback - Function that receives shell configurator
   */
  powershell(callback: ShellConfiguratorCallback): this;
  powershell(callback: ShellConfiguratorAsyncCallback): Promise<this>;

  /**
   * Create a symbolic link from source to target.
   * @param source - The source path (what to link from)
   * @param target - The target path (where to create the symlink)
   */
  symlink(source: string, target: string): this;
}

/**
 * Map of installer methods to their parameter types.
 * Built dynamically from plugins via IInstallParamsRegistry module augmentation.
 */
export type InstallMethod = keyof IInstallParamsRegistry;

/**
 * Install function with generic type inference for perfect type safety.
 *
 * This uses the tRPC/Zod pattern: a generic that narrows the params type
 * based on the method argument, providing crystal-clear error messages.
 *
 * @example
 * // ✅ This works
 * install('github-release', { repo: 'owner/repo' })
 *
 * // ❌ Clear error: "Property 'repo' is missing"
 * install('github-release', { assetPattern: '*.tar.gz' })
 *
 * // ❌ Clear error: "'repo' does not exist in type BrewInstallParams"
 * install('brew', { repo: 'test' })
 */
export interface InstallFunction {
  <M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): IToolConfigBuilder;
  (): IToolConfigBuilder; // For manual tools with no install params
}

/**
 * Platform-specific install function with the same generic type inference.
 */
export interface IPlatformInstallFunction {
  <M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): IPlatformConfigBuilder;
  (): IPlatformConfigBuilder;
}

/**
 * Context object for tool configuration.
 */
export interface IToolConfigContext extends IBaseToolContext {}

/**
 * Tool configuration function using the new install-first API.
 *
 * @param install - Function to select installer and provide params, returns IToolConfigBuilder
 * @param ctx - Context with paths and configuration
 *
 * @example
 * export default defineTool((install, ctx) =>
 *   install('github-release', { repo: 'BurntSushi/ripgrep' })
 *     .bin('rg')
 *     .version('14.0.0')
 * );
 */
export type AsyncConfigureTool = (
  install: InstallFunction,
  ctx: IToolConfigContext,
) => Promise<undefined | IToolConfigBuilder | ToolConfig> | undefined | IToolConfigBuilder | ToolConfig;

/**
 * Tool configuration function that returns a ToolConfig.
 */
export type AsyncConfigureToolWithReturn = (
  install: InstallFunction,
  ctx: IToolConfigContext,
) => Promise<ToolConfig> | ToolConfig;
