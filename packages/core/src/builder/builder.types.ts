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
import type { IInstallParamsRegistry, ToolConfig } from '../types';
import type { ICompletionContext } from './ICompletionContext';

/**
 * Common options for all completion configurations.
 */
interface IShellCompletionConfigBase {
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
}

/**
 * Completion from a static file.
 */
interface IShellCompletionSourceConfig extends IShellCompletionConfigBase {
  /**
   * Path to an existing completion file.
   *
   * - **Relative** (e.g., `_tool.zsh`) → resolved from `toolDir` (next to `.tool.ts`)
   * - **Absolute** (e.g., `${ctx.currentDir}/completions/_tool`) → used as-is
   *
   * For files extracted from archives, use `ctx.currentDir` to build the absolute path.
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
   * '_tool.zsh'
   * `${ctx.currentDir}/completions/_tool`
   */
  source: string;
}

/**
 * Completion generated dynamically by running a command.
 */
interface IShellCompletionCmdConfig extends IShellCompletionConfigBase {
  /**
   * Command to generate completion content dynamically.
   *
   * Executes in the tool's installation directory during shell script generation.
   * The tool must be installed before this command can run.
   *
   * Equivalent bash:
   * ```bash
   * cd ${ctx.projectConfig.paths.installDir}/mytool/1.0.0
   * ./bin/tool completion zsh > ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_tool
   * ```
   *
   * @example
   * 'tool completion zsh'
   * 'fnm completions --shell zsh'
   */
  cmd: string;
}

/**
 * Completion from a downloaded URL (archive or direct file).
 */
interface IShellCompletionUrlConfig extends IShellCompletionConfigBase {
  /**
   * URL to download the completion file or archive from.
   *
   * Supports both:
   * - Direct completion files (e.g., `_tool.zsh`, `tool.bash`)
   * - Archives (e.g., `.tar.gz`, `.zip`) which are automatically extracted
   *
   * The file/archive is downloaded to `ctx.currentDir`.
   *
   * Equivalent bash (archive):
   * ```bash
   * curl -fsSL "https://github.com/user/repo/releases/download/v1.0.0/completions.tar.gz" \
   *   -o ${ctx.projectConfig.paths.installDir}/mytool/1.0.0/completions.tar.gz
   * tar -xzf completions.tar.gz -C ${ctx.projectConfig.paths.installDir}/mytool/1.0.0/
   * ```
   *
   * Equivalent bash (direct file):
   * ```bash
   * curl -fsSL "https://raw.githubusercontent.com/user/repo/main/completions/_tool" \
   *   -o ${ctx.projectConfig.paths.installDir}/mytool/1.0.0/_tool
   * ```
   *
   * @example 'https://github.com/user/repo/releases/download/v1.0.0/completions.tar.gz'
   * @example 'https://raw.githubusercontent.com/user/repo/main/completions/_tool'
   */
  url: string;

  /**
   * Path to the completion file.
   *
   * For archives: absolute path to the completion file within the extracted archive.
   * For direct files: optional - if omitted, the filename is derived from the URL.
   *
   * The archive is extracted to `ctx.currentDir`, so use that to build the path.
   *
   * Equivalent bash (archive - source required):
   * ```bash
   * ln -s ${ctx.currentDir}/completions/_tool ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_tool
   * ```
   *
   * Equivalent bash (direct file - source omitted):
   * ```bash
   * # Filename '_tool' derived from URL
   * ln -s ${ctx.currentDir}/_tool ${ctx.projectConfig.paths.shellScriptsDir}/{shell}/completions/_tool
   * ```
   *
   * @example `${ctx.currentDir}/completions/_tool` - for archives
   * @example undefined - for direct files (filename derived from URL)
   */
  source?: string;
}

/**
 * Configuration options for shell completions.
 *
 * Valid combinations:
 * - `{ source }` - Static file (relative to toolDir or absolute)
 * - `{ cmd }` - Generate dynamically by running a command
 * - `{ url }` - Download direct completion file from URL
 * - `{ url, source }` - Download archive, extract, use source as path to file within
 *
 * @example
 * shell.completions({ source: '_tool.zsh' })
 * shell.completions({ cmd: 'tool completion zsh' })
 * shell.completions({ url: 'https://raw.githubusercontent.com/user/repo/main/_tool' })
 * shell.completions({ url: 'https://.../completions.tar.gz', source: `${ctx.currentDir}/_tool` })
 */
export type ShellCompletionConfigValue =
  | string
  | IShellCompletionSourceConfig
  | IShellCompletionCmdConfig
  | IShellCompletionUrlConfig;

/**
 * Input type for configuring shell completions.
 */
export type ShellCompletionConfigInput = Resolvable<ICompletionContext, ShellCompletionConfigValue>;

/**
 * Fluent configurator used inside shell callbacks for the new shell API.
 * Generic parameter tracks function names defined via `functions()` for type-safe `sourceFunction()`.
 */
export interface IShellConfigurator<KnownFunctions extends string = never> {
  /**
   * Sets environment variables for the shell.
   *
   * **Note**: To modify PATH, use `shell.path()` instead. Setting PATH via
   * env() is prohibited to ensure proper deduplication.
   *
   * @param values - A record of environment variable names and values.
   */
  env<T extends Record<string, string>>(
    values: 'PATH' extends keyof T ? ['ERROR: Use shell.path() to modify PATH'] : T,
  ): IShellConfigurator<KnownFunctions>;

  /**
   * Sets shell aliases.
   * @param values - A record of alias names and their commands.
   */
  aliases(values: Record<string, string>): IShellConfigurator<KnownFunctions>;

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
   * @example
   * shell.sourceFile('init.zsh')
   * shell.sourceFile(`${ctx.currentDir}/shell/init.sh`)
   */
  sourceFile(relativePath: string): IShellConfigurator<KnownFunctions>;

  /**
   * Sources the output of a shell function defined via `functions()`.
   * The function must be defined before this call via `.functions({ fnName: '...' })`.
   *
   * **Important**: When a function is used with `sourceFunction()`, its body must
   * **output shell code to stdout**. This output is then sourced (executed) in the
   * current shell. Common tools like `fnm`, `pyenv`, `rbenv`, and `zoxide` have
   * commands that print shell code for this purpose.
   *
   * Unlike `sourceFile()`, this does NOT check if the output exists and is NOT wrapped
   * in a subshell. It emits: `source <(fnName)`
   *
   * @param functionName - Name of a function defined via `.functions()`.
   *
   * @example
   * // fnm env --use-on-cd PRINTS shell code like:
   * // export FNM_DIR="/Users/me/.fnm"
   * // export PATH="...fnm/bin:$PATH"
   * shell.functions({ initFnm: 'fnm env --use-on-cd' })
   * shell.sourceFunction('initFnm')
   * // Generates: source <(initFnm)
   */
  sourceFunction(functionName: KnownFunctions): IShellConfigurator<KnownFunctions>;

  /**
   * Sources the output of inline shell code by wrapping it in a temporary function.
   * The content must **output shell code to stdout** - this output is then sourced.
   *
   * This is useful when you need to source the output of a command inline without
   * defining a named function via `functions()`.
   *
   * @param content - Shell code that **prints** shell code to stdout
   *
   * @example
   * // Content outputs "export MY_VAR=value" which gets sourced
   * shell.source('echo "export MY_VAR=value"')
   * // Generates:
   * // __dotfiles_source_toolname_0() {
   * //   echo "export MY_VAR=value"
   * // }
   * // source <(__dotfiles_source_toolname_0)
   * // unset -f __dotfiles_source_toolname_0
   *
   * @example
   * // fnm env prints shell code like "export PATH=..." which gets sourced
   * shell.source('fnm env --use-on-cd')
   */
  source(content: string): IShellConfigurator<KnownFunctions>;

  /**
   * Configures shell completions from static files or generated dynamically.
   *
   * **Lifecycle**: All completions are generated only after the tool is installed.
   * This ensures cmd-based completions can execute the installed binary and callbacks
   * receive the actual installed version in `ctx.version`.
   *
   * - **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
   * - **Files from downloaded archives** (GitHub releases, tarballs) are extracted to
   *   `ctx.currentDir`. Use this to build an absolute path.
   * - **Dynamic** → use `{ cmd: 'tool completion zsh' }`
   *
   * @param completion - Path string, config object, or callback
   *
   * @example
   * shell.completions('_tool.zsh')
   * shell.completions(`${ctx.currentDir}/completions/_tool`)
   * shell.completions({ cmd: 'tool completion zsh' })
   * shell.completions((ctx) => ({
   *   url: `https://github.com/owner/repo/releases/download/${ctx.version}/completions.zsh`,
   *   source: `${ctx.currentDir}/_tool`
   * }))
   */
  completions(completion: ShellCompletionConfigInput): IShellConfigurator<KnownFunctions>;

  /**
   * Adds a script to be executed once during shell initialization.
   * @param script - The script content.
   */
  once(script: string): IShellConfigurator<KnownFunctions>;

  /**
   * Adds a script to be executed always during shell initialization.
   * @param script - The script content.
   */
  always(script: string): IShellConfigurator<KnownFunctions>;

  /**
   * Defines shell functions.
   *
   * @param values - A record of function names to their body content.
   *
   * @example
   * shell.functions({
   *   mycommand: 'echo "Running mycommand"'
   * })
   * // Generates:
   * // mycommand() {
   * //   echo "Running mycommand"
   * // }
   */
  functions<K extends string>(values: Record<K, string>): IShellConfigurator<KnownFunctions | K>;

  /**
   * Adds a directory to the PATH environment variable.
   * Paths are deduplicated during shell init generation.
   *
   * @param pathValue - Directory path to add to PATH. May contain $HOME or other env vars.
   *
   * @example
   * shell.path('$HOME/.local/bin')
   * shell.path('${ctx.currentDir}/bin')
   */
  path(pathValue: Resolvable<void, string>): IShellConfigurator<KnownFunctions>;
}

export type ShellConfiguratorSyncResult = IShellConfigurator<string> | undefined;
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
  platform(
    platforms: Platform,
    configure: (install: IPlatformInstallFunction) => Omit<IPlatformConfigBuilder, 'bin'>,
  ): this;

  /**
   * Add platform and architecture-specific configuration overrides.
   * @param platforms - Target platform(s): 'macos', 'linux', 'windows', or array
   * @param architectures - Target architecture(s): 'x64', 'arm64', or array
   * @param configure - Function to configure platform-specific settings
   */
  platform(
    platforms: Platform,
    architectures: Architecture,
    configure: (install: IPlatformInstallFunction) => Omit<IPlatformConfigBuilder, 'bin'>,
  ): this;

  /**
   * Mark this tool as disabled.
   * A disabled tool is skipped during generation with a warning message.
   * Useful for temporarily disabling a tool without removing its configuration.
   */
  disable(): this;

  /**
   * Restrict this tool to specific hostnames.
   * When set, the tool is only installed on machines where the hostname matches.
   * @param pattern - A literal hostname string or regex pattern (e.g., "my-laptop" or /^work-.*$/)
   */
  hostname(pattern: string | RegExp): this;

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
 * Registry of installer methods that do not support .bin() / shim generation.
 * Plugins extend this via module augmentation.
 */
export interface INoBinMethodRegistry {
  __placeholder__?: never;
}

type NoBinMethodKeys = Exclude<keyof INoBinMethodRegistry, '__placeholder__'>;

/**
 * Resolves the builder type based on whether the method supports .bin().
 * Methods registered in INoBinMethodRegistry get a builder without .bin().
 */
type ToolBuilderForMethod<M extends InstallMethod> = [M] extends [NoBinMethodKeys] ? Omit<IToolConfigBuilder, 'bin'>
  : IToolConfigBuilder;

type PlatformBuilderForMethod<M extends InstallMethod> = [M] extends [NoBinMethodKeys]
  ? Omit<IPlatformConfigBuilder, 'bin'>
  : IPlatformConfigBuilder;

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
  <M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): ToolBuilderForMethod<M>;
  (): IToolConfigBuilder; // For manual tools with no install params
}

/**
 * Platform-specific install function with the same generic type inference.
 */
export interface IPlatformInstallFunction {
  <M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): PlatformBuilderForMethod<M>;
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
) =>
  | Promise<undefined | IToolConfigBuilder | Omit<IToolConfigBuilder, 'bin'> | ToolConfig>
  | undefined
  | IToolConfigBuilder
  | Omit<IToolConfigBuilder, 'bin'>
  | ToolConfig;

/**
 * Tool configuration function that returns a ToolConfig.
 */
export type AsyncConfigureToolWithReturn = (
  install: InstallFunction,
  ctx: IToolConfigContext,
) => Promise<ToolConfig> | ToolConfig;
