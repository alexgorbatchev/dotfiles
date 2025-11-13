import type { BaseInstallContext } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import type { z } from 'zod';

type Primitive = string | number | bigint | boolean | symbol | undefined | null;

type DeepPartialArray<T extends readonly unknown[]> = number extends T['length']
  ? readonly PartialDeep<T[number]>[]
  : { [K in keyof T]?: PartialDeep<T[K]> };

type DeepPartialSet<T> = T extends Set<infer TValue>
  ? Set<PartialDeep<TValue>>
  : T extends ReadonlySet<infer TValue>
    ? ReadonlySet<PartialDeep<TValue>>
    : never;

type DeepPartialMap<T> = T extends Map<infer TKey, infer TValue>
  ? Map<TKey, PartialDeep<TValue>>
  : T extends ReadonlyMap<infer TKey, infer TValue>
    ? ReadonlyMap<TKey, PartialDeep<TValue>>
    : never;

type DeepPartialObject<T extends object> = {
  [K in keyof T]?: PartialDeep<T[K]>;
};

export type PartialDeep<T> = T extends Primitive
  ? T
  : T extends (...args: infer TArgs) => infer TResult
    ? (...args: TArgs) => TResult
    : T extends Promise<infer TValue>
      ? Promise<PartialDeep<TValue>>
      : T extends readonly unknown[]
        ? DeepPartialArray<T>
        : T extends Set<unknown> | ReadonlySet<unknown>
          ? DeepPartialSet<T>
          : T extends Map<unknown, unknown> | ReadonlyMap<unknown, unknown>
            ? DeepPartialMap<T>
            : T extends object
              ? DeepPartialObject<T>
              : Partial<T>;

/**
 * Standard success result for operations.
 */
export interface OperationSuccess {
  success: true;
}

/**
 * Standard failure result for operations.
 * When an operation fails, it MUST provide an error explaining why.
 */
export interface OperationFailure {
  success: false;
  error: string;
}

/**
 * Options passed to plugin install method
 */
export interface InstallOptions {
  force?: boolean;
  shimMode?: boolean;
}

/**
 * Result from plugin installation - success case
 */
export type InstallResultSuccess<TMetadata = unknown> = OperationSuccess & {
  version?: string;
  binaryPaths?: string[];
  metadata?: TMetadata;
  installationMethod?: string;
};

/**
 * Result from plugin installation - failure case
 */
export type InstallResultFailure = OperationFailure & {
  installationMethod?: string;
};

/**
 * Result from plugin installation
 */
export type InstallResult<TMetadata = unknown> = InstallResultSuccess<TMetadata> | InstallResultFailure;

/**
 * Result from plugin update check - success case
 */
export type UpdateCheckResultSuccess = OperationSuccess & {
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
};

/**
 * Result from plugin update check - failure case
 */
export type UpdateCheckResultFailure = OperationFailure;

/**
 * Result from plugin update check
 */
export type UpdateCheckResult = UpdateCheckResultSuccess | UpdateCheckResultFailure;

/**
 * Options for updating a tool
 */
export interface UpdateOptions {
  force?: boolean;
  targetVersion?: string;
}

/**
 * Result from plugin update - success case
 */
export type UpdateResultSuccess = OperationSuccess & {
  oldVersion?: string;
  newVersion?: string;
};

/**
 * Result from plugin update - failure case
 */
export type UpdateResultFailure = OperationFailure;

/**
 * Result from plugin update
 */
export type UpdateResult = UpdateResultSuccess | UpdateResultFailure;

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
