import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { ExtractResult } from '@dotfiles/schemas';
import { installerLogMessages } from '../utils/log-messages';
import { InstallationStep, type StepContext } from './base';

export interface ExtractStepParams {
  archiveExtractor: IArchiveExtractor;
}

/**
 * Step that extracts an archive file
 */
export class ExtractStep extends InstallationStep<ExtractStepParams> {
  getStepName(): string {
    return 'extract';
  }

  async execute(context: StepContext): Promise<StepContext> {
    if (!context.downloadPath) {
      return {
        ...context,
        success: false,
        error: 'No download path available for extraction',
      };
    }

    const { archiveExtractor } = this.params;

    context.logger.debug(installerLogMessages.extractStep.extractingArchive(context.downloadPath));

    try {
      const extractResult: ExtractResult = await archiveExtractor.extract(context.downloadPath, {
        targetDir: context.installDir,
      });

      context.logger.debug(installerLogMessages.extractStep.archiveExtracted(), extractResult);

      return {
        ...context,
        extractDir: context.installDir,
        extractResult,
        success: true,
      };
    } catch (error) {
      return {
        ...context,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
