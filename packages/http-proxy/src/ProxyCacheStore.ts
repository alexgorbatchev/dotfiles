import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CacheEntry, CacheStats } from "./types";

/**
 * Cache entry with body loaded from separate file.
 */
export interface CacheEntryWithBody extends CacheEntry {
  /** Response body as Buffer */
  body: Buffer;
}

/**
 * File-based cache storage for the HTTP proxy.
 * Uses SHA-256 hashes of request signatures as cache keys.
 * Organizes files into subdirectories based on first 2 chars of hash.
 *
 * Storage format:
 * - {key}.meta.json - metadata (url, method, status, headers, timestamps)
 * - {key}.body - raw binary response body
 */
export class ProxyCacheStore {
  private readonly cacheDir: string;
  private readonly defaultTtl: number;

  constructor(cacheDir: string, defaultTtl: number = 24 * 60 * 60 * 1000) {
    this.cacheDir = cacheDir;
    this.defaultTtl = defaultTtl;
    this.ensureCacheDir();
  }

  /**
   * Generate a cache key from request method and URL.
   */
  generateKey(method: string, url: string): string {
    const signature = `${method.toUpperCase()}:${url}`;
    return createHash("sha256").update(signature).digest("hex");
  }

  /**
   * Get the metadata file path for a cache key.
   */
  private getMetaPath(key: string): string {
    const subdir = key.slice(0, 2);
    return join(this.cacheDir, subdir, `${key}.meta.json`);
  }

  /**
   * Get the body file path for a cache key.
   */
  private getBodyPath(key: string): string {
    const subdir = key.slice(0, 2);
    return join(this.cacheDir, subdir, `${key}.body`);
  }

  /**
   * Ensure cache directory exists.
   */
  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get a cached entry if it exists and is not expired.
   */
  get(method: string, url: string): CacheEntryWithBody | undefined {
    const key = this.generateKey(method, url);
    const metaPath = this.getMetaPath(key);
    const bodyPath = this.getBodyPath(key);

    if (!existsSync(metaPath) || !existsSync(bodyPath)) {
      return undefined;
    }

    try {
      const content = readFileSync(metaPath, "utf-8");
      const entry: CacheEntry = JSON.parse(content);

      // Check if expired
      const expiresAt = entry.cachedAt + entry.ttl;
      if (Date.now() > expiresAt) {
        this.delete(method, url);
        return undefined;
      }

      // Read body as raw binary
      const body = readFileSync(bodyPath);

      return { ...entry, body };
    } catch {
      // Invalid cache entry, delete it
      this.delete(method, url);
      return undefined;
    }
  }

  /**
   * Store a response in the cache.
   */
  set(method: string, url: string, status: number, headers: Record<string, string>, body: Buffer, ttl?: number): void {
    const key = this.generateKey(method, url);
    const metaPath = this.getMetaPath(key);
    const bodyPath = this.getBodyPath(key);
    const subdir = join(this.cacheDir, key.slice(0, 2));

    if (!existsSync(subdir)) {
      mkdirSync(subdir, { recursive: true });
    }

    const entry: CacheEntry = {
      url,
      method: method.toUpperCase(),
      status,
      headers,
      cachedAt: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    };

    // Write metadata as JSON
    writeFileSync(metaPath, JSON.stringify(entry, null, 2));
    // Write body as raw binary
    writeFileSync(bodyPath, body);
  }

  /**
   * Delete a cached entry.
   */
  delete(method: string, url: string): boolean {
    const key = this.generateKey(method, url);
    const metaPath = this.getMetaPath(key);
    const bodyPath = this.getBodyPath(key);
    let deleted = false;

    if (existsSync(metaPath)) {
      rmSync(metaPath);
      deleted = true;
    }
    if (existsSync(bodyPath)) {
      rmSync(bodyPath);
      deleted = true;
    }

    return deleted;
  }

  /**
   * Get all cache entry URLs (for glob matching).
   */
  getAllEntries(): Array<{ key: string; url: string; method: string; metaPath: string; bodyPath: string }> {
    const entries: Array<{ key: string; url: string; method: string; metaPath: string; bodyPath: string }> = [];

    if (!existsSync(this.cacheDir)) {
      return entries;
    }

    const subdirs = readdirSync(this.cacheDir, { withFileTypes: true });

    for (const subdir of subdirs) {
      if (!subdir.isDirectory()) continue;

      const subdirPath = join(this.cacheDir, subdir.name);
      const files = readdirSync(subdirPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".meta.json")) continue;

        const metaPath = join(subdirPath, file.name);
        try {
          const content = readFileSync(metaPath, "utf-8");
          const entry: CacheEntry = JSON.parse(content);
          const key = file.name.replace(".meta.json", "");
          const bodyPath = join(subdirPath, `${key}.body`);
          entries.push({ key, url: entry.url, method: entry.method, metaPath, bodyPath });
        } catch {
          // Skip invalid entries
        }
      }
    }

    return entries;
  }

  /**
   * Delete a cache entry by key.
   */
  deleteByKey(key: string): boolean {
    const metaPath = this.getMetaPath(key);
    const bodyPath = this.getBodyPath(key);
    let deleted = false;

    if (existsSync(metaPath)) {
      rmSync(metaPath);
      deleted = true;
    }
    if (existsSync(bodyPath)) {
      rmSync(bodyPath);
      deleted = true;
    }

    return deleted;
  }

  /**
   * Clear all cache entries.
   */
  clear(): number {
    const entries = this.getAllEntries();
    let cleared = 0;

    for (const entry of entries) {
      if (this.deleteByKey(entry.key)) {
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const entries = this.getAllEntries();
    let totalSize = 0;

    for (const entry of entries) {
      try {
        const metaStat = statSync(entry.metaPath);
        totalSize += metaStat.size;
        if (existsSync(entry.bodyPath)) {
          const bodyStat = statSync(entry.bodyPath);
          totalSize += bodyStat.size;
        }
      } catch {
        // Skip if file was deleted
      }
    }

    return {
      entries: entries.length,
      size: totalSize,
    };
  }
}
