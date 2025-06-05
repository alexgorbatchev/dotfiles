/**
 * @file generator/src/modules/github-client/FileGitHubApiCache.ts
 * @description File-based implementation of the GitHub API cache.
 *
 * ## Development Plan
 *
 * - [x] Import required dependencies (IFileSystem, path, crypto)
 * - [x] Define FileGitHubApiCache class implementing IGitHubApiCache
 *   - [x] Constructor accepting IFileSystem and AppConfig
 *   - [x] Implement get<T>(key) method
 *   - [x] Implement set<T>(key, data, ttlMs) method
 *   - [x] Implement has(key) method
 *   - [x] Implement delete(key) method
 *   - [x] Implement clearExpired() method
 *   - [x] Implement clear() method
 *   - [x] Add private helper methods (getCacheFilePath, ensureCacheDir, isExpired)
 * - [x] Add proper error handling for file operations
 * - [x] Add logging using createLogger
 * - [x] Cleanup all linting errors and warnings
 * - [ ] Write tests for FileGitHubApiCache (to be done separately)
 * - [ ] Update the memory bank with the new information when all tasks are complete
 */

import path from 'path';
import crypto from 'crypto';
import type { AppConfig } from '../../types';
import type { IFileSystem } from '../file-system/IFileSystem';
import type { CacheEntry, IGitHubApiCache } from './IGitHubApiCache';
import { createLogger } from '../logger';

const log = createLogger('FileGitHubApiCache');

/**
 * File-based implementation of the GitHub API cache.
 * Stores cache entries as JSON files in the configured cache directory.
 */
export class FileGitHubApiCache implements IGitHubApiCache {
  private readonly cacheDir: string;
  private readonly fileSystem: IFileSystem;
  private readonly defaultTtlMs: number;
  private readonly enabled: boolean;

  /**
   * Creates a new FileGitHubApiCache instance.
   * @param fileSystem The file system implementation to use
   * @param config Application configuration
   */
  constructor(fileSystem: IFileSystem, config: AppConfig) {
    this.fileSystem = fileSystem;
    this.cacheDir = path.join(config.cacheDir, 'github-api');
    this.defaultTtlMs = config.githubApiCacheTtl ?? 86400000; // Default: 24 hours
    this.enabled = config.githubApiCacheEnabled ?? true;

    log(
      'constructor: Cache directory: %s, TTL: %d ms, Enabled: %s',
      this.cacheDir,
      this.defaultTtlMs,
      this.enabled
    );
  }

  /**
   * Retrieves a cached response if available and not expired.
   * @template T The type of data to retrieve
   * @param key The cache key
   * @returns A promise that resolves with the cached data, or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      log('get: Cache disabled, returning null for key: %s', key);
      return null;
    }

    try {
      const filePath = this.getCacheFilePath(key);

      if (!(await this.fileSystem.exists(filePath))) {
        log('get: Cache miss - file does not exist for key: %s', key);
        return null;
      }

      const content = await this.fileSystem.readFile(filePath, 'utf8');
      const entry = JSON.parse(content) as CacheEntry<T>;

      if (this.isExpired(entry)) {
        log(
          'get: Cache entry expired for key: %s, expiry: %s',
          key,
          new Date(entry.expiresAt).toISOString()
        );
        await this.delete(key).catch((err) => {
          log('get: Error deleting expired entry: %s', err.message);
        });
        return null;
      }

      log('get: Cache hit for key: %s', key);
      return entry.data;
    } catch (error) {
      log(
        'get: Error retrieving cache entry for key: %s, error: %s',
        key,
        (error as Error).message
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
    if (!this.enabled) {
      log('set: Cache disabled, skipping set for key: %s', key);
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

      log(
        'set: Cached data for key: %s, expires: %s',
        key,
        new Date(entry.expiresAt).toISOString()
      );
    } catch (error) {
      log('set: Error caching data for key: %s, error: %s', key, (error as Error).message);
      throw new Error(`Failed to cache data: ${(error as Error).message}`);
    }
  }

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key The cache key to check
   * @returns A promise that resolves with true if the key exists and is not expired, false otherwise
   */
  async has(key: string): Promise<boolean> {
    if (!this.enabled) {
      log('has: Cache disabled, returning false for key: %s', key);
      return false;
    }

    try {
      const filePath = this.getCacheFilePath(key);

      if (!(await this.fileSystem.exists(filePath))) {
        log('has: Cache entry does not exist for key: %s', key);
        return false;
      }

      const content = await this.fileSystem.readFile(filePath, 'utf8');
      const entry = JSON.parse(content) as CacheEntry<unknown>;

      if (this.isExpired(entry)) {
        log('has: Cache entry expired for key: %s', key);
        return false;
      }

      log('has: Valid cache entry exists for key: %s', key);
      return true;
    } catch (error) {
      log('has: Error checking cache for key: %s, error: %s', key, (error as Error).message);
      return false;
    }
  }

  /**
   * Removes an item from the cache.
   * @param key The cache key to delete
   * @returns A promise that resolves when the item has been removed
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled) {
      log('delete: Cache disabled, skipping delete for key: %s', key);
      return;
    }

    try {
      const filePath = this.getCacheFilePath(key);

      if (await this.fileSystem.exists(filePath)) {
        await this.fileSystem.rm(filePath);
        log('delete: Removed cache entry for key: %s', key);
      } else {
        log('delete: No cache entry to delete for key: %s', key);
      }
    } catch (error) {
      log(
        'delete: Error deleting cache entry for key: %s, error: %s',
        key,
        (error as Error).message
      );
      throw new Error(`Failed to delete cache entry: ${(error as Error).message}`);
    }
  }

  /**
   * Clears all expired entries from the cache.
   * @returns A promise that resolves when all expired entries have been removed
   */
  async clearExpired(): Promise<void> {
    if (!this.enabled) {
      log('clearExpired: Cache disabled, skipping clearExpired');
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
            await this.fileSystem.rm(filePath);
            expiredCount++;
          }
        } catch (err) {
          // If we can't read or parse a file, consider it corrupted and remove it
          log(
            'clearExpired: Error processing file %s: %s, removing it',
            file,
            (err as Error).message
          );
          await this.fileSystem.rm(filePath).catch(() => {
            // Ignore errors when trying to remove already problematic files
          });
          expiredCount++;
        }
      }

      log('clearExpired: Removed %d expired cache entries', expiredCount);
    } catch (error) {
      log('clearExpired: Error clearing expired cache entries: %s', (error as Error).message);
      throw new Error(`Failed to clear expired cache entries: ${(error as Error).message}`);
    }
  }

  /**
   * Clears the entire cache.
   * @returns A promise that resolves when the cache has been cleared
   */
  async clear(): Promise<void> {
    if (!this.enabled) {
      log('clear: Cache disabled, skipping clear');
      return;
    }

    try {
      if (await this.fileSystem.exists(this.cacheDir)) {
        await this.fileSystem.rm(this.cacheDir, { recursive: true, force: true });
        log('clear: Removed entire cache directory');
      } else {
        log('clear: Cache directory does not exist, nothing to clear');
      }
      // Always ensure the cache directory exists after attempting to clear
      await this.ensureCacheDir();
    } catch (error) {
      log('clear: Error clearing cache: %s', (error as Error).message);
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
    try {
      await this.fileSystem.ensureDir(this.cacheDir);
    } catch (error) {
      log('ensureCacheDir: Error ensuring cache directory exists: %s', (error as Error).message);
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
