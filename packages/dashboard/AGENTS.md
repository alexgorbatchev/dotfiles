# @dotfiles/dashboard

Dashboard Preact client and asset bundler for dotfiles state, health, and usage visualization.

## Commands

- Run all client tests: `bun test packages/dashboard`
- Focused client test: `bun test packages/dashboard/src/client/__tests__/ToolDetail.test.tsx`
- Dashboard dev server: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`
- Bundle client assets: `bun compile` (runs `go run scripts/build/main.go` from root)
- End-to-end browser verification: `bun packages/dashboard/scripts/verify-dashboard.ts` (requires `agent-browser` CLI)

## Local conventions

- Preact UI test files must import `src/testing/ui-setup.ts` first and call `setupUITests()` at top level.
- Adopt UI primitives from `src/client/components/`; keep server-client types synchronized via `src/shared/types.gen.ts` generated during `bun compile`.
- Drift inspection UI (`ToolDriftCard`): displays 3-way synchronization state and visual diffs for declared templates, symlinks, and managed comment blocks within the tool detail view.
- `types.gen.ts` is generated from Go config structs only. REST response shapes are hand-written in `src/shared/types.ts`.
- Install, update and check-for-updates run through the `useToolActions` hook and render through `ToolActionButtons`. Views differ only by the `size` prop, so extend the shared component rather than adding per-view buttons, and keep one hook instance per page so the result banner sees every action.
- `Nav` displays the CLI release version next to the '⚡ Dotfiles' title using a secondary `Badge` sourced from `/api/config`.

## Local gotchas

- **No heavy client ESM dependencies in package.json:** Heavy parsing libraries (`shiki`, `marked`, `dompurify`) are loaded via `<script>` CDN tags in `dashboard.html`. Do NOT add heavy client ESM libraries to `package.json` due to a Bun HTML bundler minifier variable name collision bug (e.g. `Ev is not defined`).
- **Recompile before running server:** Go embeds compiled client assets from `pkg/dashboard/dist/`. Any change to client files requires running `bun compile` from root to refresh embedded assets.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Ask first: changing API response schema shapes or types shared between Go server and TypeScript client (`src/shared/`).
- Never: import `@testing-library/preact` before `ui-setup.ts`; add heavy ESM client parsing libraries to `package.json`.

## References

- UI Test setup: `packages/dashboard/src/testing/ui-setup.ts`
- Verification script: `packages/dashboard/scripts/verify-dashboard.ts`
- Diagnostics & known issues: `packages/dashboard/DIAGNOSTICS.md`
- Generated types: `packages/dashboard/src/shared/types.gen.ts`
