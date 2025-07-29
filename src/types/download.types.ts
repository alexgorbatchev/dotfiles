/**
 * Represents the progress of a file download operation.
 * This information can be used to update UIs or log download status.
 */
export interface DownloadProgress {
  /** The total number of bytes downloaded so far. */
  bytesDownloaded: number;
  /**
   * The total size of the file being downloaded, in bytes.
   * This may be undefined if the server does not provide a Content-Length header.
   */
  totalBytes?: number;
  /**
   * The download progress as a percentage (0-100).
   * This is calculated if `totalBytes` is available.
   */
  percentage?: number;
  /**
   * The current download speed in bytes per second.
   * This may be an estimate and can fluctuate.
   */
  speed?: number;
}

/**
 * Defines the options available for configuring a file download operation.
 * These options control aspects like headers, timeouts, retries, and progress reporting.
 */
export interface DownloadOptions {
  /**
   * An optional record of HTTP headers to include in the download request.
   * For example, `{'Authorization': 'Bearer <token>'}`.
   */
  headers?: Record<string, string>;
  /**
   * The timeout for the download operation, in milliseconds.
   * If the download takes longer than this value, it may be aborted.
   * @default AppConfig.downloadTimeout (e.g., 30000ms)
   */
  timeout?: number;
  /**
   * The number of times to retry the download if it fails.
   * @default AppConfig.downloadRetryCount (e.g., 3)
   */
  retryCount?: number;
  /**
   * The delay between download retry attempts, in milliseconds.
   * @default AppConfig.downloadRetryDelay (e.g., 1000ms)
   */
  retryDelay?: number;
  /**
   * An optional callback function that is invoked periodically with download progress updates.
   * @param progress - An object containing details about the current download progress.
   * @example
   * onProgress: (progress) => {
   *   if (progress.percentage) {
   *     console.log(`Download progress: ${progress.percentage.toFixed(2)}%`);
   *   } else {
   *     console.log(`Downloaded ${progress.bytesDownloaded} bytes`);
   *   }
   *   if (progress.speed) {
   *     console.log(`Current speed: ${(progress.speed / 1024).toFixed(2)} KB/s`);
   *   }
   * }
   */
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Defines the contract for a download strategy.
 * Download strategies provide different implementations for downloading files (e.g., using `fetch`, `curl`, `wget`).
 * This allows the download system to be flexible and potentially use the best available tool.
 */
export interface DownloadStrategy {
  /** A unique name identifying the download strategy (e.g., 'fetch', 'curl'). */
  name: string;
  /**
   * Checks if this download strategy is available and usable on the current system.
   * For example, a `curl` strategy would check if the `curl` command-line tool is installed.
   * @returns A promise that resolves to `true` if the strategy is available, `false` otherwise.
   */
  isAvailable(): Promise<boolean>;
  /**
   * Downloads a file from the given URL using this strategy.
   * @param url The URL of the file to download.
   * @param options The {@link DownloadOptions} to customize the download behavior.
   * @returns A promise that resolves with a Buffer containing the downloaded file's content.
   */
  download(url: string, options: DownloadOptions): Promise<Buffer>;
}

/**
 * Defines the contract for the main download service.
 * The downloader service manages different {@link DownloadStrategy} implementations and orchestrates
 * the file download process, including selecting an appropriate strategy.
 */
export interface IDownloader {
  /**
   * Registers a new download strategy with the downloader service.
   * Registered strategies can then be used for subsequent download operations.
   * @param strategy The {@link DownloadStrategy} to register.
   */
  registerStrategy(strategy: DownloadStrategy): void;
  /**
   * Downloads a file from the given URL and returns its content as a Buffer.
   * The service will attempt to use the best available registered strategy.
   * @param url The URL of the file to download.
   * @param options Optional {@link DownloadOptions} to customize the download.
   * @returns A promise that resolves with a Buffer containing the downloaded file's content.
   */
  download(url: string, options?: DownloadOptions): Promise<Buffer>;
  /**
   * Downloads a file from the given URL and saves it directly to the specified file path.
   * The service will attempt to use the best available registered strategy.
   * @param url The URL of the file to download.
   * @param filePath The local path where the downloaded file should be saved.
   * @param options Optional {@link DownloadOptions} to customize the download.
   * @returns A promise that resolves when the file has been successfully downloaded and saved.
   */
  downloadToFile(url: string, filePath: string, options?: DownloadOptions): Promise<void>;
}
