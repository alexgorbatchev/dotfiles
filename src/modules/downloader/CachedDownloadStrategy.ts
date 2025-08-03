import type { DownloadStrategy } from './DownloadStrategy';
import type { DownloadOptions } from './IDownloader';
import type { ICache } from '@modules/cache/ICache';
import { DownloadCacheUtils } from '@modules/cache/DownloadCacheUtils';
import type { TsLogger } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system';

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
    cacheTtl: number = 24 * 60 * 60 * 1000, // Default 24 hours
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'CachedDownloadStrategy' });
    this.fileSystem = fileSystem;
    this.cache = cache;
    this.underlyingStrategy = underlyingStrategy;
    this.cacheTtl = cacheTtl;
    this.name = `cached-${underlyingStrategy.name}`;

    this.logger.debug(
      'constructor: Wrapping strategy %s with cache, TTL: %d ms',
      underlyingStrategy.name,
      cacheTtl,
    );
  }

  /**
   * Checks if this download strategy is available.
   * @returns A promise that resolves to true if the underlying strategy is available
   */
  async isAvailable(): Promise<boolean> {
    return await this.underlyingStrategy.isAvailable();
  }

  /**
   * Downloads a file from the given URL, checking cache first.
   * @param url The URL of the file to download
   * @param options The download options
   * @returns A promise that resolves with a Buffer containing the downloaded file's content
   */
  async download(url: string, options: DownloadOptions = {}): Promise<Buffer | void> {
    const logger = this.logger.getSubLogger({ name: 'download' });
    
    // Don't cache downloads with progress callbacks as they are meant to be streamed
    const shouldCache = !options.onProgress;
    
    if (!shouldCache) {
      logger.debug('Skipping cache for URL %s (has progress callback)', url);
      return await this.underlyingStrategy.download(url, options);
    }

    const cacheKey = DownloadCacheUtils.createCacheKey(url, options);
    
    try {
      // Check cache first
      const cachedBuffer = await this.cache.get<Buffer>(cacheKey);
      if (cachedBuffer) {
        logger.debug('Cache hit for URL: %s', url);
        
        // If destinationPath is specified, write cached data to file and return void
        if (options.destinationPath) {
          await this.fileSystem.writeFile(options.destinationPath, cachedBuffer);
          logger.debug('Wrote cached data to destination: %s', options.destinationPath);
          return; // Return void for file downloads
        }
        
        return cachedBuffer;
      }

      logger.debug('Cache miss for URL: %s', url);
    } catch (error) {
      logger.debug('Error checking cache for URL %s: %s', url, (error as Error).message);
      // Continue with download if cache check fails
    }

    // Download from underlying strategy
    logger.debug('Downloading from underlying strategy for URL: %s', url);
    const result = await this.underlyingStrategy.download(url, options);
    
    // Cache the result if it's a Buffer or if we can extract it from void result
    let bufferToCache: Buffer | null = null;
    
    if (result instanceof Buffer) {
      bufferToCache = result;
    } else if (options.destinationPath && result === undefined) {
      // For file downloads that return void, we need to read the file to cache it
      // This is a trade-off - we read the file after writing to cache it for future use
      logger.debug('Attempting to read downloaded file for caching: %s', options.destinationPath);
      try {
        const fileExists = await this.fileSystem.exists(options.destinationPath);
        logger.debug('Downloaded file exists: %s', fileExists);
        
        if (fileExists) {
          const fileContent = await this.fileSystem.readFile(options.destinationPath);
          bufferToCache = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent);
          logger.debug('Successfully read file for caching, size: %d bytes', bufferToCache.length);
        } else {
          logger.debug('Downloaded file does not exist, cannot cache');
        }
      } catch (error) {
        logger.debug('Error reading downloaded file for caching: %s', (error as Error).message);
      }
    }
    
    if (bufferToCache) {
      // Cache the result
      try {
        await this.cache.set(cacheKey, bufferToCache, this.cacheTtl, {
          url,
          contentType: this.extractContentTypeFromHeaders(options.headers),
        });
        logger.debug('Cached download for URL: %s, size: %d bytes', url, bufferToCache.length);
      } catch (error) {
        logger.debug('Error caching download for URL %s: %s', url, (error as Error).message);
        // Don't fail the download if caching fails
      }
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