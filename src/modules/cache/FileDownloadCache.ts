import path from 'node:path';
import crypto from 'node:crypto';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { IDownloadCache, DownloadCacheEntry } from './IDownloadCache';

/**
 * Configuration for the download cache.
 */
export interface DownloadCacheConfig {
  /**
   * Whether caching is enabled
   */
  enabled: boolean;

  /**
   * Cache storage directory
   */
  cacheDir: string;
}

/**
 * File-based implementation of the download cache that stores large binary files
 * efficiently by keeping binary content in separate files and metadata in JSON.
 */
export class FileDownloadCache implements IDownloadCache {
  private readonly config: DownloadCacheConfig;
  private readonly fileSystem: IFileSystem;
  private readonly logger: TsLogger;
  private readonly metadataDir: string;
  private readonly binariesDir: string;

  /**
   * Creates a new FileDownloadCache instance.
   * @param parentLogger The logger instance
   * @param fileSystem The file system implementation to use
   * @param config Cache configuration
   */
  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, config: DownloadCacheConfig) {
    this.logger = parentLogger.getSubLogger({ name: 'FileDownloadCache' });
    this.fileSystem = fileSystem;
    this.config = config;
    this.metadataDir = path.join(config.cacheDir, 'metadata');
    this.binariesDir = path.join(config.cacheDir, 'binaries');

    this.logger.debug(
      'constructor: Cache directory: %s, Enabled: %s',
      config.cacheDir,
      config.enabled,
    );
  }

  /**
   * Retrieves cached download data if available and not expired.
   */
  async get(key: string): Promise<Buffer | null> {
    const logger = this.logger.getSubLogger({ name: 'get' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, returning null for key: %s', key);
      return null;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);
      
      if (!(await this.fileSystem.exists(metadataPath))) {
        logger.debug('No cache entry found for key: %s', key);
        return null;
      }

      const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
      const entry: DownloadCacheEntry = JSON.parse(metadataContent);

      // Check if entry is expired
      if (this.isExpired(entry)) {
        logger.debug('Cache entry expired for key: %s', key);
        // Clean up expired entry
        await this.deleteEntry(key, entry);
        return null;
      }

      // Check if binary file still exists
      const binaryPath = path.join(this.binariesDir, entry.binaryFilePath);
      if (!(await this.fileSystem.exists(binaryPath))) {
        logger.debug('Binary file missing for key: %s, path: %s', key, binaryPath);
        // Clean up orphaned metadata
        await this.fileSystem.rm(metadataPath);
        return null;
      }

      // Read and verify binary content
      const binaryContent = await this.fileSystem.readFile(binaryPath);
      const buffer = Buffer.isBuffer(binaryContent) ? binaryContent : Buffer.from(binaryContent);
      
      // Verify content integrity
      const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (actualHash !== entry.contentHash) {
        logger.debug('Content hash mismatch for key: %s, expected: %s, actual: %s', 
          key, entry.contentHash, actualHash);
        // Clean up corrupted entry
        await this.deleteEntry(key, entry);
        return null;
      }

      logger.debug('Cache hit for key: %s, size: %d bytes', key, buffer.length);
      return buffer;
    } catch (error) {
      logger.debug('Error retrieving cache for key: %s, error: %s', key, (error as Error).message);
      return null;
    }
  }

  /**
   * Stores downloaded data in the cache with TTL.
   */
  async set(key: string, data: Buffer, ttlMs: number, metadata: {
    url: string;
    contentType?: string;
  }): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'set' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping set for key: %s', key);
      return;
    }

    try {
      await this.ensureCacheDirectories();

      const contentHash = crypto.createHash('sha256').update(data).digest('hex');
      const binaryFileName = `${contentHash}.bin`;
      const binaryFilePath = path.join(this.binariesDir, binaryFileName);
      
      // Write binary content to file
      await this.fileSystem.writeFile(binaryFilePath, data);

      const now = Date.now();
      const entry: DownloadCacheEntry = {
        url: metadata.url,
        size: data.length,
        contentType: metadata.contentType,
        binaryFilePath: binaryFileName,
        contentHash,
        timestamp: now,
        expiresAt: now + ttlMs,
      };

      const metadataPath = this.getMetadataFilePath(key);
      await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

      logger.debug(
        'Cached download for key: %s, size: %d bytes, expires: %s',
        key,
        data.length,
        new Date(entry.expiresAt).toISOString(),
      );
    } catch (error) {
      logger.debug('Error caching data for key: %s, error: %s', key, (error as Error).message);
      throw new Error(`Failed to cache download: ${(error as Error).message}`);
    }
  }

  /**
   * Checks if a key exists in the cache and is not expired.
   */
  async has(key: string): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'has' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, returning false for key: %s', key);
      return false;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);
      
      if (!(await this.fileSystem.exists(metadataPath))) {
        logger.debug('No cache entry found for key: %s', key);
        return false;
      }

      const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
      const entry: DownloadCacheEntry = JSON.parse(metadataContent);

      if (this.isExpired(entry)) {
        logger.debug('Cache entry expired for key: %s', key);
        return false;
      }

      // Check if binary file exists
      const binaryPath = path.join(this.binariesDir, entry.binaryFilePath);
      const binaryExists = await this.fileSystem.exists(binaryPath);
      
      if (!binaryExists) {
        logger.debug('Binary file missing for key: %s', key);
        return false;
      }

      logger.debug('Valid cache entry exists for key: %s', key);
      return true;
    } catch (error) {
      logger.debug('Error checking cache for key: %s, error: %s', key, (error as Error).message);
      return false;
    }
  }

  /**
   * Removes an item from the cache (both metadata and binary file).
   */
  async delete(key: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'delete' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping delete for key: %s', key);
      return;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (await this.fileSystem.exists(metadataPath)) {
        // Read metadata to get binary file path
        const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
        const entry: DownloadCacheEntry = JSON.parse(metadataContent);
        
        await this.deleteEntry(key, entry);
        logger.debug('Removed cache entry for key: %s', key);
      } else {
        logger.debug('No cache entry to delete for key: %s', key);
      }
    } catch (error) {
      logger.debug(
        'Error deleting cache entry for key: %s, error: %s',
        key,
        (error as Error).message,
      );
      throw new Error(`Failed to delete cache entry: ${(error as Error).message}`);
    }
  }

  /**
   * Clears all expired entries from the cache.
   */
  async clearExpired(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clearExpired' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping clearExpired');
      return;
    }

    try {
      if (!(await this.fileSystem.exists(this.metadataDir))) {
        logger.debug('Metadata directory does not exist, nothing to clear');
        return;
      }

      const metadataFiles = await this.fileSystem.readdir(this.metadataDir);
      let expiredCount = 0;

      for (const file of metadataFiles) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const metadataPath = path.join(this.metadataDir, file);
        
        try {
          const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
          const entry: DownloadCacheEntry = JSON.parse(metadataContent);

          if (this.isExpired(entry)) {
            const key = path.basename(file, '.json');
            await this.deleteEntry(key, entry);
            expiredCount++;
          }
        } catch (error) {
          logger.debug(
            'Error processing cache file %s: %s',
            file,
            (error as Error).message,
          );
          // Remove problematic metadata file
          await this.fileSystem.rm(metadataPath).catch(() => {
            // Ignore errors when trying to remove already problematic files
          });
          expiredCount++;
        }
      }

      logger.debug('Removed %d expired cache entries', expiredCount);
    } catch (error) {
      logger.debug(
        'Error clearing expired cache entries: %s',
        (error as Error).message,
      );
      throw new Error(`Failed to clear expired cache entries: ${(error as Error).message}`);
    }
  }

  /**
   * Clears the entire cache.
   */
  async clear(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clear' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping clear');
      return;
    }

    try {
      if (await this.fileSystem.exists(this.config.cacheDir)) {
        await this.fileSystem.rm(this.config.cacheDir, { recursive: true, force: true });
        logger.debug('Removed entire cache directory');
      } else {
        logger.debug('Cache directory does not exist, nothing to clear');
      }
      // Always ensure the cache directory exists after attempting to clear
      await this.ensureCacheDirectories();
    } catch (error) {
      logger.debug('Error clearing cache: %s', (error as Error).message);
      throw new Error(`Failed to clear cache: ${(error as Error).message}`);
    }
  }

  /**
   * Gets the file path for a cache metadata entry.
   */
  private getMetadataFilePath(key: string): string {
    const hashedKey = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.metadataDir, `${hashedKey}.json`);
  }

  /**
   * Ensures that the cache directories exist.
   */
  private async ensureCacheDirectories(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'ensureCacheDirectories' });
    try {
      await this.fileSystem.ensureDir(this.metadataDir);
      await this.fileSystem.ensureDir(this.binariesDir);
    } catch (error) {
      logger.debug('Error ensuring cache directories exist: %s', (error as Error).message);
      throw new Error(`Failed to create cache directories: ${(error as Error).message}`);
    }
  }

  /**
   * Checks if a cache entry is expired.
   */
  private isExpired(entry: DownloadCacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Deletes both metadata and binary files for a cache entry.
   */
  private async deleteEntry(key: string, entry: DownloadCacheEntry): Promise<void> {
    const metadataPath = this.getMetadataFilePath(key);
    const binaryPath = path.join(this.binariesDir, entry.binaryFilePath);

    // Remove metadata file
    if (await this.fileSystem.exists(metadataPath)) {
      await this.fileSystem.rm(metadataPath);
    }

    // Remove binary file
    if (await this.fileSystem.exists(binaryPath)) {
      await this.fileSystem.rm(binaryPath);
    }
  }
}