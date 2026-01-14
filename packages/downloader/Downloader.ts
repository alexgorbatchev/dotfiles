import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ICache } from './cache/types';
import { CachedDownloadStrategy } from './CachedDownloadStrategy';
import type { IDownloader, IDownloadOptions } from './IDownloader';
import type { IDownloadStrategy } from './IDownloadStrategy';
import { downloaderLogMessages } from './log-messages';
import { NodeFetchStrategy } from './NodeFetchStrategy';

/**
 * Main downloader class that orchestrates file downloads using pluggable strategies.
 *
 * The Downloader class manages multiple download strategies and selects the appropriate one
 * for each download operation. It handles strategy registration, fallback behavior, and
 * optional caching. By default, it uses NodeFetchStrategy, optionally wrapped with
 * CachedDownloadStrategy if a cache is provided.
 */
export class Downloader implements IDownloader {
  private strategies: IDownloadStrategy[] = [];
  private fs: IFileSystem;
  private logger: TsLogger;

  /**
   * Creates a new Downloader instance.
   *
   * @param parentLogger - The parent logger for creating sub-loggers.
   * @param fileSystem - The file system interface for file operations.
   * @param strategies - Optional array of download strategies. If not provided, defaults to NodeFetchStrategy.
   * @param cache - Optional cache instance. If provided, wraps the default strategy with caching.
   */
  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, strategies?: IDownloadStrategy[], cache?: ICache) {
    this.logger = parentLogger.getSubLogger({ name: 'Downloader' });
    this.fs = fileSystem;

    if (typeof strategies !== 'undefined') {
      this.strategies = strategies;
    } else {
      // Create default strategy, optionally wrapped with cache
      const baseStrategy = new NodeFetchStrategy(this.logger, this.fs);
      if (cache) {
        this.logger.debug(
          downloaderLogMessages.strategyCreated('CachedDownloadStrategy', ' wrapping NodeFetchStrategy'),
        );
        this.strategies.push(new CachedDownloadStrategy(this.logger, this.fs, cache, baseStrategy));
      } else {
        this.logger.debug(downloaderLogMessages.strategyCreated('NodeFetchStrategy', ' (no cache)'));
        this.strategies.push(baseStrategy);
      }
    }
  }

  /**
   * @inheritdoc IDownloader.registerStrategy
   */
  public registerStrategy(strategy: IDownloadStrategy): void {
    this.strategies.unshift(strategy);
  }

  /**
   * Attempts to download using a specific strategy.
   *
   * @param strategy - The download strategy to use.
   * @param url - The URL to download from.
   * @param options - Download options.
   * @returns An object indicating success status and the result buffer if successful.
   */
  private async tryDownloadWithStrategy(
    strategy: IDownloadStrategy,
    url: string,
    options: IDownloadOptions,
  ): Promise<{ success: boolean; result?: Buffer; }> {
    if (!(await strategy.isAvailable())) {
      return { success: false };
    }

    const result = await strategy.download(url, options);
    return { success: true, result };
  }

  /**
   * @inheritdoc IDownloader.download
   */
  public async download(
    parentLogger: TsLogger,
    url: string,
    options: IDownloadOptions = {},
  ): Promise<Buffer | undefined> {
    const logger = parentLogger.getSubLogger({ name: 'Downloader' }).getSubLogger({ name: 'download' });
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

  /**
   * Attempts to download a file to disk using a specific strategy.
   *
   * @param strategy - The download strategy to use.
   * @param url - The URL to download from.
   * @param fileOptions - Download options with destinationPath set.
   * @returns True if the download was successful, false if the strategy is unavailable.
   * @throws {Error} If the strategy returns a Buffer instead of writing to the file.
   */
  private async tryDownloadToFileWithStrategy(
    strategy: IDownloadStrategy,
    url: string,
    fileOptions: IDownloadOptions,
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

  /**
   * Normalizes unknown errors into Error instances.
   *
   * @param error - The error to normalize (can be any type).
   * @returns A proper Error instance.
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    } else if (typeof error === 'string') {
      return new Error(error);
    } else {
      return new Error(`An unknown error occurred during download: ${JSON.stringify(error)}`);
    }
  }

  /**
   * @inheritdoc IDownloader.downloadToFile
   */
  public async downloadToFile(
    parentLogger: TsLogger,
    url: string,
    filePath: string,
    options: IDownloadOptions = {},
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'Downloader' }).getSubLogger({ name: 'downloadToFile' });
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
