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

export interface IShellCompletionConfigOptions {
  source: string;
  name?: string;
  targetDir?: string;
}

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
   * Configures shell completions.
   * @param completion - Completion configuration or path to completion script.
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
  bin(name: string, pattern?: string): this;
  version(version: string): this;
  dependsOn(...binaryNames: KnownBinName[]): this;
  /**
   * Attach a hook handler to a specific lifecycle event.
   * Multiple handlers can be added by calling this method multiple times with the same event name.
   *
   * @param event - The lifecycle event name (kebab-case)
   * @param handler - The async hook function to execute
   */
  hook(event: 'before-install', handler: AsyncInstallHook<IInstallContext>): this;
  hook(event: 'after-download', handler: AsyncInstallHook<IDownloadContext>): this;
  hook(event: 'after-extract', handler: AsyncInstallHook<IExtractContext>): this;
  hook(event: 'after-install', handler: AsyncInstallHook<IAfterInstallContext>): this;
  hook(event: HookEventName, handler: AsyncInstallHook<never>): this;
  zsh(callback: ShellConfiguratorCallback): this;
  zsh(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  bash(callback: ShellConfiguratorCallback): this;
  bash(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  powershell(callback: ShellConfiguratorCallback): this;
  powershell(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  symlink(source: string, target: string): this;
  platform(platforms: Platform, configure: (install: IPlatformInstallFunction) => IPlatformConfigBuilder): this;
  platform(
    platforms: Platform,
    architectures: Architecture,
    configure: (install: IPlatformInstallFunction) => IPlatformConfigBuilder
  ): this;
  build(): ToolConfig;
}

/**
 * Platform-specific configuration builder.
 */
export interface IPlatformConfigBuilder {
  bin(name: string, pattern?: string): this;
  version(version: string): this;
  dependsOn(...binaryNames: KnownBinName[]): this;
  /**
   * Attach a hook handler to a specific lifecycle event.
   * Multiple handlers can be added by calling this method multiple times with the same event name.
   *
   * @param event - The lifecycle event name (kebab-case)
   * @param handler - The async hook function to execute
   */
  hook(event: 'before-install', handler: AsyncInstallHook<IInstallContext>): this;
  hook(event: 'after-download', handler: AsyncInstallHook<IDownloadContext>): this;
  hook(event: 'after-extract', handler: AsyncInstallHook<IExtractContext>): this;
  hook(event: 'after-install', handler: AsyncInstallHook<IAfterInstallContext>): this;
  hook(event: HookEventName, handler: AsyncInstallHook<never>): this;
  zsh(callback: ShellConfiguratorCallback): this;
  zsh(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  bash(callback: ShellConfiguratorCallback): this;
  bash(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  powershell(callback: ShellConfiguratorCallback): this;
  powershell(callback: ShellConfiguratorAsyncCallback): Promise<this>;
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
