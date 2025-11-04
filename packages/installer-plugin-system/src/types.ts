import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext } from '@dotfiles/schemas';
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

  /** Zod schema for complete tool config */
  readonly toolConfigSchema: z.ZodType<TConfig>;

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
}
