import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { createCacheKey } from './cache/helpers';
import type { ICache } from './cache/types';
import type { DownloadStrategy } from './DownloadStrategy';
import type { DownloadOptions } from './IDownloader';
import { cachedDownloadStrategyLogMessages } from './log-messages';

/**
 * A download strategy decorator that adds caching functionality.
 * This strategy checks the cache before delegating to the underlying strategy.
 */
export class CachedDownloadStrategy implements DownloadStrategy {
  public readonly name: string;
  private readonly cache: ICache;
  private readonly underlyingStrategy: DownloadStrategy;
  private readonly logger: TsLogger;
  private readonly cacheTtl: number;
  private readonly fileSystem: IFileSystem;

  /**
   * Creates a new CachedDownloadStrategy.
   * @param parentLogger The logger instance
   * @param fileSystem The file system implementation to use
   * @param cache The cache implementation to use (should be configured with 'binary' strategy)
   * @param underlyingStrategy The strategy to use when cache misses occur
   * @param cacheTtl TTL for cached downloads in milliseconds
   */
  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    cache: ICache,
    underlyingStrategy: DownloadStrategy,
    cacheTtl: number = 24 * 60 * 60 * 1000 // Default 24 hours
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'CachedDownloadStrategy' });
    this.fileSystem = fileSystem;
    this.cache = cache;
    this.underlyingStrategy = underlyingStrategy;
    this.cacheTtl = cacheTtl;
    this.name = `cached-${underlyingStrategy.name}`;

    this.logger.debug(cachedDownloadStrategyLogMessages.strategyWrapped(underlyingStrategy.name, cacheTtl));
  }

  /**
   * Checks if this download strategy is available.
   * @returns A promise that resolves to true if the underlying strategy is available
   */
  async isAvailable(): Promise<boolean> {
    return await this.underlyingStrategy.isAvailable();
  }

  private async handleCacheHit(
    logger: TsLogger,
    cachedBuffer: Buffer,
    cacheKey: string,
    url: string,
    options: DownloadOptions
  ): Promise<Buffer | undefined> {
    logger.trace(cachedDownloadStrategyLogMessages.cacheHit(cacheKey, 'binary', cachedBuffer.length), { url });

    // If destinationPath is specified, write cached data to file and return void
    if (options.destinationPath) {
      await this.fileSystem.writeFile(options.destinationPath, cachedBuffer);
      logger.trace(cachedDownloadStrategyLogMessages.cachedFileWritten(options.destinationPath));
      return; // Return void for file downloads
    }

    return cachedBuffer;
  }

  private async readFileForCaching(logger: TsLogger, destinationPath: string): Promise<Buffer | null> {
    logger.trace(cachedDownloadStrategyLogMessages.readFileForCaching(destinationPath));

    try {
      const fileExists = await this.fileSystem.exists(destinationPath);
      logger.trace(cachedDownloadStrategyLogMessages.downloadedFileExists(destinationPath, fileExists));

      if (fileExists) {
        const bufferToCache = await this.fileSystem.readFileBuffer(destinationPath);
        logger.trace(cachedDownloadStrategyLogMessages.downloadedFileCached(destinationPath, bufferToCache.length), {
          path: destinationPath,
          size: bufferToCache.length,
        });
        return bufferToCache;
      } else {
        logger.trace(cachedDownloadStrategyLogMessages.downloadedFileMissing(destinationPath));
        return null;
      }
    } catch (error) {
      logger.trace(
        cachedDownloadStrategyLogMessages.downloadedFileReadFailed(destinationPath),
        error
      );
      return null;
    }
  }

  private async determineBufferToCache(
    logger: TsLogger,
    result: Buffer | undefined,
    options: DownloadOptions
  ): Promise<Buffer | null> {
    if (result instanceof Buffer) {
      return result;
    } else if (options.destinationPath && result === undefined) {
      // For file downloads that return void, we need to read the file to cache it
      return await this.readFileForCaching(logger, options.destinationPath);
    }
    return null;
  }

  private async cacheResult(
    logger: TsLogger,
    bufferToCache: Buffer,
    cacheKey: string,
    url: string,
    options: DownloadOptions
  ): Promise<void> {
    try {
      await this.cache.setDownload(
        cacheKey,
        bufferToCache,
        this.cacheTtl,
        url,
        this.extractContentTypeFromHeaders(options.headers)
      );
      logger.trace(
        cachedDownloadStrategyLogMessages.cacheStored(cacheKey, 'binary', 'TTL-based', bufferToCache.length),
        { url }
      );
    } catch (error) {
      logger.trace(cachedDownloadStrategyLogMessages.cacheStorageFailed(cacheKey), error);
      // Don't fail the download if caching fails
    }
  }

  /**
   * Downloads a file from the given URL, checking cache first.
   * @param url The URL of the file to download
   * @param options The download options
   * @returns A promise that resolves with a Buffer containing the downloaded file's content
   */
  async download(url: string, options: DownloadOptions = {}): Promise<Buffer | undefined> {
    const logger = this.logger.getSubLogger({ name: 'download' });

    // Don't cache downloads with progress callbacks as they are meant to be streamed
    const shouldCache = !options.onProgress;

    if (!shouldCache) {
      logger.trace(cachedDownloadStrategyLogMessages.cacheDisabledForProgress(url));
      return await this.underlyingStrategy.download(url, options);
    }

    const cacheKey = createCacheKey(url, options);

    try {
      // Check cache first
      const cachedBuffer = await this.cache.get<Buffer>(cacheKey);
      if (cachedBuffer) {
        return await this.handleCacheHit(logger, cachedBuffer, cacheKey, url, options);
      }

      logger.trace(cachedDownloadStrategyLogMessages.cacheMiss(cacheKey), { url });
    } catch (error) {
      logger.trace(cachedDownloadStrategyLogMessages.cacheCheckFailed(cacheKey), error);
      // Continue with download if cache check fails
    }

    // Download from underlying strategy
    logger.trace(cachedDownloadStrategyLogMessages.downloadFromStrategy(this.underlyingStrategy.name), { url });
    const result = await this.underlyingStrategy.download(url, options);

    // Cache the result if possible
    const bufferToCache = await this.determineBufferToCache(logger, result, options);

    if (bufferToCache) {
      await this.cacheResult(logger, bufferToCache, cacheKey, url, options);
    }

    return result;
  }

  /**
   * Extracts content type from request headers for metadata.
   * @param headers The request headers
   * @returns The content type or undefined
   * @private
   */
  private extractContentTypeFromHeaders(headers?: Record<string, string>): string | undefined {
    if (!headers) return undefined;

    // Look for Accept header as a hint for expected content type
    return headers['Accept'] || headers['accept'];
  }
}
