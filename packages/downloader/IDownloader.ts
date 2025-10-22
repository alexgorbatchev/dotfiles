import type { DownloadStrategy } from './DownloadStrategy';

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
   * Registers a new download strategy with the downloader service.
   * Registered strategies can then be used for subsequent download operations.
   * @param strategy The DownloadStrategy to register.
   */
  registerStrategy(strategy: DownloadStrategy): void;

  /**
   * Downloads a file from the given URL and returns its content as a Buffer.
   * The service will attempt to use the best available registered strategy.
   * @param url The URL of the file to download.
   * @param options Optional DownloadOptions to customize the download.
   * @returns A promise that resolves with a Buffer containing the downloaded file's content.
   * @throws {DownloaderError} If a generic download error occurs.
   * @throws {NetworkError} If a network-level error occurs.
   * @throws {HttpError} If a generic HTTP error occurs.
   * @throws {NotFoundError} If the resource is not found (404).
   * @throws {ForbiddenError} If access is forbidden (403).
   * @throws {RateLimitError} If rate limits are exceeded.
   * @throws {ClientError} If a generic client-side HTTP error occurs (4xx).
   * @throws {ServerError} If a server-side HTTP error occurs (5xx).
   */
  download(url: string, options?: DownloadOptions): Promise<Buffer | undefined>;

  /**
   * Downloads a file from the given URL and saves it directly to the specified file path.
   * The service will attempt to use the best available registered strategy.
   * @param url The URL of the file to download.
   * @param filePath The local path where the downloaded file should be saved.
   * @param options Optional DownloadOptions to customize the download.
   * @returns A promise that resolves when the file has been successfully downloaded and saved.
   */
  downloadToFile(url: string, filePath: string, options?: DownloadOptions): Promise<void>;
}
