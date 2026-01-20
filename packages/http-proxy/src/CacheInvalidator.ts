import { minimatch } from 'minimatch';

import type { ProxyCacheStore } from './ProxyCacheStore';
import type { CacheClearResult } from './types';

/**
 * Utility for clearing cache entries using glob patterns.
 */
export class CacheInvalidator {
  private readonly store: ProxyCacheStore;

  constructor(store: ProxyCacheStore) {
    this.store = store;
  }

  /**
   * Match a URL against a glob pattern.
   * Handles special URL matching logic.
   */
  private matchesPattern(url: string, method: string, pattern: string): boolean {
    // Handle method:pattern format (e.g., GET:**/example.com/**)
    if (pattern.includes(':') && !pattern.startsWith('http')) {
      const [methodPattern, ...urlParts] = pattern.split(':');
      const urlPattern = urlParts.join(':');
      if (method !== methodPattern?.toUpperCase()) {
        return false;
      }
      return this.matchUrlPattern(url, urlPattern);
    }

    return this.matchUrlPattern(url, pattern);
  }

  /**
   * Match URL against a glob pattern.
   */
  private matchUrlPattern(url: string, pattern: string): boolean {
    // Try minimatch first
    if (minimatch(url, pattern, { dot: true })) {
      return true;
    }

    // Handle ** glob patterns by converting to substring matching
    if (pattern.includes('**')) {
      // Extract the meaningful parts from the pattern
      const parts = pattern.split('**').filter((p) => p.length > 0);
      return parts.every((part) => {
        // Remove leading/trailing wildcards or slashes for matching
        const cleanPart = part.replace(/^[/*]+|[/*]+$/g, '');
        if (cleanPart.length === 0) return true;

        // For domain-like patterns (e.g., github.com), we need word boundary matching
        // to avoid matching "notgithub.com" when searching for "github.com"
        if (cleanPart.includes('.')) {
          // Match if preceded by: start of string, protocol separator (://), dot, or slash
          // Match if followed by: end of string, dot, slash, colon, or query string
          const escapedPart = cleanPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(^|://|\\.|/)${escapedPart}($|\\.|/|:|\\?)`);
          return regex.test(url);
        }

        return url.includes(cleanPart);
      });
    }

    return false;
  }

  /**
   * Clear cache entries matching one or more glob patterns.
   * Patterns are matched against the full URL.
   *
   * @param patterns - Glob patterns to match (empty array or single "*" clears all)
   * @returns Result with count of cleared entries
   */
  clear(patterns: string[]): CacheClearResult {
    const entries = this.store.getAllEntries();

    // If no patterns provided or single "*" pattern, clear everything
    if (patterns.length === 0 || (patterns.length === 1 && patterns[0] === '*')) {
      const cleared = this.store.clear();
      return {
        cleared,
        message: `Cleared ${cleared} cache entries`,
      };
    }

    let cleared = 0;

    for (const entry of entries) {
      const matches = patterns.some((pattern) => this.matchesPattern(entry.url, entry.method, pattern));

      if (matches) {
        if (this.store.deleteByKey(entry.key)) {
          cleared++;
        }
      }
    }

    return {
      cleared,
      message: `Cleared ${cleared} cache entries matching patterns`,
    };
  }
}
