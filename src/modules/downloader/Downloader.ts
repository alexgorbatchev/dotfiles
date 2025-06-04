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
 * - [x] Add support for progress reporting (optional).
 *   - [x] Ensure `onProgress` callback is passed from `Downloader.download` options to `DownloadStrategy.download` options.
 *   - [x] Verify `onProgress` callback is invoked by underlying strategy through tests in `Downloader.test.ts`.
 * - [~] Add support for cancellation (optional) - Decided not to implement, Ctrl+C is sufficient.
 * - [x] Write tests for the module.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code.
 * - [x] Update the memory bank with the new information when all tasks are complete.
 */

import type { IDownloader, DownloadOptions } from './IDownloader';
import type { DownloadStrategy } from './DownloadStrategy';
import { NodeFetchStrategy } from './NodeFetchStrategy';
import type { IFileSystem } from '../file-system/IFileSystem';

export class Downloader implements IDownloader {
  private strategies: DownloadStrategy[] = [];
  private fs: IFileSystem;

  constructor(fileSystem: IFileSystem, strategies?: DownloadStrategy[]) {
    this.fs = fileSystem;
    if (typeof strategies !== 'undefined') {
      this.strategies = strategies;
    } else {
      this.strategies.push(new NodeFetchStrategy(this.fs));
    }
  }

  public registerStrategy(strategy: DownloadStrategy): void {
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
          return await strategy.download(url, options);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error(`No available download strategy succeeded for ${url}.`);
  }
}
