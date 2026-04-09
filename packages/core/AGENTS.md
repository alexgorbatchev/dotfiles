# @dotfiles/core

Shared schemas, builder APIs, installer contracts, and plugin registries used throughout the monorepo.

## Commands

- Focused test: `bun test:native packages/core/src/tool-config/shell/__tests__/shellCompletionConfigSchema.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Treat `src/plugins.ts` and the schema/type registries as the contract layer; update module augmentation, schemas, and exported types together.
- Builder-facing APIs live under `src/builder/` and installer contracts under `src/installer/`; keep boundaries explicit instead of merging concerns.

## Local gotchas

- This package is the type backbone for plugin packages. Contract drift here propagates widely, so update dependent tests in the same change.

## Boundaries

- Ask first: changing public types, schema exports, or plugin registration contracts.
- Never: add compatibility aliases for removed contracts or split the canonical exports away from `src/index.ts` without a migration plan.

## References

- `README.md`
- `src/plugins.ts`
- `src/builder/`
- `src/installer/`
- `src/index.ts`
