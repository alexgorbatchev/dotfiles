# @dotfiles/symlink-generator

Symlink and copy generation for configuration files declared by tool configs.

## Commands

- Focused test: `bun test:native packages/symlink-generator/src/__tests__/SymlinkGenerator.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- This package owns both symlink and copy flows; keep shared file-generation policy here instead of duplicating it in callers.
- When conflict handling or registry tracking changes, update both `SymlinkGenerator` and `CopyGenerator` tests.

## Local gotchas

- The package name says symlink, but copy behavior is first-class here. Do not forget the copy path when changing file-generation contracts.

## Boundaries

- Ask first: changing overwrite/conflict policy or tracked-file registration behavior.
- Never: hand-roll symlink or copy side effects in generator callers.

## References

- `README.md`
- `src/SymlinkGenerator.ts`
- `src/CopyGenerator.ts`
- `src/__tests__/SymlinkGenerator.test.ts`
