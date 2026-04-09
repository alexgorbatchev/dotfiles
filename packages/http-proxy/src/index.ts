// Core components
export { CacheInvalidator } from "./CacheInvalidator";
export { createProxyServer } from "./createProxyServer";
export { ProxyCacheStore } from "./ProxyCacheStore";

// Types
export type { IProxyServerOptions } from "./createProxyServer";
export type {
  ICacheClearRequest,
  ICacheClearResult,
  ICacheEntry,
  ICachePopulateRequest,
  ICachePopulateResult,
  ICacheStats,
  ProxyCacheStatus,
  IProxyConfig,
  ProxyServerAddress,
  ProxyServerCallback,
} from "./types";
