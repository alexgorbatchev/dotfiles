import { logs } from '@modules/logger';
import { setupBinariesFromArchive, setupBinariesFromDirectDownload } from '../BinarySetupService';
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

    context.logger.debug(logs.installer.debug.binarySetupStarting(), toolName, setupType);

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
          context.logger
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
          context.logger
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
