import crypto from 'node:crypto';
import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import type {
  CacheEntry,
  IBinaryCacheEntry,
  ICache,
  ICacheConfig,
  IDownloadCacheEntry,
  IJsonCacheEntry,
} from './types';

/**
 * File-based cache implementation that supports both JSON and binary storage strategies.
 * - JSON strategy: Stores everything in a single JSON file (good for small API responses)
 * - Binary strategy: Stores binary content separately with JSON metadata (good for large files)
 */
export class FileCache implements ICache {
  private readonly config: ICacheConfig;
  private readonly fileSystem: IFileSystem;
  private readonly logger: TsLogger;
  private readonly metadataDir: string;
  private readonly binariesDir?: string;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, config: ICacheConfig) {
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

    this.logger.debug(messages.initialized(config.cacheDir, config.defaultTtl, config.storageStrategy, config.enabled));
  }

  async get<T>(key: string): Promise<T | null> {
    const logger = this.logger.getSubLogger({ name: 'get' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('returning null', key));
      return null;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (!(await this.fileSystem.exists(metadataPath))) {
        logger.debug(messages.entryMissing(key));
        return null;
      }

      const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
      const entry: CacheEntry<T> = JSON.parse(metadataContent);

      // Check if entry is expired
      if (this.isExpired(entry)) {
        logger.debug(messages.entryExpired(key));
        await this.deleteEntry(key, entry);
        return null;
      }

      if (entry.type === 'json') {
        // For JSON entries, data is stored directly
        logger.debug(messages.cacheHit(key, 'JSON'));
        return entry.data;
      } else {
        // For binary entries, data is in a separate file
        if (!this.binariesDir) {
          throw new Error(messages.binaryDirectoryNotConfigured());
        }

        const binaryPath = path.join(this.binariesDir, entry.binaryFileName);
        if (!(await this.fileSystem.exists(binaryPath))) {
          logger.warn(messages.binaryFileMissing(key, binaryPath));
          await this.fileSystem.rm(metadataPath).catch(() => {}); // Clean up orphaned metadata
          return null;
        }

        const binaryContent = await this.fileSystem.readFile(binaryPath);
        const buffer = Buffer.isBuffer(binaryContent) ? binaryContent : Buffer.from(binaryContent);

        // Verify content integrity for binary data
        const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const expectedHash = entry.contentHash;

        if (actualHash !== expectedHash) {
          logger.warn(messages.contentHashMismatch(key, expectedHash, actualHash));
          await this.deleteEntry(key, entry);
          return null;
        }

        logger.debug(messages.cacheHit(key, 'binary', buffer.length));
        return buffer as T;
      }
    } catch (error) {
      logger.warn(messages.retrievalFailed(key, this.getErrorMessage(error)));
      return null;
    }
  }

  async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'set' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('skipping set', key));
      return;
    }

    try {
      await this.ensureCacheDirectories();

      const actualTtlMs = ttlMs ?? this.config.defaultTtl;
      const now = Date.now();

      if (this.config.storageStrategy === 'json') {
        // For JSON strategy, store everything in one file
        const entry: IJsonCacheEntry<T> = {
          type: 'json',
          data,
          timestamp: now,
          expiresAt: now + actualTtlMs,
        };

        const metadataPath = this.getMetadataFilePath(key);
        await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

        logger.debug(messages.cacheStored(key, 'JSON', new Date(entry.expiresAt).toISOString()));
      } else {
        // For binary strategy, store data and metadata separately
        if (!Buffer.isBuffer(data)) {
          throw new Error(messages.binaryDataRequired());
        }

        if (!this.binariesDir) {
          throw new Error(messages.binaryDirectoryNotConfigured());
        }

        const buffer = data;
        const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
        const binaryFileName = `${contentHash}.bin`;
        const binaryFilePath = path.join(this.binariesDir, binaryFileName);

        // Write binary content to file
        await this.fileSystem.writeFile(binaryFilePath, buffer);

        // Store metadata with reference to binary file
        const entry: IBinaryCacheEntry = {
          type: 'binary',
          binaryFileName,
          contentHash,
          size: buffer.length,
          timestamp: now,
          expiresAt: now + actualTtlMs,
        };

        const metadataPath = this.getMetadataFilePath(key);
        await this.fileSystem.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf8');

        logger.debug(messages.cacheStored(key, 'binary', new Date(entry.expiresAt).toISOString(), buffer.length));
      }
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.warn(messages.storageFailed(key, errorMessage));
      throw new Error(`Failed to cache data: ${errorMessage}`);
    }
  }

  async setDownload(
    key: string,
    data: Buffer,
    ttlMs: number | undefined,
    url: string,
    contentType?: string
  ): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'setDownload' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('skipping setDownload', key));
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
        throw new Error(messages.binaryDirectoryNotConfigured());
      }

      const contentHash = crypto.createHash('sha256').update(data).digest('hex');
      const binaryFileName = `${contentHash}.bin`;
      const binaryFilePath = path.join(this.binariesDir, binaryFileName);

      // Write binary content to file
      await this.fileSystem.writeFile(binaryFilePath, data);

      // Store metadata with download information
      const entry: IDownloadCacheEntry = {
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

      logger.debug(messages.cacheStored(key, 'download', new Date(entry.expiresAt).toISOString(), data.length));
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.warn(messages.storageFailed(key, errorMessage));
      throw new Error(`Failed to cache download: ${errorMessage}`);
    }
  }

  async has(key: string): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'has' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('returning false', key));
      return false;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (!(await this.fileSystem.exists(metadataPath))) {
        logger.debug(messages.entryMissing(key));
        return false;
      }

      const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
      const entry: CacheEntry = JSON.parse(metadataContent);

      if (this.isExpired(entry)) {
        logger.debug(messages.entryExpired(key));
        return false;
      }

      // For binary entries, also check if binary file exists
      if (entry.type === 'binary' && this.binariesDir) {
        const binaryPath = path.join(this.binariesDir, entry.binaryFileName);
        const binaryExists = await this.fileSystem.exists(binaryPath);

        if (!binaryExists) {
          logger.debug(messages.binaryFileMissing(key, binaryPath));
          return false;
        }
      }

      logger.debug(messages.cacheEntryExists(key));
      return true;
    } catch (error) {
      logger.warn(messages.checkFailed(key, this.getErrorMessage(error)));
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'delete' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('skipping delete', key));
      return;
    }

    try {
      const metadataPath = this.getMetadataFilePath(key);

      if (await this.fileSystem.exists(metadataPath)) {
        const metadataContent = await this.fileSystem.readFile(metadataPath, 'utf8');
        const entry: CacheEntry = JSON.parse(metadataContent);
        await this.deleteEntry(key, entry);
        logger.debug(messages.cacheEntryRemoved(key));
      } else {
        logger.debug(messages.noEntryToDelete(key));
      }
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.warn(messages.deleteFailed(key, errorMessage));
      throw new Error(`Failed to delete cache entry: ${errorMessage}`);
    }
  }

  async clearExpired(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clearExpired' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('skipping clearExpired', 'N/A'));
      return;
    }

    try {
      if (!(await this.fileSystem.exists(this.metadataDir))) {
        logger.debug(messages.cacheDirectoryMissing());
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
          logger.warn(messages.metadataProcessingWarning(file, this.getErrorMessage(error)));
          // Remove problematic metadata file
          await this.fileSystem.rm(metadataPath).catch(() => {});
          expiredCount++;
        }
      }

      logger.debug(messages.expiredEntriesCleared(expiredCount));
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.warn(messages.clearExpiredFailed(errorMessage));
      throw new Error(`Failed to clear expired cache entries: ${errorMessage}`);
    }
  }

  async clear(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'clear' });
    if (!this.config.enabled) {
      logger.debug(messages.cachingDisabled('skipping clear', 'N/A'));
      return;
    }

    try {
      if (await this.fileSystem.exists(this.config.cacheDir)) {
        await this.fileSystem.rm(this.config.cacheDir, { recursive: true, force: true });
        logger.debug(messages.cacheCleared());
      } else {
        logger.debug(messages.cacheDirectoryMissing());
      }
      // Always ensure the cache directory exists after attempting to clear
      await this.ensureCacheDirectories();
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.warn(messages.clearFailed(errorMessage));
      throw new Error(`Failed to clear cache: ${errorMessage}`);
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
      const errorMessage = this.getErrorMessage(error);
      logger.warn(messages.directoryCreationFailed(errorMessage));
      throw new Error(`Failed to create cache directories: ${errorMessage}`);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
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
      const binaryPath = path.join(this.binariesDir, entry.binaryFileName);
      if (await this.fileSystem.exists(binaryPath)) {
        await this.fileSystem.rm(binaryPath);
      }
    }
  }
}
