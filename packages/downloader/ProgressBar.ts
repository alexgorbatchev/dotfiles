import { createOscProgressController, type OscProgressReporter } from "osc-progress";
import type { ProgressCallback } from "./IDownloader";
import { renderProgressFrame } from "./renderProgressFrame";

/**
 * Options for configuring the ProgressBar behavior.
 */
export interface IProgressBarOptions {
  /** Whether progress bar should be shown at all */
  enabled?: boolean;
  /** Output stream for the rendered progress line */
  stream?: ProgressBarStream;
  /** Environment passed to terminal-progress detection */
  env?: NodeJS.ProcessEnv;
}

type ProgressBarStream = Pick<NodeJS.WriteStream, "write"> & Partial<Pick<NodeJS.WriteStream, "isTTY">>;

/**
 * Progress bar for displaying download progress in the terminal.
 *
 * This class renders a single-line terminal progress display for downloads.
 * It supports both determinate progress (when total size is known) and
 * indeterminate progress (when total size is unknown).
 */
export class ProgressBar {
  private readonly enabled: boolean;
  private readonly stream: ProgressBarStream;
  private readonly terminalProgress: OscProgressReporter;
  private startTime = 0;
  private hasRendered = false;
  private isCursorHidden = false;

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
    this.stream = options.stream ?? process.stderr;
    this.terminalProgress = createOscProgressController({
      disabled: !this.enabled,
      env: options.env ?? process.env,
      isTty: this.stream.isTTY === true,
      label: this.filename,
      write: (chunk) => {
        this.stream.write(chunk);
      },
    });
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
      if (this.startTime === 0) {
        this.startTime = Date.now();
        this.hideCursor();
      }

      this.updateTerminalProgress(bytesDownloaded, totalBytes);

      const frame = renderProgressFrame({
        filename: this.filename,
        bytesDownloaded,
        totalBytes,
        elapsedMs: Date.now() - this.startTime,
        useAnsi: !process.env["NO_COLOR"] && this.stream.isTTY === true,
      });

      this.writeFrame(frame);
    };
  }

  /**
   * Clears the progress bar from the terminal.
   *
   * This method stops the progress bar and removes it from the display.
   * It should be called when the download is complete or has failed.
   */
  clear(): void {
    if (this.hasRendered) {
      this.stream.write("\r\u001b[2K");
      this.hasRendered = false;
    }

    if (this.startTime !== 0) {
      this.terminalProgress.clear();
    }

    this.showCursor();
  }

  /**
   * Finishes and clears the progress bar, ensuring proper cleanup.
   *
   * This method is similar to clear() but emphasizes that the operation has
   * completed successfully. It stops the progress bar and cleans up the display.
   */
  finish(): void {
    if (this.startTime !== 0) {
      this.terminalProgress.done(this.filename);
    }

    if (this.hasRendered) {
      this.stream.write("\n");
      this.hasRendered = false;
    }

    this.showCursor();
  }

  /**
   * Finishes the progress bar in an error state, ensuring cleanup still happens.
   */
  fail(): void {
    if (this.startTime !== 0) {
      this.terminalProgress.fail(this.filename);
    }

    if (this.hasRendered) {
      this.stream.write("\n");
      this.hasRendered = false;
    }

    this.showCursor();
  }

  private hideCursor(): void {
    if (this.isCursorHidden || this.stream.isTTY !== true) {
      return;
    }

    this.stream.write("\u001b[?25l");
    this.isCursorHidden = true;
  }

  private showCursor(): void {
    if (!this.isCursorHidden || this.stream.isTTY !== true) {
      return;
    }

    this.stream.write("\u001b[?25h");
    this.isCursorHidden = false;
  }

  private writeFrame(frame: string): void {
    this.stream.write(`\r\u001b[2K${frame}`);
    this.hasRendered = true;
  }

  private updateTerminalProgress(bytesDownloaded: number, totalBytes: number | null): void {
    if (totalBytes === null) {
      this.terminalProgress.setIndeterminate(this.filename);
      return;
    }

    this.terminalProgress.setPercent(this.filename, (bytesDownloaded / totalBytes) * 100);
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
  if (process.env["CI"] === "true" || process.env["CI"] === "1") {
    return false;
  }

  // Don't show progress if NO_COLOR is set (often indicates non-interactive use)
  if (process.env["NO_COLOR"]) {
    return false;
  }

  return true;
}
