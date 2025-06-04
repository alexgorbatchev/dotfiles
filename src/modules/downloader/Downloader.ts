/**
 * @file generator/src/modules/downloader/Downloader.ts
 * @description Main downloader class that manages and uses download strategies.
 *
 * ## Development Plan
 *
 * - [x] Initial implementation with basic strategy management.
 * - [x] Add `registerStrategy` method.
 * - [x] Implement `download` method with strategy iteration and error handling.
 * - [x] **Refactor for Dependency Injection (DI):**
 *   - [x] Modify constructor to accept `IFileSystem` for `NodeFetchStrategy`.
 *   - [x] Update tests to provide `IFileSystem` (e.g., `MemFileSystem`).
 * - [ ] Add support for progress reporting (optional).
 * - [ ] Add support for cancellation (optional).
 * - [ ] Write tests for the module.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { IDownloader, DownloadOptions } from './IDownloader';
import type { DownloadStrategy } from './DownloadStrategy';
import { NodeFetchStrategy } from './NodeFetchStrategy'; // Default strategy
import type { IFileSystem } from '../file-system/IFileSystem'; // Import IFileSystem

export class Downloader implements IDownloader {
  private strategies: DownloadStrategy[] = [];
  private fs: IFileSystem; // Store IFileSystem instance

  constructor(fileSystem: IFileSystem, strategies?: DownloadStrategy[]) {
    this.fs = fileSystem;
    if (typeof strategies !== 'undefined') {
      // If strategies argument was provided (even if it's an empty array), use it.
      this.strategies = strategies;
    } else {
      // Only add default if strategies argument was NOT provided (i.e., it's undefined).
      this.strategies.push(new NodeFetchStrategy(this.fs));
    }
  }

  public registerStrategy(strategy: DownloadStrategy): void {
    // Add to the beginning so it's tried first, or end to be a fallback
    this.strategies.unshift(strategy);
  }

  public async download(url: string, options: DownloadOptions = {}): Promise<Buffer | void> {
    if (this.strategies.length === 0) {
      throw new Error('No download strategies registered.');
    }

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      if (await strategy.isAvailable()) {
        try {
          // console.log(`Attempting download with strategy: ${strategy.name}`);
          return await strategy.download(url, options);
        } catch (error) {
          // console.warn(`Strategy ${strategy.name} failed for ${url}:`, error);
          lastError = error instanceof Error ? error : new Error(String(error));
          // Continue to next strategy
        }
      }
    }

    if (lastError) {
      throw lastError; // Re-throw the last error encountered from an attempted strategy
    }
    // This line should only be reached if all strategies were unavailable
    throw new Error(`No available download strategy succeeded for ${url}.`);
  }
}
