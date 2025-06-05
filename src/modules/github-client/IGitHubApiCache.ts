/**
 * @file generator/src/modules/github-client/IGitHubApiCache.ts
 * @description Interface for GitHub API response caching.
 *
 * ## Development Plan
 *
 * - [x] Define `CacheEntry<T>` interface with data, timestamp, expiresAt, and optional tokenHash fields
 * - [x] Define `IGitHubApiCache` interface with the following methods:
 *   - [x] `get<T>(key: string): Promise<T | null>` - Get a cached response if available and not expired
 *   - [x] `set<T>(key: string, data: T, ttlMs?: number): Promise<void>` - Store data in the cache
 *   - [x] `has(key: string): Promise<boolean>` - Check if a key exists and is not expired
 *   - [x] `delete(key: string): Promise<void>` - Remove an item from the cache
 *   - [x] `clearExpired(): Promise<void>` - Clear all expired entries
 *   - [x] `clear(): Promise<void>` - Clear the entire cache
 * - [x] Add JSDoc comments for all interfaces and methods
 * - [x] Cleanup all linting errors and warnings
 * - [ ] Update the memory bank with the new information when all tasks are complete
 */

/**
 * Represents a cached API response entry with metadata.
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
   * Optional hash of the authentication token used for the request
   * This allows invalidating cache entries when the token changes
   */
  tokenHash?: string;
}

/**
 * Interface for GitHub API response caching.
 * Implementations should handle storing and retrieving cached API responses
 * with proper TTL (time-to-live) handling.
 */
export interface IGitHubApiCache {
  /**
   * Retrieves a cached response if available and not expired.
   * @template T The type of data to retrieve
   * @param key The cache key
   * @returns A promise that resolves with the cached data, or null if not found or expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Stores data in the cache with an optional TTL.
   * @template T The type of data to store
   * @param key The cache key
   * @param data The data to cache
   * @param ttlMs Optional TTL in milliseconds (overrides default TTL)
   * @returns A promise that resolves when the data has been cached
   */
  set<T>(key: string, data: T, ttlMs?: number): Promise<void>;

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
