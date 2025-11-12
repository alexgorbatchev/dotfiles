/**
 * Install-first API: Type-safe builder types with plugin system
 *
 * This module defines the new API where the installer method is chosen first.
 * Plugin types are loaded via module augmentation from installer packages.
 */

import type { Architecture, BaseToolContext, Platform } from '../common';
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
 * Fluent builder interface for configuring a tool.
 * Returned by InstallFunction after selecting installer method.
 */
export interface ToolConfigBuilder {
  bin(name: string, pattern?: string): this;
  version(version: string): this;
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;
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
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;
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
export interface ToolConfigContext extends BaseToolContext {}

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
