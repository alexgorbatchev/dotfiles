import type { IDownloader } from '@modules/downloader/IDownloader';
import { ProgressBar, shouldShowProgress } from '@modules/downloader/ProgressBar';
import type { InstallOptions } from '../IInstaller';

/**
 * Downloads a file with progress tracking
 * Extracted from duplicated code in installFromGitHubRelease, installFromCurlScript, installFromCurlTar
 */
export async function downloadWithProgress(
  url: string,
  destinationPath: string,
  filename: string,
  downloader: IDownloader,
  options?: InstallOptions
): Promise<void> {
  const showProgress = shouldShowProgress(options?.quiet);
  const progressBar = new ProgressBar(filename, { enabled: showProgress });

  try {
    await downloader.download(url, {
      destinationPath,
      onProgress: progressBar.createCallback(),
    });
  } finally {
    progressBar.finish();
  }
}
