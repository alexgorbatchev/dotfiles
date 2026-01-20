# @dotfiles/http-proxy Package

## Purpose

Standalone HTTP caching proxy that ignores server cache headers to prevent rate limiting by production APIs.

## Architecture

### Core Components

- **ProxyCacheStore**: File-based cache storage with hash-based keys, stores metadata and binary body separately
- **CacheInvalidator**: Glob-based cache clearing utility
- **createProxyServer**: Bun.serve-based server factory with route handling

### Cache Key Strategy

- Keys are SHA-256 hashes of: `${method}:${url}`
- Files stored as:
  - `<cache-dir>/<first-2-chars>/<hash>.meta.json` - metadata (URL, headers, timestamps)
  - `<cache-dir>/<first-2-chars>/<hash>.body` - raw binary response body

### File Structure

```
src/
  index.ts           # Public exports
  server.ts          # CLI entry point
  types.ts           # Type definitions
  ProxyCacheStore.ts # Cache storage implementation
  CacheInvalidator.ts # Glob-based cache clearing
  createProxyServer.ts # Bun.serve server factory
```

## API Routes

- `POST /cache/clear` - Clear cache entries by glob pattern
- `GET /cache/stats` - Get cache statistics
- `POST /cache/populate` - Pre-populate cache with known responses
- All other requests are proxied to target URL

## Response Headers

- `X-Dotfiles-Cache: HIT` - Response served from cache
- `X-Dotfiles-Cache: MISS` - Response fetched from origin and cached

## Testing Guidelines

- Use `createTestDirectories` for temp directories
- Mock `fetch` for upstream requests via `fetchFn` option
- Test cache hit/miss scenarios
- Test glob pattern matching for invalidation
