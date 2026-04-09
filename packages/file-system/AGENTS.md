# @dotfiles/file-system

Canonical file-system abstractions and implementations for real, in-memory, and resolved-path access.

## Commands

- Focused test: `bun test:native packages/file-system/src/__tests__/MemFileSystem.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- This is the package that owns real file-system access. New file operations elsewhere should extend these abstractions instead of reaching for `node:fs`.
- Keep production, memory, and resolved-path behaviors aligned by updating the corresponding tests under `src/__tests__/` together.

## Local gotchas

- Path expansion and resolved-path behavior are policy, not implementation detail. If you change them here, audit every caller that contracts or expands home paths.

## Boundaries

- Ask first: changing interface methods or tilde-expansion semantics.
- Never: introduce direct `node:fs` usage outside this package to work around missing abstractions.

## References

- `README.md`
- `src/IFileSystem.ts`
- `src/NodeFileSystem.ts`
- `src/MemFileSystem.ts`
- `src/__tests__/tilde-expansion-guardrails.test.ts`
