import path from 'path';
import crypto from 'crypto';
import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { CacheEntry, IGitHubApiCache } from './IGitHubApiCache';

/**
 * File-based implementation of the GitHub API cache.
 * Stores cache entries as JSON files in the configured cache directory.
 */
export class FileGitHubApiCache implements IGitHubApiCache {
  private readonly cacheDir: string;
  private readonly fileSystem: IFileSystem;
  private readonly defaultTtlMs: number;
  private readonly enabled: boolean;
  private readonly logger: TsLogger;

  /**
   * Creates a new FileGitHubApiCache instance.
   * @param parentLogger The logger instance
   * @param fileSystem The file system implementation to use
   * @param config Application configuration
   */
  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, config: YamlConfig) {
    this.logger = parentLogger.getSubLogger({ name: 'FileGitHubApiCache' });
    this.fileSystem = fileSystem;
    this.cacheDir = path.join(config.paths.generatedDir, 'cache', 'github-api');
    this.defaultTtlMs = config.github.cache.ttl;
    this.enabled = config.github.cache.enabled;

    this.logger.debug(
      'constructor: Cache directory: %s, TTL: %d ms, Enabled: %s',
      this.cacheDir,
      this.defaultTtlMs,
      this.enabled,
    );
  }

  /**
   * Retrieves a cached response if available and not expired.
   * @template T The type of data to retrieve
   * @param key The cache key
   * @returns A promise that resolves with the cached data, or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    const logger = this.logger.getSubLogger({ name: 'get' });
    if (!this.enabled) {
      logger.debug('Cache disabled, returning null for key: %s', key);
      return null;
    }

    try {
      const filePath = this.getCacheFilePath(key);

      if (!(await this.fileSystem.exists(filePath))) {
        logger.debug('Cache miss - file does not exist for key: %s', key);
        return null;
      }

      const content = await this.fileSystem.readFile(filePath, 'utf8');
      const entry = JSON.parse(content) as CacheEntry<T>;

      if (this.isExpired(entry)) {
        logger.debug(
          'Cache entry expired for key: %s, expiry: %s',
          key,
          new Date(entry.expiresAt).toISOString(),
        );
        await this.delete(key).catch(err => {
          logger.debug('Error deleting expired entry: %s', err.message);
        });
        return null;
      }

      logger.debug('Cache hit for key: %s', key);
      return entry.data;
    } catch (error) {
      logger.debug(
        'Error retrieving cache entry for key: %s, error: %s',
        key,
        (error as Error).message,
      );
      return null;
    }
  }

  /**
   * Stores data in the cache with an optional TTL.
   * @template T The type of data to store
   * @param key The cache key
   * @param data The data to cache
   * @param ttlMs Optional TTL in milliseconds (overrides default TTL)
   * @returns A promise that resolves when the data has been cached
   */
  async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'set' });
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping set for key: %s', key);
      return;
    }

    try {
      await this.ensureCacheDir();

      const now = Date.now();
      const actualTtlMs = ttlMs ?? this.defaultTtlMs;

      const entry: CacheEntry<T> = {
        data,
        timestamp: now,
        expiresAt: now + actualTtlMs,
        // We could add tokenHash here if we want to invalidate cache when token changes
      };

      const filePath = this.getCacheFilePath(key);
      await this.fileSystem.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');

      logger.debug(
        'Cached data for key: %s, expires: %s',
        key,
        new Date(entry.expiresAt).toISOString(),
      );
    } catch (error) {
      logger.debug('Error caching data for key: %s, error: %s', key, (error as Error).message);
      throw new Error(`Failed to cache data: ${(error as Error).message}`);
    }
  }

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key The cache key to check
   * @returns A promise that resolves with true if the key exists and is not expired, false otherwise
   */
  async has(key: string): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'has' });
    if (!this.enabled) {
      logger.debug('Cache disabled, returning false for key: %s', key);
      return false;
    }

    try {
      const filePath = this.getCacheFilePath(key);

      if (!(await this.fileSystem.exists(filePath))) {
        logger.debug('Cache entry does not exist for key: %s', key);
        return false;
      }

      const content = await this.fileSystem.readFile(filePath, 'utf8');
      const entry = JSON.parse(content) as CacheEntry<unknown>;

      if (this.isExpired(entry)) {
        logger.debug('Cache entry expired for key: %s', key);
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
   * Removes an item from the cache.
   * @param key The cache key to delete
   * @returns A promise that resolves when the item has been removed
   */
  async delete(key: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'delete' });
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping delete for key: %s', key);
      return;
    }

    try {
      const filePath = this.getCacheFilePath(key);

      if (await this.fileSystem.exists(filePath)) {
        await this.fileSystem.rm(filePath);
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
   * @returns A promise that resolves when all expired entries have been removed
   */
  async clearExpired(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clearExpired' });
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping clearExpired');
      return;
    }

    try {
      await this.ensureCacheDir();

      const files = await this.fileSystem.readdir(this.cacheDir);
      let expiredCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);

        try {
          const content = await this.fileSystem.readFile(filePath, 'utf8');
          const entry = JSON.parse(content) as CacheEntry<unknown>;

          if (this.isExpired(entry)) {
            await this.fileSystem.rm(filePath).catch(err => {
              logger.debug(
                'Error removing expired file %s: %s',
                filePath,
                (err as Error).message,
              );
            });
            expiredCount++;
          }
        } catch (err) {
          // If we can't read or parse a file, consider it corrupted and remove it
          logger.debug(
            'Error processing file %s: %s, removing it',
            file,
            (err as Error).message,
          );
          await this.fileSystem.rm(filePath).catch(() => {
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
   * @returns A promise that resolves when the cache has been cleared
   */
  async clear(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clear' });
    if (!this.enabled) {
      logger.debug('Cache disabled, skipping clear');
      return;
    }

    try {
      if (await this.fileSystem.exists(this.cacheDir)) {
        await this.fileSystem.rm(this.cacheDir, { recursive: true, force: true });
        logger.debug('Removed entire cache directory');
      } else {
        logger.debug('Cache directory does not exist, nothing to clear');
      }
      // Always ensure the cache directory exists after attempting to clear
      await this.ensureCacheDir();
    } catch (error) {
      logger.debug('Error clearing cache: %s', (error as Error).message);
      throw new Error(`Failed to clear cache: ${(error as Error).message}`);
    }
  }

  /**
   * Gets the file path for a cache key.
   * @param key The cache key
   * @returns The file path for the cache entry
   * @private
   */
  private getCacheFilePath(key: string): string {
    // Create a hash of the key to ensure it's a valid filename
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Ensures the cache directory exists.
   * @returns A promise that resolves when the directory exists
   * @private
   */
  private async ensureCacheDir(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'ensureCacheDir' });
    try {
      await this.fileSystem.ensureDir(this.cacheDir);
    } catch (error) {
      logger.debug('Error ensuring cache directory exists: %s', (error as Error).message);
      throw new Error(`Failed to create cache directory: ${(error as Error).message}`);
    }
  }

  /**
   * Checks if a cache entry is expired.
   * @param entry The cache entry to check
   * @returns True if the entry is expired, false otherwise
   * @private
   */
  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() > entry.expiresAt;
  }
}
