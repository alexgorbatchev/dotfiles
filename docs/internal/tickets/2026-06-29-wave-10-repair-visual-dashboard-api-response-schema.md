---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Repair Visual Dashboard API Response Schema

## Problem

The React/Preact visual dashboard client (`packages/dashboard/src/client/`) connects to several REST API endpoints on the backend server. The `Tools.tsx` and `ToolDetail.tsx` pages expect `/api/tools` to return an array of detailed tool configuration and status objects matching the `IToolDetail` shape. 

The frontend processes these records using nested properties:
```typescript
const installedCount = toolsList.filter((tool) => tool.runtime.status === "installed").length;
```

In Go's native backend server (`pkg/dashboard/routes.go`), the `/api/tools` route handler (`handleGetTools`) currently maps registry rows directly to flat `toolState` structs (which represents `IToolSummary` instead of `IToolDetail`), placing the `Status` field at the root level instead of wrapping it inside `tool.runtime`.

**The Crash:** Because `tool.runtime` is undefined, the Preact client throws a critical JavaScript exception:
`TypeError: Cannot read properties of undefined (reading 'status')`
on startup and renders an entirely blank screen.

## Why this matters

The web dashboard is the main visual interface for users to inspect, trigger, and update their dotfiles installations. Returning mismatched schemas that crash the client makes the entire dashboard non-functional.

## Observed context

- Go files:
  - `pkg/dashboard/routes.go` (contains route handlers for `/api/tools`)
- TS files:
  - `packages/dashboard/src/client/` (React/Preact frontend pages)
  - `packages/dashboard/src/shared/types.gen.ts` (generated shared TypeScript schemas)

## Desired outcome

The Go `/api/tools` backend endpoint is fully updated to construct and return a nested JSON payload that precisely matches the `IToolDetail` typescript contract expected by the dashboard client, fully restoring dashboard operations.

## Acceptance criteria

- [ ] **Define IToolDetail in Go**: Create Go structs in `pkg/dashboard/types.go` or `routes.go` that perfectly match the nested structure of `IToolDetail` (including `runtime: { status: string, error?: string, ... }` and file operations collections).
- [ ] **Align API Output**: Update `handleGetTools` inside `pkg/dashboard/routes.go` to parse database rows, construct these nested structures, and marshal them cleanly to the client.
- [ ] **Purge Stale Dependencies**: Strip out stale `@dotfiles/*` monorepo workspace dependencies from `packages/dashboard/package.json` to allow clean bun compilation of frontend assets.
- [ ] **Unit testing**: Add tests in `pkg/dashboard/routes_test.go` asserting that a GET request to `/api/tools` returns HTTP 200 and a JSON payload containing nested `"runtime"` structures with valid `"status"` fields.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
