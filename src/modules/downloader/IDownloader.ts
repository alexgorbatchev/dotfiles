/**
 * @file generator/src/modules/downloader/IDownloader.ts
 * @description Defines interfaces for the downloader service and its options.
 *
 * @developmentPlan
 * - [x] Add `onProgress` callback to `DownloadOptions` for progress reporting.
 */

export type ProgressCallback = (bytesDownloaded: number, totalBytes: number | null) => void;

/**
 * Progress information for downloads.
 */
export interface DownloadProgress {
  /** Total bytes downloaded so far. */
  bytesDownloaded: number;
  /** Total bytes of the file to be downloaded. Might be undefined if server doesn't provide Content-Length. */
  totalBytes?: number;
  /** Percentage of download completion (0-100). Might be undefined if totalBytes is unknown. */
  percentage?: number;
  /** Current download speed in bytes per second. Optional. */
  speed?: number;
}

/**
 * Options for downloading files.
 */
export interface DownloadOptions {
  /** Optional HTTP headers to include in the download request. */
  headers?: Record<string, string>;
  /** Optional timeout for the download request in milliseconds. */
  timeout?: number;
  /** Optional number of times to retry the download on failure. */
  retryCount?: number;
  /** Optional delay in milliseconds between download retries. */
  retryDelay?: number;
  /** Optional callback function to report download progress. */
  onProgress?: ProgressCallback;
  /** Optional: Path to save the downloaded file to. If not provided, content is returned as a Buffer. */
  destinationPath?: string;
}

/**
 * Interface for the download service.
 * The service can manage multiple download strategies and select the appropriate one.
 */
export interface IDownloader {
  /**
   * Downloads a file from the given URL.
   * If `options.destinationPath` is provided, the file is saved to that path,
   * and the promise resolves with void. Otherwise, it resolves with a Buffer
   * containing the downloaded file content.
   *
   * @param url The URL to download the file from.
   * @param options Options for the download.
   * @returns A promise that resolves with a Buffer if no destinationPath is set, or void if it is.
   * @throws {DownloaderError} If a generic download error occurs.
   * @throws {NetworkError} If a network-level error occurs.
   * @throws {HttpError} If a generic HTTP error occurs.
   * @throws {NotFoundError} If the resource is not found (404).
   * @throws {ForbiddenError} If access is forbidden (403).
   * @throws {RateLimitError} If rate limits are exceeded.
   * @throws {ClientError} If a generic client-side HTTP error occurs (4xx).
   * @throws {ServerError} If a server-side HTTP error occurs (5xx).
   */
  download(url: string, options?: DownloadOptions): Promise<Buffer | void>;
}
