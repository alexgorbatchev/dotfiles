import { setupBinariesFromArchive, setupBinariesFromDirectDownload } from '../utils/BinarySetupService';
import { installerLogMessages } from '../utils/log-messages';
import { InstallationStep, type StepContext } from './base';

export interface BinarySetupStepParams {
  toolName: string;
  setupType: 'archive' | 'direct';
}

/**
 * Step that sets up binaries from either archive extraction or direct download
 */
export class BinarySetupStep extends InstallationStep<BinarySetupStepParams> {
  getStepName(): string {
    return `binary-setup-${this.params.setupType}`;
  }

  async execute(context: StepContext): Promise<StepContext> {
    const { toolName, setupType } = this.params;
    const logger = context.logger.getSubLogger({ name: this.getStepName() });
    logger.debug(installerLogMessages.binarySetupStep.starting(toolName, setupType));

    try {
      if (setupType === 'archive') {
        if (!context.extractDir) {
          return {
            ...context,
            success: false,
            error: 'No extract directory available for archive binary setup',
          };
        }
        await setupBinariesFromArchive(
          context.toolFs,
          toolName,
          context.toolConfig,
          context,
          context.extractDir,
          logger
        );
      } else if (setupType === 'direct') {
        if (!context.downloadPath) {
          return {
            ...context,
            success: false,
            error: 'No download path available for direct binary setup',
          };
        }
        await setupBinariesFromDirectDownload(
          context.toolFs,
          toolName,
          context.toolConfig,
          context,
          context.downloadPath,
          logger
        );
      }

      return {
        ...context,
        success: true,
      };
    } catch (error) {
      return {
        ...context,
        success: false,
        error: `Binary setup failed: ${(error as Error).message}`,
      };
    }
  }
}
