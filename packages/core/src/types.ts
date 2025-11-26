import type { InstallContext } from '@dotfiles/core';
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
export interface IOperationSuccess {
  success: true;
}

/**
 * Standard failure result for operations.
 * When an operation fails, it MUST provide an error explaining why.
 */
export interface IOperationFailure {
  success: false;
  error: string;
}

/**
 * Options passed to plugin install method
 */
export interface IInstallOptions {
  force?: boolean;
  shimMode?: boolean;
}

/**
 * Result from plugin installation - success case
 */
export type InstallResultSuccess<TMetadata = unknown> = IOperationSuccess & {
  version?: string;
  binaryPaths?: string[];
  metadata?: TMetadata;
  installationMethod?: string;
};

/**
 * Result from plugin installation - failure case
 */
export type InstallResultFailure = IOperationFailure & {
  installationMethod?: string;
};

/**
 * Result from plugin installation
 */
export type InstallResult<TMetadata = unknown> = InstallResultSuccess<TMetadata> | InstallResultFailure;

/**
 * Result from plugin update check - success case
 */
export type UpdateCheckResultSuccess = IOperationSuccess & {
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
};

/**
 * Result from plugin update check - failure case
 */
export type UpdateCheckResultFailure = IOperationFailure;

/**
 * Result from plugin update check
 */
export type UpdateCheckResult = UpdateCheckResultSuccess | UpdateCheckResultFailure;

/**
 * Options for updating a tool
 */
export interface IUpdateOptions {
  force?: boolean;
  targetVersion?: string;
}

/**
 * Result from plugin update - success case
 */
export type UpdateResultSuccess = IOperationSuccess & {
  oldVersion?: string;
  newVersion?: string;
};

/**
 * Result from plugin update - failure case
 */
export type UpdateResultFailure = IOperationFailure;

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
 *   interface IInstallParamsRegistry {
 *     'github-release': GithubReleaseInstallParams;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Intentionally empty - extended via module augmentation
export interface IInstallParamsRegistry {
  // Plugins add their install param types via module augmentation
}

/**
 * Registry of plugin tool config types - plugins extend this interface via module augmentation
 *
 * @example
 * ```typescript
 * // In your plugin file
 * declare module '@dotfiles/core' {
 *   interface IToolConfigRegistry {
 *     'github-release': GithubReleaseToolConfig;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Intentionally empty - extended via module augmentation
export interface IToolConfigRegistry {
  // Plugins add their tool config types via module augmentation
}

/**
 * Registry of plugin result types - plugins extend this interface via module augmentation
 *
 * @example
 * ```typescript
 * // In your plugin file
 * declare module '@dotfiles/core' {
 *   interface IPluginResultRegistry {
 *     'github-release': GitHubReleaseInstallResult;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: Intentionally empty - extended via module augmentation
export interface IPluginResultRegistry {
  // Plugins add their result types via module augmentation
}

/**
 * Helper type to register a plugin's result type in the registry
 * Ensures the key matches the plugin's method type parameter
 *
 * @example
 * ```typescript
 * declare module '@dotfiles/core' {
 *   interface IPluginResultRegistry extends RegisterPluginResult<'github-release', GitHubReleaseInstallResult> {}
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
export type ToolConfig = IToolConfigRegistry extends Record<string, never>
  ? never // No plugins registered - this should be an error case
  : IToolConfigRegistry[keyof IToolConfigRegistry];

/**
 * Union of all registered plugin result types
 * If no plugins are registered, falls back to generic InstallResult<unknown>
 */
export type AggregateInstallResult = IPluginResultRegistry extends Record<string, never>
  ? InstallResult<unknown>
  : IPluginResultRegistry[keyof IPluginResultRegistry];

/**
 * Plugin validation result
 */
export interface IValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Core plugin interface that all installer plugins must implement
 */
export interface IInstallerPlugin<
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

  /** Whether validation results can be cached (validation based on static conditions like OS) */
  readonly staticValidation?: boolean;

  /**
   * Whether the plugin manages binaries externally (e.g., Homebrew, apt, system package managers).
   * When true, the installer will not create timestamped installation directories.
   * The plugin is responsible for tracking where binaries are installed.
   * @default false
   */
  readonly externallyManaged?: boolean;

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
    context: InstallContext,
    options?: IInstallOptions,
    logger?: TsLogger
  ): Promise<InstallResult<TMetadata>>;

  /** Optional: Validate plugin can run in current environment */
  validate?(context: InstallContext): Promise<IValidationResult>;

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
    context: InstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult>;

  /** Optional: Check if plugin supports updating tools */
  supportsUpdate?(): boolean;

  /** Optional: Update tool to latest version */
  updateTool?(
    toolName: string,
    toolConfig: TConfig,
    context: InstallContext,
    options: IUpdateOptions,
    logger: TsLogger
  ): Promise<UpdateResult>;

  /** Optional: Check if plugin can provide README */
  supportsReadme?(): boolean;

  /** Optional: Get README URL for a tool */
  getReadmeUrl?(toolName: string, toolConfig: TConfig): string | null;

  /**
   * Optional: Resolve the version that will be installed without performing full installation.
   * This allows the installer to create version-based directories instead of timestamp-based ones.
   * If this method is not implemented or returns null, the installer will fall back to timestamps.
   *
   * @param toolName - Name of the tool being installed
   * @param toolConfig - Complete tool configuration
   * @param context - Installation context with system information
   * @param logger - Logger instance for debug output
   * @returns Normalized version string, or null if version cannot be resolved
   */
  resolveVersion?(
    toolName: string,
    toolConfig: TConfig,
    context: InstallContext,
    logger: TsLogger
  ): Promise<string | null>;
}
