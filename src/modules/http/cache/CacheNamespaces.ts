import { z } from 'zod';

export const cacheNamespaceSchema = z.object({
  name: z.string(),
  ttlMs: z.number().int().nonnegative(),
  varyByAuthStrategy: z.enum(['always', 'never', 'auto']),
  cacheable: z.boolean(),
  notes: z.string(),
});

const cacheNamespaceRegistrySchema = z.array(cacheNamespaceSchema).nonempty();

const rawCacheNamespaceRegistry = [
  {
    name: 'github.releaseMeta',
    ttlMs: 10 * 60 * 1000,
    varyByAuthStrategy: 'always',
    cacheable: true,
    notes: 'Specific release manifest JSON',
  },
  {
    name: 'github.assetList',
    ttlMs: 10 * 60 * 1000,
    varyByAuthStrategy: 'always',
    cacheable: true,
    notes: 'Release assets list',
  },
  {
    name: 'github.rateLimit',
    ttlMs: 60 * 1000,
    varyByAuthStrategy: 'always',
    cacheable: true,
    notes: 'Rate limit snapshot',
  },
  {
    name: 'github.userContent',
    ttlMs: 24 * 60 * 60 * 1000,
    varyByAuthStrategy: 'never',
    cacheable: true,
    notes: 'Resolved redirect / user content indirection',
  },
  {
    name: 'crates.metadata',
    ttlMs: 30 * 60 * 1000,
    varyByAuthStrategy: 'never',
    cacheable: true,
    notes: 'crates.io crate metadata (versions/dist)',
  },
  {
    name: 'default',
    ttlMs: 5 * 60 * 1000,
    varyByAuthStrategy: 'auto',
    cacheable: true,
    notes: 'Fallback JSON/text',
  },
  {
    name: 'binary.download',
    ttlMs: 0,
    varyByAuthStrategy: 'never',
    cacheable: false,
    notes: 'Large binary/script bodies (not cached)',
  },
] as const;

export const CACHE_NAMESPACE_REGISTRY = cacheNamespaceRegistrySchema.parse(rawCacheNamespaceRegistry);

export type HttpCacheNamespace = (typeof CACHE_NAMESPACE_REGISTRY)[number]['name'];

export type CacheNamespaceConfig = (typeof CACHE_NAMESPACE_REGISTRY)[number];

export function getCacheNamespaceConfig(name: HttpCacheNamespace): CacheNamespaceConfig {
  const config = CACHE_NAMESPACE_REGISTRY.find((entry) => entry.name === name);
  if (!config) {
    throw new Error(`Http cache namespace not registered: ${name}`);
  }
  return config;
}
