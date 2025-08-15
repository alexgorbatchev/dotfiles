import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, ToolConfig } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';
import type { InstallationStep, StepContext } from './steps/base';
import { createToolFileSystem, getBinaryPaths } from './utils';

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
    logger.debug(logs.installer.debug.pipelineStarting(), toolName, steps.length);

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

        logger.debug(logs.installer.debug.pipelineStepExecuting(), i + 1, steps.length, stepName);

        stepContext = await step.execute(stepContext);

        if (!stepContext.success) {
          logger.error(logs.installer.debug.pipelineStepFailed(), stepName, stepContext.error);
          return {
            success: false,
            error: stepContext.error || `Step ${stepName} failed`,
          };
        }

        logger.debug(logs.installer.debug.pipelineStepCompleted(), stepName);
      }

      // Calculate final binary paths
      const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

      logger.debug(logs.installer.debug.pipelineCompleted(), toolName);

      return {
        success: true,
        binaryPaths,
        version: stepContext.version,
        info: stepContext.info,
      };
    } catch (error) {
      logger.error(logs.tool.error.installFailed('pipeline', toolName, (error as Error).message));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
