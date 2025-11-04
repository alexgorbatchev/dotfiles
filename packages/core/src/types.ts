import type { BaseInstallContext } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import type { z } from 'zod';

/**
 * Options passed to plugin install method
 */
export interface InstallOptions {
  force?: boolean;
  shimMode?: boolean;
}

/**
 * Result from plugin installation
 */
export interface InstallResult<TMetadata = unknown> {
  success: boolean;
  error?: string;
  version?: string;
  binaryPaths?: string[];
  metadata?: TMetadata;
}

/**
 * Result from plugin update check
 */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

/**
 * Options for updating a tool
 */
export interface UpdateOptions {
  force?: boolean;
  targetVersion?: string;
}

/**
 * Result from plugin update
 */
export interface UpdateResult {
  success: boolean;
  error?: string;
  oldVersion?: string;
  newVersion?: string;
}

/**
 * Registry of plugin install parameter types - plugins extend this interface via module augmentation
 *
 * @example
 * ```typescript
 * // In your plugin file
 * declare module '@dotfiles/core' {
 *   interface InstallParamsRegistry {
 *     'github-release': GithubReleaseInstallParams;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Intentionally empty - extended via module augmentation
export interface InstallParamsRegistry {
  // Plugins add their install param types via module augmentation
}

/**
 * Registry of plugin tool config types - plugins extend this interface via module augmentation
 *
 * @example
 * ```typescript
 * // In your plugin file
 * declare module '@dotfiles/core' {
 *   interface ToolConfigRegistry {
 *     'github-release': GithubReleaseToolConfig;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Intentionally empty - extended via module augmentation
export interface ToolConfigRegistry {
  // Plugins add their tool config types via module augmentation
}

/**
 * Registry of plugin result types - plugins extend this interface via module augmentation
 *
 * @example
 * ```typescript
 * // In your plugin file
 * declare module '@dotfiles/core' {
 *   interface PluginResultRegistry {
 *     'github-release': GitHubReleaseInstallResult;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Intentionally empty - extended via module augmentation
export interface PluginResultRegistry {
  // Plugins add their result types via module augmentation
}

/**
 * Helper type to register a plugin's result type in the registry
 * Ensures the key matches the plugin's method type parameter
 *
 * @example
 * ```typescript
 * declare module '@dotfiles/core' {
 *   interface PluginResultRegistry extends RegisterPluginResult<'github-release', GitHubReleaseInstallResult> {}
 * }
 * ```
 */
export type RegisterPluginResult<TMethod extends string, TResult> = {
  [K in TMethod]: TResult;
};

/**
 * Union of all registered plugin tool config types.
 * Built dynamically from plugins via module augmentation.
 */
export type ToolConfig = ToolConfigRegistry extends Record<string, never>
  ? never // No plugins registered - this should be an error case
  : ToolConfigRegistry[keyof ToolConfigRegistry];

/**
 * Union of all registered plugin result types
 * If no plugins are registered, falls back to generic InstallResult<unknown>
 */
export type AggregateInstallResult = PluginResultRegistry extends Record<string, never>
  ? InstallResult<unknown>
  : PluginResultRegistry[keyof PluginResultRegistry];

/**
 * Plugin validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Core plugin interface that all installer plugins must implement
 */
export interface InstallerPlugin<
  TMethod extends string = string,
  TParams = unknown,
  TConfig = unknown,
  TMetadata = unknown,
> {
  /** Unique method name (e.g., 'github-release', 'npm') */
  readonly method: TMethod;

  /** Human-readable display name */
  readonly displayName: string;

  /** Plugin version (semver) */
  readonly version: string;

  /** Plugin description */
  readonly description?: string;

  /** Whether validation results can be cached (validation based on static conditions like OS) */
  readonly staticValidation?: boolean;

  /** Zod schema for installation parameters */
  readonly paramsSchema: z.ZodType<TParams>;

  /**
   * Zod schema for complete tool config.
   * Uses z.ZodTypeAny to allow schema inference to differ from TConfig type
   * (needed for platformConfigs type override).
   */
  readonly toolConfigSchema: z.ZodTypeAny;

  /** Installation function */
  install(
    toolName: string,
    toolConfig: TConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
    logger?: TsLogger
  ): Promise<InstallResult<TMetadata>>;

  /** Optional: Validate plugin can run in current environment */
  validate?(context: BaseInstallContext): Promise<ValidationResult>;

  /** Optional: Plugin initialization */
  initialize?(): Promise<void>;

  /** Optional: Plugin cleanup */
  cleanup?(): Promise<void>;

  /** Optional: Check if plugin supports update checking */
  supportsUpdateCheck?(): boolean;

  /** Optional: Check for available updates */
  checkUpdate?(
    toolName: string,
    toolConfig: TConfig,
    context: BaseInstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult>;

  /** Optional: Check if plugin supports updating tools */
  supportsUpdate?(): boolean;

  /** Optional: Update tool to latest version */
  updateTool?(
    toolName: string,
    toolConfig: TConfig,
    context: BaseInstallContext,
    options: UpdateOptions,
    logger: TsLogger
  ): Promise<UpdateResult>;

  /** Optional: Check if plugin can provide README */
  supportsReadme?(): boolean;

  /** Optional: Get README URL for a tool */
  getReadmeUrl?(toolName: string, toolConfig: TConfig): string | null;
}
