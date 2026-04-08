/**
 * Base interface for all cache entries
 */
interface IBaseCacheEntry {
  /**
   * Timestamp when the entry was created (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Timestamp when the entry expires (milliseconds since epoch)
   */
  expiresAt: number;
}

/**
 * Cache entry for JSON data (API responses, configuration, etc.)
 */
export interface IJsonCacheEntry<T> extends IBaseCacheEntry {
  type: "json";
  /**
   * The actual cached data
   */
  data: T;
}

/**
 * Cache entry for binary data (downloaded files, archives, etc.)
 */
export interface IBinaryCacheEntry extends IBaseCacheEntry {
  type: "binary";
  /**
   * Filename of the binary file (without path)
   */
  binaryFileName: string;
  /**
   * SHA-256 hash of the binary content for integrity verification
   */
  contentHash: string;
  /**
   * Size of the binary data in bytes
   */
  size: number;
}

/**
 * Cache entry for downloaded content with additional metadata
 */
export interface IDownloadCacheEntry extends IBinaryCacheEntry {
  /**
   * Original URL the content was downloaded from
   */
  url: string;
  /**
   * Content type from HTTP headers
   */
  contentType?: string;
}

/**
 * Union type for all possible cache entry types
 */
export type CacheEntry<T = unknown> = IJsonCacheEntry<T> | IBinaryCacheEntry | IDownloadCacheEntry;

/**
 * Configuration for the cache.
 */
export interface ICacheConfig {
  /**
   * Whether caching is enabled
   */
  enabled: boolean;

  /**
   * Default TTL in milliseconds
   */
  defaultTtl: number;

  /**
   * Cache storage directory
   */
  cacheDir: string;

  /**
   * Storage strategy for different data types
   */
  storageStrategy: "json" | "binary";
}

/**
 * Interface for a generic cache system that can handle both JSON data (like API responses)
 * and binary data (like downloaded files) efficiently using different storage strategies.
 */
export interface ICache {
  /**
   * Retrieves cached data if available and not expired.
   * @template T The type of data to retrieve
   * @param key The cache key
   * @returns A promise that resolves with the cached data, or null if not found or expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Stores data in the cache with TTL.
   * @template T The type of data to store
   * @param key The cache key
   * @param data The data to cache
   * @param ttlMs TTL in milliseconds (uses default if not specified)
   * @returns A promise that resolves when the data has been cached
   */
  set<T>(key: string, data: T, ttlMs?: number): Promise<void>;

  /**
   * Stores downloaded binary data in the cache with additional metadata.
   * @param key The cache key
   * @param data The binary data to cache
   * @param ttlMs TTL in milliseconds (uses default if not specified)
   * @param url The original URL the content was downloaded from
   * @param contentType Optional content type from HTTP headers
   * @returns A promise that resolves when the data has been cached
   */
  setDownload(key: string, data: Buffer, ttlMs: number | undefined, url: string, contentType?: string): Promise<void>;

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key The cache key to check
   * @returns A promise that resolves with true if the key exists and is not expired, false otherwise
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes an item from the cache.
   * @param key The cache key to delete
   * @returns A promise that resolves when the item has been removed
   */
  delete(key: string): Promise<void>;

  /**
   * Clears all expired entries from the cache.
   * @returns A promise that resolves when all expired entries have been removed
   */
  clearExpired(): Promise<void>;

  /**
   * Clears the entire cache.
   * @returns A promise that resolves when the cache has been cleared
   */
  clear(): Promise<void>;
}
