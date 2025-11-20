/**
 * Install-first API: Type-safe builder types with plugin system
 *
 * This module defines the new API where the installer method is chosen first.
 * Plugin types are loaded via module augmentation from installer packages.
 */

import type { Architecture, BaseToolContext, Platform } from '../common';
import type { ProjectConfig } from '../config';
import type { AsyncInstallHook } from '../installer';
import type { ShellScript } from '../shell';
import type { ShellCompletionConfig } from '../tool-config/shell';
import type { InstallParamsRegistry, ToolConfig } from '../types';

/**
 * Install params come from plugins via InstallParamsRegistry module augmentation.
 * Each plugin registers its param types by augmenting the InstallParamsRegistry interface.
 */

/**
 * Configuration for shell-specific properties.
 */
export interface ShellConfig {
  completions?: ShellCompletionConfig;
  shellInit?: ShellScript[];
  aliases?: Record<string, string>;
  environment?: Record<string, string>;
}

/**
 * Known binary names for type-safe dependsOn() calls.
 * Generated tool type definitions augment this registry with string literal properties.
 * The fallback behaviour resolves to `string` when no binary names are registered.
 */
export interface KnownBinNameRegistry {
  __placeholder__?: never;
}

type KnownBinNameKeys = Exclude<keyof KnownBinNameRegistry, '__placeholder__'>;

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
export interface ToolConfigBuilder {
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
  hook(event: HookEventName, handler: AsyncInstallHook): this;
  zsh(config: ShellConfig): this;
  bash(config: ShellConfig): this;
  powershell(config: ShellConfig): this;
  symlink(source: string, target: string): this;
  platform(platforms: Platform, configure: (install: PlatformInstallFunction) => PlatformConfigBuilder): this;
  platform(
    platforms: Platform,
    architectures: Architecture,
    configure: (install: PlatformInstallFunction) => PlatformConfigBuilder
  ): this;
  build(): ToolConfig;
}

/**
 * Platform-specific configuration builder.
 */
export interface PlatformConfigBuilder {
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
  hook(event: HookEventName, handler: AsyncInstallHook): this;
  zsh(config: ShellConfig): this;
  bash(config: ShellConfig): this;
  powershell(config: ShellConfig): this;
  symlink(source: string, target: string): this;
}

/**
 * Map of installer methods to their parameter types.
 * Built dynamically from plugins via InstallParamsRegistry module augmentation.
 */
export type InstallMethod = keyof InstallParamsRegistry;

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
  <M extends InstallMethod>(method: M, params: InstallParamsRegistry[M]): ToolConfigBuilder;
  (): ToolConfigBuilder; // For manual tools with no install params
}

/**
 * Platform-specific install function with the same generic type inference.
 */
export interface PlatformInstallFunction {
  <M extends InstallMethod>(method: M, params: InstallParamsRegistry[M]): PlatformConfigBuilder;
  (): PlatformConfigBuilder;
}

/**
 * Context object for tool configuration.
 */
export interface ToolConfigContext extends BaseToolContext {
  /**
   * The user's parsed application configuration from the main config file.
   */
  projectConfig: ProjectConfig;
}

/**
 * Tool configuration function using the new install-first API.
 *
 * @param install - Function to select installer and provide params, returns ToolConfigBuilder
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
  ctx: ToolConfigContext
) => Promise<undefined | ToolConfigBuilder | ToolConfig> | undefined | ToolConfigBuilder | ToolConfig;

/**
 * Tool configuration function that returns a ToolConfig.
 */
export type AsyncConfigureToolWithReturn = (
  install: InstallFunction,
  ctx: ToolConfigContext
) => Promise<ToolConfig> | ToolConfig;
