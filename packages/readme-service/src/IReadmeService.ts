import type { CombinedReadmeOptions, InstalledTool, ReadmeContent } from './types';

/**
 * Interface for a service that manages README files for tools
 */
export interface IReadmeService {
  /**
   * Fetches README content for a specific tool version
   * @param owner Repository owner
   * @param repo Repository name
   * @param version Git tag/version (e.g., "v1.2.3")
   * @param toolName Tool name for metadata
   * @returns Promise resolving to README content or null if not found
   */
  fetchReadmeForVersion(owner: string, repo: string, version: string, toolName: string): Promise<ReadmeContent | null>;

  /**
   * Gets cached README content for a tool version
   * @param owner Repository owner
   * @param repo Repository name
   * @param version Tool version
   * @returns Promise resolving to cached README content or null if not cached
   */
  getCachedReadme(owner: string, repo: string, version: string): Promise<ReadmeContent | null>;

  /**
   * Generates a combined README from all installed tools
   * @param options Options for README generation
   * @returns Promise resolving to combined README markdown content
   */
  generateCombinedReadme(options?: CombinedReadmeOptions): Promise<string>;

  /**
   * Gets list of installed tools that have GitHub repositories
   * @returns Promise resolving to array of installed tool information
   */
  getGitHubTools(): Promise<InstalledTool[]>;

  /**
   * Clears expired README cache entries
   * @returns Promise resolving when cleanup is complete
   */
  clearExpiredCache(): Promise<void>;

  /**
   * Writes README content to a destination path organized by tool and version
   * @param destPath Base destination directory path
   * @param toolName Tool name
   * @param version Tool version
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Promise resolving to the written file path or null if README not available
   */
  writeReadmeToPath(
    destPath: string,
    toolName: string,
    version: string,
    owner: string,
    repo: string
  ): Promise<string | null>;
}

/**
 * Interface for README caching operations
 */
export interface IReadmeCache {
  /**
   * Gets cached README content
   * @param cacheKey Cache key for the README
   * @returns Promise resolving to cached content or null if not found
   */
  get(cacheKey: string): Promise<ReadmeContent | null>;

  /**
   * Stores README content in cache
   * @param cacheKey Cache key for the README
   * @param content README content to cache
   * @param ttlMs Time to live in milliseconds
   * @returns Promise resolving when content is cached
   */
  set(cacheKey: string, content: ReadmeContent, ttlMs?: number): Promise<void>;

  /**
   * Checks if README is cached and not expired
   * @param cacheKey Cache key to check
   * @returns Promise resolving to true if cached and valid
   */
  has(cacheKey: string): Promise<boolean>;

  /**
   * Removes cached README
   * @param cacheKey Cache key to remove
   * @returns Promise resolving when removal is complete
   */
  delete(cacheKey: string): Promise<void>;

  /**
   * Clears all expired cache entries
   * @returns Promise resolving when cleanup is complete
   */
  clearExpired(): Promise<void>;

  /**
   * Generates cache key for README
   * @param owner Repository owner
   * @param repo Repository name
   * @param version Tool version
   * @returns Cache key string
   */
  generateCacheKey(owner: string, repo: string, version: string): string;
}
