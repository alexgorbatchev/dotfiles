import path from 'node:path';
import type { IDownloader } from '@dotfiles/downloader';
import { downloadWithProgress } from '../utils';
import { messages } from '../utils/log-messages';
import { InstallationStep, type StepContext } from './base';

export interface DownloadStepParams {
  url: string;
  filename: string;
  downloader: IDownloader;
}

/**
 * Step that downloads a file from a URL
 */
export class DownloadStep extends InstallationStep<DownloadStepParams> {
  getStepName(): string {
    return 'download';
  }

  async execute(context: StepContext): Promise<StepContext> {
    const { url, filename, downloader } = this.params;
    const downloadPath = path.join(context.installDir, filename);

    context.logger.debug(messages.downloadStep.downloadingAsset(filename, url));

    try {
      await downloadWithProgress(url, downloadPath, filename, downloader, context.options);

      return {
        ...context,
        downloadPath,
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
