export type ProxyCacheStatus = "HIT" | "MISS";
export type ProxyServerCallback = () => void;
export type ProxyServerAddress = { port: number };

/**
 * Configuration options for the HTTP caching proxy.
 */
export interface ProxyConfig {
  /** Directory for cache storage. Default: `.tmp/http-proxy-cache` */
  cacheDir: string;
  /** Proxy server port. Default: 3128 */
  port: number;
  /** Cache TTL in milliseconds. Default: 24 hours */
  ttl: number;
}

/**
 * Cached response entry stored on disk.
 * Body is stored separately as raw binary file.
 */
export interface CacheEntry {
  /** Original request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Result from cache clearing operation.
 */
export interface CacheClearResult {
  /** Number of entries cleared */
  cleared: number;
  /** Descriptive message */
  message: string;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Number of cache entries */
  entries: number;
  /** Total cache size in bytes */
  size: number;
}

/**
 * Request body for cache clear endpoint.
 */
export interface CacheClearRequest {
  /** Single glob pattern to match. Use "*" to clear all. */
  pattern?: string;
  /** Multiple glob patterns to match */
  patterns?: string[];
}

/**
 * Request body for cache populate endpoint.
 */
export interface CachePopulateRequest {
  /** HTTP method (defaults to GET) */
  method?: string;
  /** URL to cache the response for */
  url: string;
  /** HTTP status code (defaults to 200) */
  status?: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body as string or base64 */
  body: string;
  /** Whether body is base64 encoded (defaults to false) */
  bodyIsBase64?: boolean;
  /** TTL in milliseconds (optional, uses default if not specified) */
  ttl?: number;
}

/**
 * Result from cache populate operation.
 */
export interface CachePopulateResult {
  /** Whether the entry was successfully added */
  success: boolean;
  /** Cache key for the entry */
  key: string;
  /** URL that was cached */
  url: string;
  /** Descriptive message */
  message: string;
}
