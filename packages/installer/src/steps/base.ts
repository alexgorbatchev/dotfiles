import type { BaseInstallContext, ExtractResult, OperationFailure, OperationSuccess, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { InstallOptions } from '../types';

/**
 * Base context properties shared by all installation steps
 */
type BaseStepContext = BaseInstallContext & {
  toolFs: IFileSystem;
  logger: TsLogger;
  toolConfig: ToolConfig;
  options?: InstallOptions;
  downloadPath?: string;
  extractDir?: string;
  extractResult?: ExtractResult;
  version?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Context passed between installation steps - success case
 */
export type StepContextSuccess = BaseStepContext & OperationSuccess;

/**
 * Context passed between installation steps - failure case
 */
export type StepContextFailure = BaseStepContext & OperationFailure;

/**
 * Context passed between installation steps
 */
export type StepContext = StepContextSuccess | StepContextFailure;

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
