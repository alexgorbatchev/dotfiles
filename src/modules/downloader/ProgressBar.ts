import * as cliProgress from 'cli-progress';
import type { ProgressCallback } from './IDownloader';

export interface ProgressBarOptions {
  /** Whether progress bar should be shown at all */
  enabled?: boolean;
}

export class ProgressBar {
  private progressBar: cliProgress.SingleBar | null = null;
  private enabled: boolean;
  private startTime: number = 0;

  constructor(
    private filename: string,
    options: ProgressBarOptions = {}
  ) {
    this.enabled = options.enabled ?? true;
  }

  /**
   * Creates a progress callback function that can be passed to the downloader
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
              format: `Downloading ${this.filename} |{bar}| {percentage}% | {value}/{total} | {speed} | ETA: {eta_formatted}`,
              barCompleteChar: '█',
              barIncompleteChar: '░',
              hideCursor: true,
              stream: process.stderr,
            },
            cliProgress.Presets.shades_classic
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
            cliProgress.Presets.shades_classic
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
   * Clear the progress bar from the terminal
   */
  clear(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

  /**
   * Finish the progress bar (ensure it's stopped properly)
   */
  finish(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

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
 * Detects if we should show progress bars based on TTY and environment
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
