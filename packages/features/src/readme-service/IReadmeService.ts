import type { ToolConfig } from '@dotfiles/core';
import type { IToolInstallationRecord } from '@dotfiles/registry';
import type { ICombinedReadmeOptions, IReadmeContent } from './types';

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
  fetchReadmeForVersion(owner: string, repo: string, version: string, toolName: string): Promise<IReadmeContent | null>;

  /**
   * Gets cached README content for a tool version
   * @param owner Repository owner
   * @param repo Repository name
   * @param version Tool version
   * @returns Promise resolving to cached README content or null if not cached
   */
  getCachedReadme(owner: string, repo: string, version: string): Promise<IReadmeContent | null>;

  /**
   * Generates a combined README from all installed tools
   * @param options Options for README generation
   * @returns Promise resolving to combined README markdown content
   */
  generateCombinedReadme(options?: ICombinedReadmeOptions): Promise<string>;

  /**
   * Gets list of installed tools that have GitHub repositories
   * @returns Promise resolving to array of installed tool information
   */
  getGitHubTools(): Promise<IToolInstallationRecord[]>;

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
    repo: string,
  ): Promise<string | null>;

  /**
   * Generates and writes a CATALOG.md file based on tool configurations
   * @param catalogPath Path where the catalog file should be written
   * @param toolConfigs Tool configurations to include in the catalog
   * @param options Options for catalog generation
   * @returns Promise resolving to the written file path or null if failed
   */
  generateCatalogFromConfigs(
    catalogPath: string,
    toolConfigs: Record<string, ToolConfig>,
    options?: ICombinedReadmeOptions,
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
  get(cacheKey: string): Promise<IReadmeContent | null>;

  /**
   * Stores README content in cache
   * @param cacheKey Cache key for the README
   * @param content README content to cache
   * @param ttlMs Time to live in milliseconds
   * @returns Promise resolving when content is cached
   */
  set(cacheKey: string, content: IReadmeContent, ttlMs?: number): Promise<void>;

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
