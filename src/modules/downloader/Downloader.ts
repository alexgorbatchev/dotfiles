import type { ICache } from '@modules/cache/ICache';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import { CachedDownloadStrategy } from './CachedDownloadStrategy';
import type { DownloadStrategy } from './DownloadStrategy';
import type { DownloadOptions, IDownloader } from './IDownloader';
import { NodeFetchStrategy } from './NodeFetchStrategy';

export class Downloader implements IDownloader {
  private strategies: DownloadStrategy[] = [];
  private fs: IFileSystem;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, strategies?: DownloadStrategy[], cache?: ICache) {
    this.logger = parentLogger.getSubLogger({ name: 'Downloader' });
    this.fs = fileSystem;

    if (typeof strategies !== 'undefined') {
      this.strategies = strategies;
    } else {
      // Create default strategy, optionally wrapped with cache
      const baseStrategy = new NodeFetchStrategy(this.logger, this.fs);
      if (cache) {
        this.logger.debug(
          logs.downloader.debug.strategyCreated(),
          'CachedDownloadStrategy',
          ' wrapping NodeFetchStrategy'
        );
        this.strategies.push(new CachedDownloadStrategy(this.logger, this.fs, cache, baseStrategy));
      } else {
        this.logger.debug(logs.downloader.debug.strategyCreated(), 'NodeFetchStrategy', ' (no cache)');
        this.strategies.push(baseStrategy);
      }
    }
  }

  public registerStrategy(strategy: DownloadStrategy): void {
    this.strategies.unshift(strategy);
  }

  public async download(url: string, options: DownloadOptions = {}): Promise<Buffer | void> {
    const logger = this.logger.getSubLogger({ name: 'download' });
    logger.debug(logs.downloader.debug.downloadStarted(), url);

    if (this.strategies.length === 0) {
      throw new Error('No download strategies registered.');
    }

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      if (await strategy.isAvailable()) {
        try {
          return await strategy.download(url, options);
        } catch (error) {
          if (error instanceof Error) {
            lastError = error;
          } else if (typeof error === 'string') {
            lastError = new Error(error);
          } else {
            lastError = new Error(`An unknown error occurred during download: ${JSON.stringify(error)}`);
          }
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`No available download strategy succeeded for ${url}.`);
  }

  public async downloadToFile(url: string, filePath: string, options: DownloadOptions = {}): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'downloadToFile' });
    logger.debug(logs.downloader.debug.downloadToFileStarted(), url, filePath);

    // Set destination path in options to indicate file download
    const fileOptions = { ...options, destinationPath: filePath };

    if (this.strategies.length === 0) {
      throw new Error('No download strategies registered.');
    }

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      if (await strategy.isAvailable()) {
        try {
          const result = await strategy.download(url, fileOptions);
          if (result === undefined) {
            return; // Successfully saved to file
          }
          throw new Error('Strategy returned Buffer instead of void for downloadToFile method');
        } catch (error) {
          if (error instanceof Error) {
            lastError = error;
          } else if (typeof error === 'string') {
            lastError = new Error(error);
          } else {
            lastError = new Error(`An unknown error occurred during download: ${JSON.stringify(error)}`);
          }
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`No available download strategy succeeded for ${url}.`);
  }
}
