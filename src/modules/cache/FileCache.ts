import path from 'node:path';
import crypto from 'node:crypto';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { ICache, CacheEntry, CacheConfig } from './ICache';

/**
 * File-based cache implementation that supports both JSON and binary storage strategies.
 * - JSON strategy: Stores everything in a single JSON file (good for small API responses)
 * - Binary strategy: Stores binary content separately with JSON metadata (good for large files)
 */
export class FileCache implements ICache {
  private readonly config: CacheConfig;
  private readonly fileSystem: IFileSystem;
  private readonly logger: TsLogger;
  private readonly metadataDir: string;
  private readonly binariesDir?: string;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, config: CacheConfig) {
    this.logger = parentLogger.getSubLogger({ name: 'FileCache' });
    this.fileSystem = fileSystem;
    this.config = config;

    if (config.storageStrategy === 'json') {
      // For JSON strategy, everything goes in the main cache directory
      this.metadataDir = config.cacheDir;
    } else {
      // For binary strategy, separate metadata and binaries
      this.metadataDir = path.join(config.cacheDir, 'metadata');
      this.binariesDir = path.join(config.cacheDir, 'binaries');
    }

    this.logger.debug(
      'constructor: Cache directory: %s, TTL: %d ms, Strategy: %s, Enabled: %s',
      config.cacheDir,
      config.defaultTtl,
      config.storageStrategy,
      config.enabled,
    );
  }

  async get<T>(key: string): Promise<T | null> {
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
      const entry: CacheEntry<T> = JSON.parse(metadataContent);

      // Check if entry is expired
      if (this.isExpired(entry)) {
        logger.debug('Cache entry expired for key: %s', key);
        await this.deleteEntry(key, entry);
        return null;
      }

      if (this.config.storageStrategy === 'json') {
        // For JSON strategy, data is stored directly in the metadata
        logger.debug('Cache hit for key: %s (JSON)', key);
        return entry.data;
      } else {
        // For binary strategy, data is in a separate file
        if (!this.binariesDir) {
          throw new Error('Binary directory not configured for binary strategy');
        }

        const binaryPath = path.join(this.binariesDir, entry.metadata?.['binaryFilePath'] as string);
        if (!(await this.fileSystem.exists(binaryPath))) {
          logger.debug('Binary file missing for key: %s, path: %s', key, binaryPath);
          await this.fileSystem.rm(metadataPath).catch(() => {}); // Clean up orphaned metadata
          return null;
        }

        const binaryContent = await this.fileSystem.readFile(binaryPath);
        const buffer = Buffer.isBuffer(binaryContent) ? binaryContent : Buffer.from(binaryContent);
        
        // Verify content integrity for binary data
        const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const expectedHash = entry.metadata?.['contentHash'] as string;
        
        if (actualHash !== expectedHash) {
          logger.debug('Content hash mismatch for key: %s, expected: %s, actual: %s', 
            key, expectedHash, actualHash);
          await this.deleteEntry(key, entry);
          return null;
        }

        logger.debug('Cache hit for key: %s (binary), size: %d bytes', key, buffer.length);
        return buffer as T;
      }
    } catch (error) {
      logger.debug('Error retrieving cache for key: %s, error: %s', key, (error as Error).message);
      return null;
    }
  }

  async set<T>(key: string, data: T, ttlMs?: number, metadata?: Record<string, unknown>): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'set' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping set for key: %s', key);
      return;
    }

    try {
      await this.ensureCacheDirectories();

      const actualTtlMs = ttlMs ?? this.config.defaultTtl;
      const now = Date.now();

      if (this.config.storageStrategy === 'json') {
        // For JSON strategy, store everything in one file
        const entry: CacheEntry<T> = {
          data,
          timestamp: now,
          expiresAt: now + actualTtlMs,
          metadata,
        };

        const metadataPath = this.getMetadataFilePath(key);
        await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

        logger.debug(
          'Cached data for key: %s (JSON), expires: %s',
          key,
          new Date(entry.expiresAt).toISOString(),
        );
      } else {
        // For binary strategy, store data and metadata separately
        if (!Buffer.isBuffer(data)) {
          throw new Error('Binary storage strategy requires Buffer data');
        }

        if (!this.binariesDir) {
          throw new Error('Binary directory not configured for binary strategy');
        }

        const buffer = data as Buffer;
        const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const binaryFileName = `${contentHash}.bin`;
        const binaryFilePath = path.join(this.binariesDir, binaryFileName);
        
        // Write binary content to file
        await this.fileSystem.writeFile(binaryFilePath, buffer);

        // Store metadata with reference to binary file
        const entry: CacheEntry<string> = {
          data: binaryFileName, // Store filename instead of actual data
          timestamp: now,
          expiresAt: now + actualTtlMs,
          metadata: {
            ...metadata,
            binaryFilePath: binaryFileName,
            contentHash,
            size: buffer.length,
          },
        };

        const metadataPath = this.getMetadataFilePath(key);
        await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

        logger.debug(
          'Cached data for key: %s (binary), size: %d bytes, expires: %s',
          key,
          buffer.length,
          new Date(entry.expiresAt).toISOString(),
        );
      }
    } catch (error) {
      logger.debug('Error caching data for key: %s, error: %s', key, (error as Error).message);
      throw new Error(`Failed to cache data: ${(error as Error).message}`);
    }
  }

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
      const entry: CacheEntry<unknown> = JSON.parse(metadataContent);

      if (this.isExpired(entry)) {
        logger.debug('Cache entry expired for key: %s', key);
        return false;
      }

      // For binary strategy, also check if binary file exists
      if (this.config.storageStrategy === 'binary' && this.binariesDir) {
        const binaryPath = path.join(this.binariesDir, entry.metadata?.['binaryFilePath'] as string);
        const binaryExists = await this.fileSystem.exists(binaryPath);
        
        if (!binaryExists) {
          logger.debug('Binary file missing for key: %s', key);
          return false;
        }
      }

      logger.debug('Valid cache entry exists for key: %s', key);
      return true;
    } catch (error) {
      logger.debug('Error checking cache for key: %s, error: %s', key, (error as Error).message);
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'delete' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping delete for key: %s', key);
      return;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (await this.fileSystem.exists(metadataPath)) {
        if (this.config.storageStrategy === 'binary') {
          // Read metadata to get binary file path before deleting
          const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
          const entry: CacheEntry<unknown> = JSON.parse(metadataContent);
          await this.deleteEntry(key, entry);
        } else {
          // For JSON strategy, just delete the metadata file
          await this.fileSystem.rm(metadataPath);
        }
        
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

  async clearExpired(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clearExpired' });
    if (!this.config.enabled) {
      logger.debug('Cache disabled, skipping clearExpired');
      return;
    }

    try {
      if (!(await this.fileSystem.exists(this.metadataDir))) {
        logger.debug('Cache directory does not exist, nothing to clear');
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
          const entry: CacheEntry<unknown> = JSON.parse(metadataContent);

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
          await this.fileSystem.rm(metadataPath).catch(() => {});
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

  private getMetadataFilePath(key: string): string {
    const hashedKey = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.metadataDir, `${hashedKey}.json`);
  }

  private async ensureCacheDirectories(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'ensureCacheDirectories' });
    try {
      await this.fileSystem.ensureDir(this.metadataDir);
      if (this.binariesDir) {
        await this.fileSystem.ensureDir(this.binariesDir);
      }
    } catch (error) {
      logger.debug('Error ensuring cache directories exist: %s', (error as Error).message);
      throw new Error(`Failed to create cache directories: ${(error as Error).message}`);
    }
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() > entry.expiresAt;
  }

  private async deleteEntry(key: string, entry: CacheEntry<unknown>): Promise<void> {
    const metadataPath = this.getMetadataFilePath(key);

    // Remove metadata file
    if (await this.fileSystem.exists(metadataPath)) {
      await this.fileSystem.rm(metadataPath);
    }

    // Remove binary file if using binary strategy
    if (this.config.storageStrategy === 'binary' && this.binariesDir && entry.metadata?.['binaryFilePath']) {
      const binaryPath = path.join(this.binariesDir, entry.metadata['binaryFilePath'] as string);
      if (await this.fileSystem.exists(binaryPath)) {
        await this.fileSystem.rm(binaryPath);
      }
    }
  }
}