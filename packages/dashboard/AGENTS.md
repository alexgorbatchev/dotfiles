# @dotfiles/dashboard

Dashboard server and Preact client for browsing tool state, health, and usage data.

## Commands

- Focused test: `bun test:native packages/dashboard/src/client/pages/__tests__/ToolDetail.test.tsx`
- Dashboard dev server: `bun dashboard`
- Build validation after dependency changes: `bun compile`

## Local conventions

- UI tests must import `src/testing/ui-setup.ts` first and call `setupUITests()` at the top level of each test file.
- Adopt UI primitives from the `shadcn-preact` patterns already used in `src/client/components/`; keep server types shared through `src/shared/`.

## Local gotchas

- Dashboard dependency changes can break Bun HTML bundling even when local tests pass. Always rerun `bun compile` after changing dashboard dependencies.

## Boundaries

- Ask first: changing API response shapes shared with the CLI or build pipeline.
- Never: import testing-library before `ui-setup.ts` or bypass the shared server/client types.

## References

- `README.md`
- `src/testing/ui-setup.ts`
- `src/client/`
- `src/server/`
- `src/shared/types.ts`
