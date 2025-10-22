import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, ExtractResult, ToolConfig } from '@dotfiles/schemas';
import type { InstallOptions } from '../types';

/**
 * Context passed between installation steps
 */
export interface StepContext extends BaseInstallContext {
  toolFs: IFileSystem;
  logger: TsLogger;
  toolConfig: ToolConfig;
  options?: InstallOptions;
  success: boolean;
  error?: string;
  downloadPath?: string;
  extractDir?: string;
  extractResult?: ExtractResult;
  version?: string;
  info?: Record<string, unknown>;
}

/**
 * Base class for all installation steps
 */
export abstract class InstallationStep<TParams = unknown> {
  protected params: TParams;

  constructor(params: TParams) {
    this.params = params;
  }

  /**
   * Execute this step with the given context
   * @param context The current step context
   * @returns Updated context with results of this step
   */
  abstract execute(context: StepContext): Promise<StepContext>;

  /**
   * Get a human-readable name for this step (for logging)
   */
  abstract getStepName(): string;
}
