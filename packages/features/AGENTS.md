# @dotfiles/features

Higher-level feature services layered on top of the core installer and registry packages.

## Commands

- Focused test: `bun test:native packages/features/src/readme-service/__tests__/ReadmeService.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep each feature in its own subdirectory with its own `log-messages.ts`, types, and tests; `src/readme-service/` is the canonical pattern.
- Use downloader and registry abstractions instead of ad-hoc network or storage calls inside feature services.

## Local gotchas

- Feature services are integration points. If you change caching or README assembly logic, cover both cache and service-level behavior.

## Boundaries

- Ask first: adding a new externally visible feature service or expanding package exports.
- Never: fetch remote content directly when the downloader already models the request path.

## References

- `README.md`
- `src/readme-service/ReadmeService.ts`
- `src/readme-service/ReadmeCache.ts`
- `src/index.ts`
