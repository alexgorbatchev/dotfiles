import path from 'node:path';
import type { IDownloader } from '@modules/downloader/IDownloader';
import { installerLogMessages } from '../log-messages';
import { downloadWithProgress } from '../utils';
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

    context.logger.debug(installerLogMessages.downloadStep.downloadingAsset(filename, url));

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
        error: `Download failed: ${(error as Error).message}`,
      };
    }
  }
}
