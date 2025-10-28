import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, ToolConfig } from '@dotfiles/schemas';
import type { InstallationStep, StepContext } from '../steps/base';
import type { InstallOptions, InstallResult } from '../types';
import { createToolFileSystem } from './createToolFileSystem';
import { getBinaryPaths } from './getBinaryPaths';
import { messages } from './log-messages';

/**
 * Orchestrates the execution of installation steps in a pipeline
 */
export class InstallationPipeline {
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger) {
    this.logger = parentLogger.getSubLogger({ name: 'InstallationPipeline' });
  }

  /**
   * Execute a series of installation steps
   */
  async execute(
    toolName: string,
    toolConfig: ToolConfig,
    context: BaseInstallContext,
    fs: IFileSystem,
    options: InstallOptions | undefined,
    steps: InstallationStep[]
  ): Promise<InstallResult> {
    const logger = this.logger.getSubLogger({ name: `install-${toolName}` });
    logger.debug(messages.pipeline.starting(toolName, steps.length));

    try {
      const toolFs = createToolFileSystem(fs, toolName);

      let stepContext: StepContext = {
        ...context,
        toolFs,
        logger,
        toolConfig,
        options,
        success: true,
      };

      // Execute each step in sequence
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) {
          return {
            success: false,
            error: `Step at index ${i} is undefined`,
          };
        }

        const stepName = step.getStepName();

        logger.debug(messages.pipeline.executingStep(i + 1, steps.length, stepName));

        stepContext = await step.execute(stepContext);

        if (!stepContext.success) {
          logger.error(messages.pipeline.stepFailed(stepName, stepContext.error));
          return {
            success: false,
            error: stepContext.error || `Step ${stepName} failed`,
          };
        }

        logger.debug(messages.pipeline.stepCompleted(stepName));
      }

      // Calculate final binary paths
      const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

      logger.debug(messages.pipeline.completed(toolName));

      return {
        success: true,
        binaryPaths,
        version: stepContext.version,
        info: stepContext.info,
      };
    } catch (error) {
      logger.error(messages.outcome.installFailed('pipeline', toolName), error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
