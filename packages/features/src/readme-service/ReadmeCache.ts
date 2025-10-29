import type { ICache } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import { DEFAULT_README_CACHE_TTL } from './constants';
import type { IReadmeCache } from './IReadmeService';
import { messages } from './log-messages';
import type { ReadmeContent } from './types';

/**
 * Cache wrapper specifically for README content
 */
export class ReadmeCache implements IReadmeCache {
  private readonly logger: TsLogger;
  private readonly cache: ICache;
  private readonly defaultTtl: number;

  constructor(parentLogger: TsLogger, cache: ICache, defaultTtl: number = DEFAULT_README_CACHE_TTL) {
    this.logger = parentLogger.getSubLogger({ name: 'ReadmeCache' });
    this.cache = cache;
    this.defaultTtl = defaultTtl;
  }

  async get(cacheKey: string): Promise<ReadmeContent | null> {
    try {
      const content: ReadmeContent | null = await this.cache.get<ReadmeContent>(cacheKey);
      if (content) {
        this.logger.debug(messages.readmeCacheHit(content.owner, content.repo, content.version));
      }
      return content;
    } catch (error) {
      this.logger.error(messages.cacheError('get', cacheKey, error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async set(cacheKey: string, content: ReadmeContent, ttlMs: number = this.defaultTtl): Promise<void> {
    try {
      await this.cache.set(cacheKey, content, ttlMs);
      this.logger.debug(messages.readmeCached(content.owner, content.repo, content.version, ttlMs));
    } catch (error) {
      this.logger.error(messages.cacheError('set', cacheKey, error instanceof Error ? error.message : String(error)));
    }
  }

  async has(cacheKey: string): Promise<boolean> {
    try {
      return await this.cache.has(cacheKey);
    } catch (error) {
      this.logger.error(messages.cacheError('has', cacheKey, error instanceof Error ? error.message : String(error)));
      return false;
    }
  }

  async delete(cacheKey: string): Promise<void> {
    try {
      await this.cache.delete(cacheKey);
    } catch (error) {
      this.logger.error(
        messages.cacheError('delete', cacheKey, error instanceof Error ? error.message : String(error))
      );
    }
  }

  async clearExpired(): Promise<void> {
    try {
      this.logger.debug(messages.clearingExpiredCache());
      await this.cache.clearExpired();
      this.logger.debug(messages.cacheCleared(0)); // Cache doesn't return count
    } catch (error) {
      this.logger.error(
        messages.cacheError('clearExpired', 'all', error instanceof Error ? error.message : String(error))
      );
    }
  }

  generateCacheKey(owner: string, repo: string, version: string): string {
    return `readme:${owner}/${repo}:${version}`;
  }
}
