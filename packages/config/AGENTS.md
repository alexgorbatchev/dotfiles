# @dotfiles/config

Project and tool configuration loading, validation, token substitution, and platform override resolution.

## Commands

- Focused test: `bun test:native packages/config/src/__tests__/config-schema-hosts.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep typed config entrypoints in `src/defineConfig.ts` and loader/runtime concerns in `src/ConfigService.ts` and `src/tsConfigLoader.ts`.
- Schema or token-resolution changes must be covered with fixture-style tests under `src/__tests__/` before touching callers.

## Local gotchas

- Config loading is cross-cutting. Small changes in path expansion or token substitution can break every command, so update narrow tests first and then rerun repo checks.

## Boundaries

- Ask first: changing `defineConfig` behavior, config file shape, or platform override precedence.
- Never: skip colocated schema validation or add backward-compatibility shims for retired config fields.

## References

- `README.md`
- `src/defineConfig.ts`
- `src/ConfigService.ts`
- `src/tsConfigLoader.ts`
