// Core components
export { CacheInvalidator } from "./CacheInvalidator";
export { createProxyServer } from "./createProxyServer";
export { ProxyCacheStore } from "./ProxyCacheStore";

// Types
export type { ProxyServerOptions } from "./createProxyServer";
export type {
  CacheClearRequest,
  CacheClearResult,
  CacheEntry,
  CachePopulateRequest,
  CachePopulateResult,
  CacheStats,
  ProxyCacheStatus,
  ProxyConfig,
  ProxyServerAddress,
  ProxyServerCallback,
} from "./types";
