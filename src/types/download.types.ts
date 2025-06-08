/**
 * @file generator/src/types/download.types.ts
 * @description Types related to the download system.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for the download system.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// Download System Types
// ============================================

/**
 * Progress information for downloads
 */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes?: number;
  percentage?: number;
  speed?: number; // bytes per second
}

/**
 * Options for downloading files
 */
export interface DownloadOptions {
  headers?: Record<string, string>;
  timeout?: number; // milliseconds
  retryCount?: number;
  retryDelay?: number; // milliseconds
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Strategy interface for swappable download implementations
 */
export interface DownloadStrategy {
  name: string;
  isAvailable(): Promise<boolean>;
  download(url: string, options: DownloadOptions): Promise<Buffer>;
}

/**
 * Interface for the download service
 */
export interface IDownloader {
  registerStrategy(strategy: DownloadStrategy): void;
  download(url: string, options?: DownloadOptions): Promise<Buffer>;
  downloadToFile(url: string, filePath: string, options?: DownloadOptions): Promise<void>;
}
