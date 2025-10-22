import type { ICache } from './cache/types';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { CachedDownloadStrategy } from './CachedDownloadStrategy';
import type { DownloadStrategy } from './DownloadStrategy';
import type { DownloadOptions, IDownloader } from './IDownloader';
import { downloaderLogMessages } from './log-messages';
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
          downloaderLogMessages.strategyCreated('CachedDownloadStrategy', ' wrapping NodeFetchStrategy')
        );
        this.strategies.push(new CachedDownloadStrategy(this.logger, this.fs, cache, baseStrategy));
      } else {
        this.logger.debug(downloaderLogMessages.strategyCreated('NodeFetchStrategy', ' (no cache)'));
        this.strategies.push(baseStrategy);
      }
    }
  }

  public registerStrategy(strategy: DownloadStrategy): void {
    this.strategies.unshift(strategy);
  }

  private async tryDownloadWithStrategy(
    strategy: DownloadStrategy,
    url: string,
    options: DownloadOptions
  ): Promise<{ success: boolean; result?: Buffer }> {
    if (!(await strategy.isAvailable())) {
      return { success: false };
    }

    const result = await strategy.download(url, options);
    return { success: true, result };
  }

  public async download(url: string, options: DownloadOptions = {}): Promise<Buffer | undefined> {
    const logger = this.logger.getSubLogger({ name: 'download' });
    logger.debug(downloaderLogMessages.downloadStarted(url));

    if (this.strategies.length === 0) {
      throw new Error('No download strategies registered.');
    }

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      try {
        const { success, result } = await this.tryDownloadWithStrategy(strategy, url, options);
        if (success) {
          return result;
        }
      } catch (error) {
        lastError = this.normalizeError(error);
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`No available download strategy succeeded for ${url}.`);
  }

  private async tryDownloadToFileWithStrategy(
    strategy: DownloadStrategy,
    url: string,
    fileOptions: DownloadOptions
  ): Promise<boolean> {
    if (!(await strategy.isAvailable())) {
      return false;
    }

    const result = await strategy.download(url, fileOptions);
    if (result === undefined) {
      return true; // Successfully saved to file
    }
    throw new Error('Strategy returned Buffer instead of void for downloadToFile method');
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    } else if (typeof error === 'string') {
      return new Error(error);
    } else {
      return new Error(`An unknown error occurred during download: ${JSON.stringify(error)}`);
    }
  }

  public async downloadToFile(url: string, filePath: string, options: DownloadOptions = {}): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'downloadToFile' });
    logger.debug(downloaderLogMessages.downloadToFileStarted(url, filePath));

    // Set destination path in options to indicate file download
    const fileOptions = { ...options, destinationPath: filePath };

    if (this.strategies.length === 0) {
      throw new Error('No download strategies registered.');
    }

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      try {
        const success = await this.tryDownloadToFileWithStrategy(strategy, url, fileOptions);
        if (success) {
          return;
        }
      } catch (error) {
        lastError = this.normalizeError(error);
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`No available download strategy succeeded for ${url}.`);
  }
}
