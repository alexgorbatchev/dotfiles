/**
 * Install-first API: Type-safe builder types with plugin system
 *
 * This module defines the new API where the installer method is chosen first.
 * Plugin types are loaded via module augmentation from installer packages.
 */

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

/**
 * Configuration options for shell completions in tool definitions.
 *
 * Specify how completion files should be handled for a tool. Completions can come from
 * static files bundled in the tool's archive or be generated dynamically by running a command.
 *
 * @example
 * // Static completion from archive
 * shell.completions('completions/_tool.zsh')
 *
 * @example
 * // Dynamic completion generation
 * shell.completions({ cmd: 'tool completion zsh' })
 *
 * @example
 * // With custom name and location
 * shell.completions({
 *   source: 'shell/_tool',
 *   name: '_mytool',
 *   targetDir: `${ctx.homeDir}/.zsh/completions`
 * })
 */
export interface IShellCompletionConfigOptions {
  /**
   * Path to a static completion file within the tool's extracted archive.
   * The path is relative to the archive root and resolved automatically during installation.
   *
   * Either `source` or `cmd` must be provided, but not both.
   *
   * @example 'completions/_tool.zsh'
   * @example '*\/complete/_rg' // Glob pattern to match versioned directories
   */
  source?: string;

  /**
   * Command to run to generate completion content dynamically.
   * The command executes in the tool's installation directory during shell script generation.
   * The tool must be installed before this command can run successfully.
   *
   * Either `source` or `cmd` must be provided, but not both.
   *
   * @example 'tool completion zsh'
   * @example 'fnm completions --shell zsh'
   */
  cmd?: string;

  /**
   * Binary name for the completion file.
   * When provided, shell-specific naming conventions are applied (e.g., `_bin` for zsh, `bin.bash` for bash).
   * Use this when the tool filename differs from the binary name.
   *
   * @example 'fnm'  // Results in '_fnm' for zsh, 'fnm.bash' for bash
   */
  bin?: string;

  /**
   * Custom filename for the completion file after installation.
   * Overrides both the default naming and the `bin` option.
   * Defaults to shell-specific naming conventions (e.g., `_toolname` for zsh, `toolname.bash` for bash).
   *
   * @example '_mytool'
   * @example 'custom-completion.zsh'
   */
  name?: string;

  /**
   * Absolute path where the completion file should be installed.
   * Use context variables to construct the path. Defaults to the generated shell scripts directory.
   *
   * @example `${ctx.homeDir}/.zsh/completions`
   * @example `${ctx.shellScriptsDir}/custom/completions`
   */
  targetDir?: string;
}

/**
 * Input type for configuring shell completions.
 * Accepts either a simple string path (interpreted as `source`) or a full configuration object.
 */
export type ShellCompletionConfigInput = string | IShellCompletionConfigOptions;

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
   * Sources a script file.
   * @param relativePath - Path to the script file relative to the tool directory.
   */
  source(relativePath: string): IShellConfigurator;

  /**
   * Configures shell completions from extracted archive or generated dynamically.
   *
   * **For static completions from archives:**
   * - Use string path or `source` property relative to extracted archive root
   * - Path is automatically resolved during installation when archive is extracted
   * - No context variables needed for `source` paths
   *
   * **For dynamic completions:**
   * - Use `cmd` property to execute a command that generates completion content
   *
   * @param completion - Completion configuration or path relative to extracted archive
   *
   * @example
   * // Static completion from downloaded archive
   * shell.completions('completions/_tool.zsh')
   *
   * // With custom target directory
   * shell.completions({
   *   source: 'completions/_tool.zsh',  // Relative to extracted archive (no ctx needed)
   *   targetDir: `${ctx.homeDir}/.zsh/completions`  // Absolute path using context
   * })
   *
   * // Dynamic completion generation
   * shell.completions({ cmd: 'tool completion zsh' })
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
    configure: (install: IPlatformInstallFunction) => IPlatformConfigBuilder
  ): this;

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
  ctx: IToolConfigContext
) => Promise<undefined | IToolConfigBuilder | ToolConfig> | undefined | IToolConfigBuilder | ToolConfig;

/**
 * Tool configuration function that returns a ToolConfig.
 */
export type AsyncConfigureToolWithReturn = (
  install: InstallFunction,
  ctx: IToolConfigContext
) => Promise<ToolConfig> | ToolConfig;
