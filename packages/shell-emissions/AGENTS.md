# @dotfiles/shell-emissions

Shell-agnostic emission model, block rendering, and formatter contracts for generated shell content.

## Commands

- Focused test: `bun test:native packages/shell-emissions/src/errors/__tests__/errors.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep this package shell-agnostic. Shell-specific string formatting belongs in formatter consumers such as `packages/shell-init-generator`.
- Preserve pure, deterministic transforms; inputs and rendered block ordering must stay stable for testability.

## Local gotchas

- The abstraction is intentionally generic. If you add shell syntax directly here, you break the package boundary that the generator layer depends on.

## Boundaries

- Ask first: changing core emission types, renderer ordering, or validation errors.
- Never: add runtime dependencies or shell-specific formatting shortcuts here.

## References

- `README.md`
- `src/index.ts`
- `src/types/`
- `src/errors/`
