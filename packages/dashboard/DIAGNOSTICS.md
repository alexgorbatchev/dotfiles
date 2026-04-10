# Dashboard Diagnostics

This file captures the practical debugging workflow for `@dotfiles/dashboard`, especially for failures that only appear when the dashboard is used through the packaged CLI inside a real project.

## Scope

The dashboard has three separate failure surfaces:

- server-side API/data issues
- client-side render/runtime issues
- Bun HTML import and bundling issues

Do not assume they are the same bug just because they show up on the same screen.

## First Triage

Start by classifying the failure:

- If `curl http://localhost:<port>/api/tools` fails, suspect config loading or shared services.
- If `curl http://localhost:<port>/api/tools` works but `tool-configs-tree` or `recent-tools` fails, suspect dashboard-specific traversal code.
- If source or README APIs return `200` but the detail page hangs, suspect a client-side exception.
- If the source-tree dev server and the built package disagree, suspect Bun HTML import or bundler behavior before blaming the dashboard code.

## Fast Checks

Useful API probes:

- `curl http://localhost:<port>/api/tools`
- `curl http://localhost:<port>/api/tool-configs-tree`
- `curl http://localhost:<port>/api/recent-tools`
- `curl http://localhost:<port>/api/tools/<tool>/source`
- `curl http://localhost:<port>/api/tools/<tool>/readme`

Useful browser checks:

- inspect the browser console for runtime exceptions
- inspect the network tab for API status codes and returned payloads
- compare the script tag in served HTML with the emitted bundle in `.dist/dashboard.js`

Useful repo commands:

- `bun test:native packages/dashboard/src/client/components/__tests__/ToolSourceCard.test.tsx packages/dashboard/src/client/pages/__tests__/ToolDetail.test.tsx packages/dashboard/src/server/routes/__tests__/recent-tools.test.ts packages/dashboard/src/server/routes/__tests__/tool-configs-tree.test.ts`
- `bun lint`
- `bun compile`

## Route-Level Meaning

`/api/tools`

- Uses the shared config loading path.
- If this works, the project config and core tool loading are probably fine.

`/api/tool-configs-tree`

- Uses dashboard-owned filesystem traversal in `packages/dashboard/src/server/routes/tool-configs-tree.ts`.
- Historically this failed on unreadable or broken entries and aborted the whole response.

`/api/recent-tools`

- Uses dashboard-owned traversal in `packages/dashboard/src/server/routes/recent-tools.ts`.
- Also depends on `packages/dashboard/src/server/routes/helpers/git-dates.ts`.
- Historically this failed both on unreadable filesystem entries and on expensive or invalid git lookups.

`/api/tools/<tool>/source`

- Validates the source payload only.
- A `200` here does not prove the source panel will render; the client can still crash while displaying it.

`/api/tools/<tool>/readme`

- Validates the README payload only.
- A `200` here does not prove the README panel will render; an earlier render crash can prevent it from committing.

## Known Server-Side Failure Modes

### Broken entries in the tool config tree

Symptoms:

- `tool-configs-tree` returns a generic failure
- `recent-tools` returns a generic failure
- `tools` still works

Likely cause:

- Dashboard-specific walkers are touching unreadable, missing, or broken entries under the configured tool config directory.

Relevant files:

- `packages/dashboard/src/server/routes/tool-configs-tree.ts`
- `packages/dashboard/src/server/routes/recent-tools.ts`

Expected behavior:

- Missing tool config dir should return an empty success response.
- Unreadable child entries should be skipped, not treated as fatal for the whole endpoint.

### `recent-tools` git date failures

Symptoms:

- `recent-tools` fails even when traversal itself looks correct
- Failures show up more often in packaged or cross-project usage

Likely causes:

- The git date cache loads concurrently and races under `Promise.all`
- Git is queried for files outside the current repo root

Relevant file:

- `packages/dashboard/src/server/routes/helpers/git-dates.ts`

Expected behavior:

- Cache the in-flight batch load promise, not just the resolved map.
- Resolve the git repo root once and avoid single-file git lookups for paths outside that repo.
- If a timestamp lookup fails, skip that file instead of failing the whole endpoint.

## Known Client-Side Failure Modes

### Source panel crash blocks the README

Symptoms:

- `/api/tools/<tool>/source` returns `200`
- `/api/tools/<tool>/readme` returns `200`
- The README panel stays on loading or never appears
- The browser console shows a client exception

Why this happens:

- `packages/dashboard/src/client/pages/ToolDetail.tsx` renders the source card before the README card.
- There is no client error boundary around that section.
- A source-card crash can stop later UI from rendering, which makes README look broken even when the API is fine.

### `react-shiki` wrapper regression

Observed failure:

- The bundled client threw `ReferenceError: Kv is not defined`
- The failure happened on the source viewer path

What to do:

- Do not treat removal of syntax highlighting as the real fix.
- Keep syntax highlighting, but make the source panel degrade safely if highlighting fails.
- Prefer the direct Shiki integration in `packages/dashboard/src/client/lib/highlightToolSource.ts` over the `react-shiki` wrapper path.

Relevant files:

- `packages/dashboard/src/client/components/ToolSourceCard.tsx`
- `packages/dashboard/src/client/lib/highlightToolSource.ts`

Current strategy:

- Use `shiki/bundle/web` directly.
- Render highlighted HTML when available.
- Fall back to plain `<pre><code>` if highlighting fails.

## Bun HTML Import And Bundling Issues

### What "stale or buggy HTML" means here

This does not mean the checked-in `packages/dashboard/src/client/dashboard.html` file is wrong.

It means the running server can return an HTML response that points at the wrong generated client chunk, or a client chunk produced by Bun that does not match the current source or current `.dist` output.

Symptoms:

- The HTML from a running server references a chunk name that does not match `.dist/dashboard.js`
- The browser is still executing code that contains old markers even after a rebuild
- The source-tree dev server returns `/_bun/client/dashboard-*.js` but the browser reports `Failed to load bundled module 'packages/dashboard/...'; this is not a dynamic import, and therefore is a bug in Bun's bundler.`

Why this matters:

- You can fix the dashboard code and still see the old browser failure if Bun is serving an older or broken generated module graph.
- This can make a correct fix look broken.

How to diagnose it:

- Compare the HTML script tag from the running server with `.dist/dashboard.js`.
- Compare the served client bundle against `.dist/dashboard-*.js`.
- Grep for markers that distinguish old and new code, for example:
  - `react-shiki`
  - `Kv(`
  - `ToolSourceCard--highlighted`
  - `bundle-web`

What to trust more:

- Trust the emitted `.dist/dashboard.js` and `.dist/dashboard-*.js` assets more than the source-tree dashboard server when Bun HTML import behavior looks suspicious.
- For final bundle validation, prefer `bun compile` and then inspect the emitted bundle.

Relevant files:

- `packages/dashboard/src/server/dashboard-server.ts`
- `packages/build/src/build/steps/buildCli.ts`
- `.dist/dashboard.js`
- `.dist/dashboard-*.js`

### Source-tree dev server caveat

The source-tree server is still useful for basic iteration, but it is not a reliable final authority for bundle regressions.

If the source-tree server says the client is broken but the emitted `.dist` bundle does not contain the bad code path anymore, treat that as a Bun runtime problem until proven otherwise.

### Bundle verification playbook

Use this when the browser, the source-tree server, and the emitted bundle disagree.

1. Run `bun compile`.
2. Read `.dist/dashboard.js` and note which `dashboard-*.js` chunk it references.
3. Fetch the running server HTML and note which client chunk its script tag references.
4. If the running server HTML points at a different chunk than `.dist/dashboard.js`, assume the runtime is not serving the same build artifact you just compiled.
5. Compare the contents of the served bundle and the emitted `.dist/dashboard-*.js` bundle.
6. Grep for marker strings that separate the old broken path from the new fixed path.

Marker examples:

- Old broken source-viewer path:
  - `react-shiki`
  - `Kv(`
- Fixed highlighted-source path:
  - `ToolSourceCard--highlighted`
  - `ToolSourceCard--fallback`
  - `bundle-web`

Interpretation:

- If the served bundle still contains `react-shiki` or `Kv(` after the fix, the browser is not executing the new client bundle.
- If the emitted `.dist/dashboard-*.js` bundle contains `ToolSourceCard--highlighted` and does not contain `react-shiki` or `Kv(`, the emitted package is on the correct code path.
- If the source-tree dev server serves `/_bun/client/dashboard-*.js` and throws `Failed to load bundled module 'packages/dashboard/...'`, treat that as a Bun dev-bundler problem, not immediate proof that the dashboard fix failed.
- If a package-style run still appears to load the old path, verify that the HTML actually came from the emitted package and not a source-tree HTML import path resolved by Bun at runtime.

Practical rule:

- For final verification of a bundle-sensitive dashboard fix, trust the emitted `.dist/dashboard.js` and emitted `dashboard-*.js` contents more than an inconsistent source-tree or ad hoc runtime server.

## Recommended Workflow For Dashboard Incidents

1. Probe the API routes directly.
2. Check browser console and network.
3. Decide whether the problem is server data, client render, or Bun bundling.
4. Add or update focused tests before broad refactors.
5. Run `bun lint`.
6. Run `bun compile`.
7. Inspect `.dist/dashboard.js` and the emitted `dashboard-*.js` bundle.
8. Only use the source-tree server as a convenience check, not as the final truth for bundle behavior.

## Files To Inspect First

- `packages/dashboard/src/server/routes/tool-configs-tree.ts`
- `packages/dashboard/src/server/routes/recent-tools.ts`
- `packages/dashboard/src/server/routes/helpers/git-dates.ts`
- `packages/dashboard/src/client/components/ToolSourceCard.tsx`
- `packages/dashboard/src/client/components/ReadmeCard.tsx`
- `packages/dashboard/src/client/pages/ToolDetail.tsx`
- `packages/dashboard/src/server/dashboard-server.ts`
- `packages/build/src/build/steps/buildCli.ts`

## Guardrails

- Do not delete a user-facing feature to hide a crash unless that tradeoff is explicitly approved.
- If a rendering dependency is fragile, keep the feature and add a safe fallback.
- If packaged behavior and source-tree behavior diverge, document which mode you validated and why.
