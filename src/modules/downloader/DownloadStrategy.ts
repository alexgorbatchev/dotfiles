/**
 * @file src/modules/downloader/DownloadStrategy.ts
 * @description Defines the interface for a download strategy.
 *
 * Development Plan:
 * - [x] Define the DownloadStrategy interface.
 * - [x] Specify `name` property for strategy identification.
 * - [x] Specify `isAvailable` method for checking strategy usability.
 * - [x] Specify `download` method for performing the download.
 * - [x] Update `download` method options to include `onProgress` from `DownloadOptions` for progress reporting.
 * - [ ] Write tests for the module. (N/A - Interface file, covered by implementers)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code. (N/A - Interface file)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { DownloadOptions } from './IDownloader';

/**
 * Interface for a download strategy.
 * Each strategy provides a specific way to download a file (e.g., using Node.js fetch, curl).
 */
export interface DownloadStrategy {
  /**
   * The name of the download strategy (e.g., "node-fetch", "curl").
   */
  readonly name: string;

  /**
   * Checks if this download strategy is available on the current system.
   * For example, a "curl" strategy would check if the curl executable is present.
   * @returns A promise that resolves to true if the strategy is available, false otherwise.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Downloads a file from the given URL.
   * @param url The URL to download the file from.
   * @param options Options for the download, such as headers, timeout, and progress callback.
   * @returns A promise that resolves with a Buffer containing the downloaded file content, or void if writing to a destinationPath.
   * @throws Will throw an error if the download fails (e.g., network error, HTTP error, timeout).
   */
  download(url: string, options: DownloadOptions): Promise<Buffer | void>;
}
