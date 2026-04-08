import type { ICache } from "@dotfiles/downloader";
import type { TsLogger } from "@dotfiles/logger";
import { DEFAULT_README_CACHE_TTL } from "./constants";
import type { IReadmeCache } from "./IReadmeService";
import { messages } from "./log-messages";
import type { IReadmeContent } from "./types";

/**
 * Cache implementation specifically for README content.
 *
 * This class wraps a generic cache interface to provide README-specific caching
 * with TTL (time-to-live) support. It handles cache key generation, expiration,
 * and error handling for README fetch operations.
 */
export class ReadmeCache implements IReadmeCache {
  private readonly logger: TsLogger;
  private readonly cache: ICache;
  private readonly defaultTtl: number;

  /**
   * Creates a new ReadmeCache instance.
   *
   * @param parentLogger - The parent logger for creating sub-loggers.
   * @param cache - The underlying cache implementation.
   * @param defaultTtl - Default time-to-live in milliseconds for cached READMEs.
   */
  constructor(parentLogger: TsLogger, cache: ICache, defaultTtl: number = DEFAULT_README_CACHE_TTL) {
    this.logger = parentLogger.getSubLogger({ name: "ReadmeCache" });
    this.cache = cache;
    this.defaultTtl = defaultTtl;
  }

  /**
   * @inheritdoc IReadmeCache.get
   */
  async get(cacheKey: string): Promise<IReadmeContent | null> {
    try {
      const content: IReadmeContent | null = await this.cache.get<IReadmeContent>(cacheKey);
      if (content) {
        this.logger.debug(messages.readmeCacheHit(content.owner, content.repo, content.version));
      }
      return content;
    } catch (error) {
      this.logger.error(messages.cacheError("get", cacheKey, error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  /**
   * @inheritdoc IReadmeCache.set
   */
  async set(cacheKey: string, content: IReadmeContent, ttlMs: number = this.defaultTtl): Promise<void> {
    try {
      await this.cache.set(cacheKey, content, ttlMs);
      this.logger.debug(messages.readmeCached(content.owner, content.repo, content.version, ttlMs));
    } catch (error) {
      this.logger.error(messages.cacheError("set", cacheKey, error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * @inheritdoc IReadmeCache.has
   */
  async has(cacheKey: string): Promise<boolean> {
    try {
      return await this.cache.has(cacheKey);
    } catch (error) {
      this.logger.error(messages.cacheError("has", cacheKey, error instanceof Error ? error.message : String(error)));
      return false;
    }
  }

  /**
   * @inheritdoc IReadmeCache.delete
   */
  async delete(cacheKey: string): Promise<void> {
    try {
      await this.cache.delete(cacheKey);
    } catch (error) {
      this.logger.error(
        messages.cacheError("delete", cacheKey, error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /**
   * @inheritdoc IReadmeCache.clearExpired
   */
  async clearExpired(): Promise<void> {
    try {
      this.logger.debug(messages.clearingExpiredCache());
      await this.cache.clearExpired();
      this.logger.debug(messages.cacheCleared(0)); // Cache doesn't return count
    } catch (error) {
      this.logger.error(
        messages.cacheError("clearExpired", "all", error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /**
   * @inheritdoc IReadmeCache.generateCacheKey
   */
  generateCacheKey(owner: string, repo: string, version: string): string {
    return `readme:${owner}/${repo}:${version}`;
  }
}
