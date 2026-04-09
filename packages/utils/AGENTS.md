# @dotfiles/utils

Shared low-level utilities for paths, versions, string formatting, platform resolution, and small CLI helpers.

## Commands

- Focused test: `bun test:native packages/utils/src/__tests__/expandToolConfigPath.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep utilities cohesive and low-level; if logic starts needing package-specific dependencies, it likely belongs elsewhere.
- Path and platform helpers are contract-heavy. Update representative tests whenever you change normalization, expansion, or resolution behavior.

## Local gotchas

- Utility packages attract dumping-ground code. Resist that: add new helpers only when at least one other package clearly benefits.

## Boundaries

- Ask first: changing path normalization, version normalization, or CLI-exit helper semantics.
- Never: slip in package-specific side effects or raw network/file-system policy that belongs in dedicated packages.

## References

- `README.md`
- `src/index.ts`
- `src/resolvePlatformConfig.ts`
- `src/detectVersionViaCli.ts`
- `src/replaceInFile.ts`
