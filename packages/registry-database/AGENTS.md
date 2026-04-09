# @dotfiles/registry-database

Shared SQLite connection management for packages that persist registry state.

## Commands

- Package typecheck: `bun --cwd packages/registry-database run typecheck`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep connection lifecycle in `src/RegistryDatabase.ts`; higher-level packages should not own database bootstrapping or directory creation.
- Treat this package as the single access point for registry DB initialization and shutdown.

## Local gotchas

- Connection-management changes can surface as locking or teardown bugs elsewhere, even if this package has little direct logic.

## Boundaries

- Ask first: changing connection lifecycle, path creation, or exported database access patterns.
- Never: scatter standalone `bun:sqlite` initialization across the repo.

## References

- `README.md`
- `src/RegistryDatabase.ts`
- `src/index.ts`
