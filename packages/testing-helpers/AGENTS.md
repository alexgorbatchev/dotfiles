# @dotfiles/testing-helpers

Shared test fixtures, fetch mocks, matchers, and custom oxlint test rules used across the monorepo.

## Commands

- Focused test: `bun test:native packages/testing-helpers/src/matchers/__tests__/toMatchLooseInlineSnapshot.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Add reusable helpers here only after confirming the behavior is shared across packages; `createTestDirectories`, `FetchMockHelper`, and the matcher utilities are the canonical patterns.
- Keep custom oxlint rules and their tests under `src/oxlint/`; new testing-policy checks belong there, not as ad-hoc README guidance.

## Local gotchas

- Changing a helper here can destabilize many packages at once. Prefer additive changes and update representative downstream tests when behavior shifts.

## Boundaries

- Ask first: changing matcher semantics, shared fixture contracts, or custom oxlint rule behavior.
- Never: duplicate helper behavior in package tests when the shared helper can be extended safely.

## References

- `README.md`
- `src/createTestDirectories.ts`
- `src/FetchMockHelper.ts`
- `src/oxlint/`
- `src/matchers/toMatchLooseInlineSnapshot.ts`
