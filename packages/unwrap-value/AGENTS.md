# @dotfiles/unwrap-value

Pure helper for resolving static, sync, and async values through a single `Resolvable` contract.

## Commands

- Focused test: `bun test:native packages/unwrap-value/src/__tests__/resolveValue.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep the package small and pure: `src/types.ts` defines the contract and `src/resolveValue.ts` implements it.
- If you expand the value model, preserve the sync/async call signatures used by builder and config code.

## Local gotchas

- This utility looks trivial, but its generic types flow into author-facing APIs. Type regressions matter more than implementation size suggests.

## Boundaries

- Ask first: changing `Resolvable` typing or promise-resolution semantics.
- Never: add side effects, logging, or package-specific policy here.

## References

- `README.md`
- `src/types.ts`
- `src/resolveValue.ts`
- `src/index.ts`
