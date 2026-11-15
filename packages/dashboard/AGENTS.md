# @dotfiles/dashboard

Dashboard Preact client and asset bundler for dotfiles state, health, and usage visualization.

## Commands

- Run all client tests: `just _test bun bun test packages/dashboard`
- Focused client test: `just _test bun bun test packages/dashboard/src/client/__tests__/ToolDetail.test.tsx`
- Dashboard dev server: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`
- Bundle client assets: `bun compile` (runs `go run scripts/build/main.go` from root)
- End-to-end browser verification: `bun packages/dashboard/scripts/verify-dashboard.ts` (requires `agent-browser` CLI)
- If normal browser close fails, verify the unique session name and daemon PID through `session info` before signaling that process; wait for termination and confirm the session is inactive.

## Local conventions

- Preact UI test files must import testing utilities from `src/testing/ui-setup.ts` and call `setupUITests()` at top level. Do not directly import `@testing-library/preact` alongside that helper: its static imports can run before DOM registration completes.
- Adopt UI primitives from `src/client/components/`; keep server-client types synchronized via `src/shared/types.gen.ts` generated during `bun compile`.
- Drift inspection UI (`ToolDriftCard`): displays 3-way synchronization state and visual diffs for declared templates, symlinks, and managed comment blocks within the tool detail view.
- `types.gen.ts` is generated from Go config structs only. REST response shapes are hand-written in `src/shared/types.ts`.
- Install, update and check-for-updates use `useToolActions` from the single `ToolActionsProvider` above the router. Extend the shared `ToolActionButtons` and persistent `OperationStatus`; keep request ownership and results outside route components so navigation cannot discard them. Refresh affected data through `invalidateFetches`, without reloading the page.
- Use `useFetch` with `RequestStateNotice` for dashboard reads. Show empty/not-found only from validated successful data; label retained data as stale after a refresh failure and isolate optional panel failures. Retry through `refetch`. Validators preserve extra fields and match Go omission/nullability; new wire schemas still require approval.
- `App` owns search visibility; `Nav.onSearch` opens the controlled `CommandPalette`. Keep native dialog focus containment and restoration, labelled combobox/listbox semantics, and keyboard shortcuts synchronized with the visible dialog.
- `Nav` displays the CLI release version next to the '⚡ Dotfiles' title using a secondary `Badge` sourced from `/api/config`.
- Home inventory query state uses `q`, `status`, `method`, `root`, and `sort`, preserves unrelated query fields, and passes a validated local `returnTo` through detail navigation. Source metadata failures must not erase the validated inventory or masquerade as zero matching roots.
- Tool detail puts drift, files, and history before native `#source`/`#readme` disclosures. Section hashes reveal collapsed content and preserve query state. Drift is inspection-only: label the available current and desired content, never fabricate a recorded base, and preserve full paths with clipboard failure feedback.
- Settings displays read-only paths from the configuration loaded at startup. Keep multiple tool roots separate and explain that configuration edits require a dashboard restart. Use `CopyButton` for full values with a manual-copy fallback.
- Health leads with failing and warning checks, keeps passing checks in a disclosure, and reports the last completed observation time during rechecks and failures.

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
