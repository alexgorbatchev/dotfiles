import { type IDownloader, ProgressBar, shouldShowProgress } from '@dotfiles/downloader';
import type { InstallOptions } from '../types';

/**
 * Downloads a file with progress tracking via progress bar display.
 * Determines whether to show progress based on quiet option and displays
 * a progress bar during download. Always ensures the progress bar is cleaned up.
 *
 * Progress bar behavior:
 * - Shown by default unless quiet option is true
 * - Displays download filename and progress percentage
 * - Automatically finished and cleaned up after download completes or errors
 *
 * @param url - URL to download from
 * @param destinationPath - Full path where file should be saved
 * @param filename - Display name for progress bar
 * @param downloader - Downloader instance to perform the download
 * @param options - Installation options (checks quiet flag)
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
