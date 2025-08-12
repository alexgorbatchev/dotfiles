/**
 * Represents a cached entry with metadata.
 * @template T The type of data being cached
 */
export interface CacheEntry<T> {
  /**
   * The actual cached data
   */
  data: T;

  /**
   * Timestamp when the entry was created (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Timestamp when the entry expires (milliseconds since epoch)
   */
  expiresAt: number;

  /**
   * Optional metadata associated with the cache entry
   */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for the cache.
 */
export interface CacheConfig {
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
  storageStrategy: 'json' | 'binary';
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
   * Stores data in the cache with TTL and optional metadata.
   * @template T The type of data to store
   * @param key The cache key
   * @param data The data to cache
   * @param ttlMs TTL in milliseconds (uses default if not specified)
   * @param metadata Optional metadata to store with the cache entry
   * @returns A promise that resolves when the data has been cached
   */
  set<T>(key: string, data: T, ttlMs?: number, metadata?: Record<string, unknown>): Promise<void>;

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
