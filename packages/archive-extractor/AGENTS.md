# @dotfiles/archive-extractor

Archive extraction utilities for installer flows that unpack tarballs, zips, and related archive formats.

## Commands

- Focused test: `bun test:native packages/archive-extractor/src/__tests__/isSupportedArchiveFile.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep archive detection in `src/isSupportedArchiveFile.ts` and extraction orchestration in `src/ArchiveExtractor.ts`.
- Inject `Shell` and file-system dependencies; do not introduce direct process or file-system globals here.

## Local gotchas

- Extraction behavior feeds installer plugins directly. When supported extensions or executable detection changes, update installer-facing tests too.

## Boundaries

- Ask first: adding a new archive format or changing extracted file selection rules.
- Never: bypass the shared shell abstraction or add `console.*` diagnostics.

## References

- `README.md`
- `src/ArchiveExtractor.ts`
- `src/IArchiveExtractor.ts`
