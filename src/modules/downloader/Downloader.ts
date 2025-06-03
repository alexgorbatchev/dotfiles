/**
 * @file generator/src/modules/downloader/Downloader.ts
 * @description Main downloader class that manages and uses download strategies.
 */

import type { IDownloader, DownloadOptions } from './IDownloader';
import type { DownloadStrategy } from './DownloadStrategy';
import { NodeFetchStrategy } from './NodeFetchStrategy'; // Default strategy

export class Downloader implements IDownloader {
  private strategies: DownloadStrategy[] = [];

  constructor(strategies?: DownloadStrategy[]) {
    if (strategies) {
      // If strategies array is provided (even if empty)
      this.strategies = strategies;
    } else {
      // Only add default if strategies argument is undefined
      this.strategies.push(new NodeFetchStrategy());
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
