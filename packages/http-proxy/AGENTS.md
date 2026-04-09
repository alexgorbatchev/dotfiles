# @dotfiles/http-proxy

Standalone Bun HTTP cache proxy used during development to avoid upstream rate limits.

## Commands

- Focused test: `bun test:native packages/http-proxy/src/__tests__/createProxyServer.test.ts`
- Proxy dev server: `bun proxy`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep cache storage concerns in `src/ProxyCacheStore.ts`, invalidation in `src/CacheInvalidator.ts`, and HTTP routing in `src/createProxyServer.ts`.
- Mock upstream requests through the `fetchFn` option in tests instead of making live network calls.

## Local gotchas

- This proxy intentionally ignores origin cache headers. Do not 'fix' that behavior unless the development contract changes.

## Boundaries

- Ask first: changing cache key shape, persistence layout, or management endpoints.
- Never: add production-only proxy semantics that fight the dev-cache use case.

## References

- `README.md`
- `src/createProxyServer.ts`
- `src/ProxyCacheStore.ts`
- `src/CacheInvalidator.ts`
