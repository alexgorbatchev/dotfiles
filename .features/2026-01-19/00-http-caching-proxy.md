# Task

> Create a standalone HTTP caching proxy script to prevent rate limiting by production APIs

# Primary Objective

Build a standalone HTTP caching proxy that ignores server cache headers and provides an endpoint to selectively clear cache using glob patterns.

# Open Questions

- [x] What libraries to use? → Use `express` and `minimatch` (simpler than apicache/http-proxy-middleware)
- [x] Where should cache be stored by default? → `<cwd>/.tmp/http-proxy-cache/`
- [x] How to configure cache directory? → Via CLI `--cache-dir` argument
- [x] Should proxy integrate with main app? → No, standalone script that can reuse app code if needed

# Tasks

- [x] **TS001**: Research and design the proxy architecture
  - Review express, apicache, http-proxy-middleware APIs
  - Design cache storage structure
  - Design cache invalidation endpoint API
- [x] **TS002**: Create new `packages/http-proxy` package structure
  - Create package.json with dependencies (express, minimatch)
  - Create src/index.ts entry point
- [x] **TS003**: Implement core proxy server
  - Create proxy server that forwards requests to target URLs
  - Implement caching layer that ignores server cache headers
  - Configure file-based cache storage at configurable location
- [x] **TS004**: Implement cache invalidation endpoint
  - Add `POST /cache/clear` endpoint
  - Accept glob patterns to selectively clear cache entries (including `*` for clear all)
  - Return count of cleared entries
- [x] **TS005**: Add CLI interface
  - Parse `--cache-dir` argument for cache location
  - Parse `--port` argument for proxy port
  - Parse `--ttl` argument for cache TTL
  - Default cache to `<cwd>/.tmp/http-proxy-cache/`
- [x] **TS006**: Write comprehensive tests
  - Test proxy forwarding
  - Test caching behavior (ignore server headers)
  - Test cache invalidation with glob patterns
  - Test CLI argument parsing
- [x] **TS007**: Add cache populate endpoint
  - Add `POST /cache/populate` endpoint for pre-populating cache
  - Accept method, url, status, headers, body, ttl
- [x] **TS008**: Add project configuration support for proxy settings
  - Add proxy configuration types to project config (`proxy.enabled`, `proxy.port`, `proxy.cacheDir`, `proxy.ttl`)
  - Document proxy usage in main docs (docs/config.md)

# Acceptance Criteria

- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features (49 tests passing)
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [ ] All changes are checked into source control
- [x] All tests pass
- [x] Proxy runs as standalone script
- [x] Cache ignores server HTTP cache headers
- [x] Cache can be cleared via endpoint using glob patterns
- [x] Cache directory configurable via `--cache-dir`
- [x] Default cache location is `<cwd>/.tmp/http-proxy-cache/`

# Implementation Summary

## Package: `packages/http-proxy`

### Files Created

- `src/types.ts` - Type definitions (ProxyConfig, CacheEntry, CacheClearResult, CachePopulateRequest, etc.)
- `src/ProxyCacheStore.ts` - File-based cache storage using SHA-256 hashed keys
- `src/CacheInvalidator.ts` - Glob pattern-based cache clearing (supports `*` for clear all)
- `src/createProxyServer.ts` - Express server factory with all endpoints
- `src/server.ts` - CLI entry point with argument parsing
- `src/index.ts` - Public exports
- `src/__tests__/*.test.ts` - Comprehensive tests (49 tests)

### API Endpoints

- `POST /cache/clear` - Clear cache entries by glob pattern (use `*` to clear all)
- `POST /cache/populate` - Pre-populate cache entries
- `GET /cache/stats` - Get cache statistics
- `*` - Proxy all other requests

### CLI Options

- `--cache-dir=<path>` - Cache directory (default: `.tmp/http-proxy-cache`)
- `--port=<number>` - Server port (default: 3128)
- `--ttl=<ms>` - Cache TTL in milliseconds (default: 86400000 = 24h)

# Change Log

- Initial task file created
- TS001-TS006: Core implementation complete with 39 tests
- TS007: Added cache populate endpoint with 10 additional tests
- Updated CacheInvalidator to support `*` pattern for clear all
