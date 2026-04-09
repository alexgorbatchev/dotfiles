# @dotfiles/downloader

Download orchestration, cache-aware fetch strategies, and progress reporting for remote assets.

## Commands

- Focused test: `bun test:native packages/downloader/__tests__/Downloader.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep download orchestration in the top-level package and cache-specific logic under `cache/`.
- Mock network behavior with `FetchMockHelper` and package tests before changing retry, timeout, or cache semantics.

## Local gotchas

- Downloader behavior affects every remote installer. Timeout, retry, or cache changes must be exercised through both direct downloader tests and at least one installer integration path.

## Boundaries

- Ask first: changing cache keys, retry policy defaults, or progress/output behavior.
- Never: call raw `fetch` from installer code when the downloader should own the request.

## References

- `README.md`
- `__tests__/Downloader.test.ts`
- `cache/`
- `index.ts`
