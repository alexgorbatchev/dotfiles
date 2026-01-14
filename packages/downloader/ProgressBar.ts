import * as cliProgress from 'cli-progress';
import type { ProgressCallback } from './IDownloader';

/**
 * Options for configuring the ProgressBar behavior.
 */
export interface IProgressBarOptions {
  /** Whether progress bar should be shown at all */
  enabled?: boolean;
}

/**
 * Progress bar for displaying download progress in the terminal.
 *
 * This class wraps cli-progress to provide visual feedback during file downloads.
 * It supports both determinate progress (when total size is known) and indeterminate
 * progress (when total size is unknown). The bar shows download speed, ETA, and
 * percentage complete.
 */
export class ProgressBar {
  private progressBar: cliProgress.SingleBar | null = null;
  private enabled: boolean;
  private startTime: number = 0;

  /**
   * Creates a new ProgressBar instance.
   *
   * @param filename - The name of the file being downloaded (used in the progress display).
   * @param options - Optional configuration for the progress bar.
   */
  constructor(
    private filename: string,
    options: IProgressBarOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
  }

  /**
   * Creates a progress callback function compatible with the downloader.
   *
   * This method returns a callback that can be passed to download operations.
   * The callback initializes and updates the progress bar as the download progresses.
   * If the progress bar is disabled, returns undefined.
   *
   * @returns A progress callback function, or undefined if progress is disabled.
   */
  createCallback(): ProgressCallback | undefined {
    if (!this.enabled) {
      return undefined;
    }

    return (bytesDownloaded: number, totalBytes: number | null) => {
      // Initialize progress bar on first call
      if (this.startTime === 0) {
        this.startTime = Date.now();

        if (totalBytes) {
          // Create determinate progress bar
          this.progressBar = new cliProgress.SingleBar(
            {
              format:
                `Downloading ${this.filename} |{bar}| {percentage}% | {value}/{total} | {speed} | ETA: {eta_formatted}`,
              barCompleteChar: '█',
              barIncompleteChar: '░',
              hideCursor: true,
              stream: process.stderr,
            },
            cliProgress.Presets.shades_classic,
          );

          this.progressBar.start(totalBytes, 0, {
            speed: '0 B/s',
          });
        } else {
          // Create indeterminate progress bar
          this.progressBar = new cliProgress.SingleBar(
            {
              format: `Downloading ${this.filename} |{bar}| {value} | {speed}`,
              barCompleteChar: '█',
              barIncompleteChar: '░',
              hideCursor: true,
              stream: process.stderr,
            },
            cliProgress.Presets.shades_classic,
          );

          this.progressBar.start(100, 0, {
            speed: '0 B/s',
          });
        }
      }

      if (this.progressBar) {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const speed = elapsed > 0 ? `${this.formatBytes(bytesDownloaded / elapsed)}/s` : '0 B/s';

        if (totalBytes) {
          // Update determinate progress bar
          this.progressBar.update(bytesDownloaded, {
            speed,
          });

          // Complete the bar if done
          if (bytesDownloaded >= totalBytes) {
            this.progressBar.stop();
          }
        } else {
          // Update indeterminate progress bar - show spinning effect
          const progress = Math.floor(Date.now() / 100) % 100;
          this.progressBar.update(progress, {
            speed,
            value: this.formatBytes(bytesDownloaded),
          });
        }
      }
    };
  }

  /**
   * Clears the progress bar from the terminal.
   *
   * This method stops the progress bar and removes it from the display.
   * It should be called when the download is complete or has failed.
   */
  clear(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

  /**
   * Finishes and clears the progress bar, ensuring proper cleanup.
   *
   * This method is similar to clear() but emphasizes that the operation has
   * completed successfully. It stops the progress bar and cleans up the display.
   */
  finish(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

  /**
   * Formats bytes into a human-readable string with appropriate units.
   *
   * @param bytes - The number of bytes to format.
   * @returns A formatted string (e.g., "1.5 MB", "500 KB").
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
  }
}

/**
 * Determines whether progress bars should be displayed based on environment.
 *
 * Progress bars are hidden when:
 * - Explicitly set to quiet mode
 * - stderr is not a TTY (piped to file or process)
 * - Running in CI environment
 * - NO_COLOR environment variable is set
 *
 * @param quiet - Whether quiet mode is enabled (default: false).
 * @returns True if progress should be shown, false otherwise.
 */
export function shouldShowProgress(quiet: boolean = false): boolean {
  // Don't show progress if explicitly quiet
  if (quiet) {
    return false;
  }

  // Don't show progress if stdout/stderr is not a TTY (e.g., piped to file or another process)
  if (!process.stderr.isTTY) {
    return false;
  }

  // Don't show progress in CI environments
  if (process.env['CI'] === 'true' || process.env['CI'] === '1') {
    return false;
  }

  // Don't show progress if NO_COLOR is set (often indicates non-interactive use)
  if (process.env['NO_COLOR']) {
    return false;
  }

  return true;
}
