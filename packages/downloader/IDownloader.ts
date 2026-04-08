import type { TsLogger } from "@dotfiles/logger";
import type { IDownloadStrategy } from "./IDownloadStrategy";

export type ProgressCallback = (bytesDownloaded: number, totalBytes: number | null) => void;

/**
 * Options for downloading files.
 */
export interface IDownloadOptions {
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
   * @param strategy The IDownloadStrategy to register.
   */
  registerStrategy(strategy: IDownloadStrategy): void;

  /**
   * Downloads a file from the given URL and returns its content as a Buffer.
   * The service will attempt to use the best available registered strategy.
   * @param url The URL of the file to download.
   * @param options Optional IDownloadOptions to customize the download. Include `parentLogger` for contextual logging.
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
  download(parentLogger: TsLogger, url: string, options?: IDownloadOptions): Promise<Buffer | undefined>;

  /**
   * Downloads a file from the given URL and saves it directly to the specified file path.
   * The service will attempt to use the best available registered strategy.
   * @param parentLogger Logger with context from calling operation.
   * @param url The URL of the file to download.
   * @param filePath The local path where the downloaded file should be saved.
   * @param options Optional IDownloadOptions to customize the download.
   * @returns A promise that resolves when the file has been successfully downloaded and saved.
   */
  downloadToFile(parentLogger: TsLogger, url: string, filePath: string, options?: IDownloadOptions): Promise<void>;
}
