/**
 * Represents a cached download entry with metadata.
 */
export interface DownloadCacheEntry {
  /**
   * URL that was downloaded
   */
  url: string;

  /**
   * Size of the cached file in bytes
   */
  size: number;

  /**
   * Content type of the downloaded file
   */
  contentType?: string;

  /**
   * Path to the cached binary file (relative to cache directory)
   */
  binaryFilePath: string;

  /**
   * SHA-256 hash of the binary content for integrity verification
   */
  contentHash: string;

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
 * Interface for a download-specific cache that handles large binary files efficiently.
 * Unlike the generic ICache, this stores binary content as separate files and only
 * keeps metadata in JSON for performance with large downloads.
 */
export interface IDownloadCache {
  /**
   * Retrieves cached download data if available and not expired.
   * @param key The cache key
   * @returns A promise that resolves with the cached buffer, or null if not found or expired
   */
  get(key: string): Promise<Buffer | null>;

  /**
   * Stores downloaded data in the cache with TTL.
   * @param key The cache key
   * @param data The binary data to cache
   * @param ttlMs TTL in milliseconds
   * @param metadata Metadata about the download (URL, content type, etc.)
   * @returns A promise that resolves when the data has been cached
   */
  set(key: string, data: Buffer, ttlMs: number, metadata: {
    url: string;
    contentType?: string;
  }): Promise<void>;

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key The cache key to check
   * @returns A promise that resolves with true if the key exists and is not expired, false otherwise
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes an item from the cache (both metadata and binary file).
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