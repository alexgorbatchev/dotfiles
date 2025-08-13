import crypto from 'node:crypto';
import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { CacheConfig, CacheEntry, ICache, JsonCacheEntry, BinaryCacheEntry, DownloadCacheEntry } from './types';

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
      logs.cache.debug.constructorDebug(config.cacheDir, config.defaultTtl, config.storageStrategy, config.enabled)
    );
  }

  async get<T>(key: string): Promise<T | null> {
    const logger = this.logger.getSubLogger({ name: 'get' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('returning null', key));
      return null;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (!(await this.fileSystem.exists(metadataPath))) {
        logger.debug(logs.cache.debug.notFound(key));
        return null;
      }

      const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
      const entry: CacheEntry = JSON.parse(metadataContent);

      // Check if entry is expired
      if (this.isExpired(entry)) {
        logger.debug(logs.cache.debug.expired(key));
        await this.deleteEntry(key, entry);
        return null;
      }

      if (entry.type === 'json') {
        // For JSON entries, data is stored directly
        logger.debug(logs.cache.success.hit(key, 'JSON'));
        return (entry as JsonCacheEntry<T>).data;
      } else {
        // For binary entries, data is in a separate file
        if (!this.binariesDir) {
          throw new Error(logs.cache.error.binaryFileNotConfigured());
        }

        const binaryEntry = entry as BinaryCacheEntry;
        const binaryPath = path.join(this.binariesDir, binaryEntry.binaryFileName);
        if (!(await this.fileSystem.exists(binaryPath))) {
          logger.debug(logs.cache.debug.binaryFileMissing(key, binaryPath));
          await this.fileSystem.rm(metadataPath).catch(() => {}); // Clean up orphaned metadata
          return null;
        }

        const binaryContent = await this.fileSystem.readFile(binaryPath);
        const buffer = Buffer.isBuffer(binaryContent) ? binaryContent : Buffer.from(binaryContent);

        // Verify content integrity for binary data
        const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const expectedHash = binaryEntry.contentHash;

        if (actualHash !== expectedHash) {
          logger.debug(logs.cache.error.contentHashMismatch(key, expectedHash, actualHash));
          await this.deleteEntry(key, entry);
          return null;
        }

        logger.debug(logs.cache.success.hit(key, 'binary', buffer.length));
        return buffer as T;
      }
    } catch (error) {
      logger.debug(logs.cache.error.retrievalFailed(key, (error as Error).message));
      return null;
    }
  }

  async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'set' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('skipping set', key));
      return;
    }

    try {
      await this.ensureCacheDirectories();

      const actualTtlMs = ttlMs ?? this.config.defaultTtl;
      const now = Date.now();

      if (this.config.storageStrategy === 'json') {
        // For JSON strategy, store everything in one file
        const entry: JsonCacheEntry<T> = {
          type: 'json',
          data,
          timestamp: now,
          expiresAt: now + actualTtlMs,
        };

        const metadataPath = this.getMetadataFilePath(key);
        await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

        logger.debug(logs.cache.success.stored(key, 'JSON', new Date(entry.expiresAt).toISOString()));
      } else {
        // For binary strategy, store data and metadata separately
        if (!Buffer.isBuffer(data)) {
          throw new Error(logs.cache.error.binaryDataRequired());
        }

        if (!this.binariesDir) {
          throw new Error(logs.cache.error.binaryFileNotConfigured());
        }

        const buffer = data as Buffer;
        const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const binaryFileName = `${contentHash}.bin`;
        const binaryFilePath = path.join(this.binariesDir, binaryFileName);

        // Write binary content to file
        await this.fileSystem.writeFile(binaryFilePath, buffer);

        // Store metadata with reference to binary file
        const entry: BinaryCacheEntry = {
          type: 'binary',
          binaryFileName,
          contentHash,
          size: buffer.length,
          timestamp: now,
          expiresAt: now + actualTtlMs,
        };

        const metadataPath = this.getMetadataFilePath(key);
        await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

        logger.debug(logs.cache.success.stored(key, 'binary', new Date(entry.expiresAt).toISOString(), buffer.length));
      }
    } catch (error) {
      logger.debug(logs.cache.error.storageFailed(key, (error as Error).message));
      throw new Error(`Failed to cache data: ${(error as Error).message}`);
    }
  }

  async setDownload(key: string, data: Buffer, ttlMs: number | undefined, url: string, contentType?: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'setDownload' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('skipping setDownload', key));
      return;
    }

    try {
      await this.ensureCacheDirectories();

      const actualTtlMs = ttlMs ?? this.config.defaultTtl;
      const now = Date.now();

      if (this.config.storageStrategy === 'json') {
        throw new Error('Download caching requires binary storage strategy');
      }

      if (!this.binariesDir) {
        throw new Error(logs.cache.error.binaryFileNotConfigured());
      }

      const contentHash = crypto.createHash('sha256').update(data).digest('hex');
      const binaryFileName = `${contentHash}.bin`;
      const binaryFilePath = path.join(this.binariesDir, binaryFileName);

      // Write binary content to file
      await this.fileSystem.writeFile(binaryFilePath, data);

      // Store metadata with download information
      const entry: DownloadCacheEntry = {
        type: 'binary',
        binaryFileName,
        contentHash,
        size: data.length,
        url,
        contentType,
        timestamp: now,
        expiresAt: now + actualTtlMs,
      };

      const metadataPath = this.getMetadataFilePath(key);
      await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

      logger.debug(logs.cache.success.stored(key, 'download', new Date(entry.expiresAt).toISOString(), data.length));
    } catch (error) {
      logger.debug(logs.cache.error.storageFailed(key, (error as Error).message));
      throw new Error(`Failed to cache download: ${(error as Error).message}`);
    }
  }

  async has(key: string): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'has' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('returning false', key));
      return false;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (!(await this.fileSystem.exists(metadataPath))) {
        logger.debug(logs.cache.debug.notFound(key));
        return false;
      }

      const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
      const entry: CacheEntry = JSON.parse(metadataContent);

      if (this.isExpired(entry)) {
        logger.debug(logs.cache.debug.expired(key));
        return false;
      }

      // For binary entries, also check if binary file exists
      if (entry.type === 'binary' && this.binariesDir) {
        const binaryEntry = entry as BinaryCacheEntry;
        const binaryPath = path.join(this.binariesDir, binaryEntry.binaryFileName);
        const binaryExists = await this.fileSystem.exists(binaryPath);

        if (!binaryExists) {
          logger.debug(logs.cache.debug.binaryFileMissing(key, binaryPath));
          return false;
        }
      }

      logger.debug(logs.cache.success.entryExists(key));
      return true;
    } catch (error) {
      logger.debug(logs.cache.error.checkFailed(key, (error as Error).message));
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'delete' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('skipping delete', key));
      return;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (await this.fileSystem.exists(metadataPath)) {
        const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
        const entry: CacheEntry = JSON.parse(metadataContent);
        await this.deleteEntry(key, entry);
        logger.debug(logs.cache.success.removed(key));
      } else {
        logger.debug(logs.cache.debug.noEntryToDelete(key));
      }
    } catch (error) {
      logger.debug(logs.cache.error.deleteFailed(key, (error as Error).message));
      throw new Error(`Failed to delete cache entry: ${(error as Error).message}`);
    }
  }

  async clearExpired(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clearExpired' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('skipping clearExpired', 'N/A'));
      return;
    }

    try {
      if (!(await this.fileSystem.exists(this.metadataDir))) {
        logger.debug(logs.cache.debug.directoryNotExist());
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
          const entry: CacheEntry = JSON.parse(metadataContent);

          if (this.isExpired(entry)) {
            const key = path.basename(file, '.json');
            await this.deleteEntry(key, entry);
            expiredCount++;
          }
        } catch (error) {
          logger.debug(logs.cache.debug.fileProcessingError(file, (error as Error).message));
          // Remove problematic metadata file
          await this.fileSystem.rm(metadataPath).catch(() => {});
          expiredCount++;
        }
      }

      logger.debug(logs.cache.success.expiredCleared(expiredCount));
    } catch (error) {
      logger.debug(logs.cache.error.clearExpiredFailed((error as Error).message));
      throw new Error(`Failed to clear expired cache entries: ${(error as Error).message}`);
    }
  }

  async clear(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clear' });
    if (!this.config.enabled) {
      logger.debug(logs.cache.debug.disabled('skipping clear', 'N/A'));
      return;
    }

    try {
      if (await this.fileSystem.exists(this.config.cacheDir)) {
        await this.fileSystem.rm(this.config.cacheDir, { recursive: true, force: true });
        logger.debug(logs.cache.success.cleared());
      } else {
        logger.debug(logs.cache.debug.directoryNotExist());
      }
      // Always ensure the cache directory exists after attempting to clear
      await this.ensureCacheDirectories();
    } catch (error) {
      logger.debug(logs.cache.error.clearFailed((error as Error).message));
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
      logger.debug(logs.cache.error.directoryCreationFailed((error as Error).message));
      throw new Error(`Failed to create cache directories: ${(error as Error).message}`);
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  private async deleteEntry(key: string, entry: CacheEntry): Promise<void> {
    const metadataPath = this.getMetadataFilePath(key);

    // Remove metadata file
    if (await this.fileSystem.exists(metadataPath)) {
      await this.fileSystem.rm(metadataPath);
    }

    // Remove binary file if it's a binary entry
    if (entry.type === 'binary' && this.binariesDir) {
      const binaryEntry = entry as BinaryCacheEntry;
      const binaryPath = path.join(this.binariesDir, binaryEntry.binaryFileName);
      if (await this.fileSystem.exists(binaryPath)) {
        await this.fileSystem.rm(binaryPath);
      }
    }
  }
}
