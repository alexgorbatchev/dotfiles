---
created_on: 2026-06-27 12:00
last_modified: 2026-06-27 12:00
status: current
ticket_status: open
---

# Wave 9: Fix Visual Dashboard API Response Schema and Crashes

## Problem

The visual dashboard server (`pkg/dashboard/dashboard.go` and `routes.go`) serves built Preact client assets natively. However, the backend REST API endpoints suffer from critical schema desynchronization with the legacy Preact frontend, causing the visual dashboard to crash instantly in the browser:

1. **The `/api/tools` Contract Crash**: The Preact UI `Tools.tsx` page fetches `/api/tools` expecting an array of `IToolDetail[]` objects containing a nested `runtime` parameter. It filters them via:
   ```typescript
   const installedCount = toolsList.filter((tool) => tool.runtime.status === "installed").length;
   ```
   But Go's `handleGetTools` returns a flat `toolState` summary slice placing `Status` at the root. Because `tool.runtime` is undefined, the frontend crashes with:
   `TypeError: Cannot read properties of undefined (reading 'status')`
2. **Detail Page Data Collapses**: The detail visualizer `ToolDetail.tsx` queries the `/api/tools` endpoint expecting detailed fields (such as `files` list and `usage` log counters). Because Go's summary endpoint omits these fields, the detail page throws uncaught property errors on undefined objects.
3. **Mock Mutation Stubs**: The endpoints `/api/tools/:name/install` and `/api/tools/:name/update` are completely stubbed, returning `{"installed": true}` or `{"updated": false}` instantly without executing the actual Go orchestrator background tasks.

## Why this matters

The visual dashboard is a core UX component of the dotfiles monorepo. It must serve as a fully functional, reliable control center for monitoring, installing, and updating configurations. A crashing UI and non-functional mock endpoints make the Go-native dashboard completely broken.

## Observed context

- Go files:
  - `pkg/dashboard/routes.go` (contains `handleGetTools`, `handleGetToolDetail`, and mutation handlers)
- TS reference (Preact client in worktree):
  - `.workspaces/main/packages/dashboard/src/client/`
  - `.workspaces/main/packages/dashboard/src/client/pages/Tools.tsx`
  - `.workspaces/main/packages/dashboard/src/client/pages/ToolDetail.tsx`

## Desired outcome

The Go dashboard backend implements 100% contract parity with the legacy Preact dashboard frontend. The `/api/tools` endpoint returns fully detailed, nested `IToolDetail` structs (including a nested `runtime` object, `files` lists, and `usage` summaries) to prevent any frontend crashes. Background installation and update routes are fully connected to Go's orchestrator to execute real configurations on the host system.

## Acceptance criteria

- [ ] **Align JSON Response Shape**: Refactor `handleGetTools` in `pkg/dashboard/routes.go` to output an array of detailed tool records. Each element must contain:
  - `runtime` object containing `status` ("installed" or "not-installed") and `installedVersion` (pointer to string).
  - `files` array of tracked files.
  - `binaryDiskSize` integer field representing disk footprint.
  - `usage` object mapping usage and execution statistics.
- [ ] **Bind Real Orchestrator Tasks**: Connect the `/api/tools/:name/install` and `/api/tools/:name/update` HTTP POST handlers to invoke the actual Go orchestrator (`pkg/orchestrator/orchestrator.go`), streaming the execution output/logs to the client.
- [ ] **Integrate Real Health Inspections**: Connect `/api/health` to perform real registry validations using Go's registry database validation logic and walk directories for unused binary versions, replacing hardcoded stubs.
- [ ] **Integration Testing**: Add a dashboard integration test inside `pkg/dashboard/dashboard_test.go` asserting that GET `/api/tools` returns the correct nested `runtime` schema shape and that trigger requests successfully kick off background Go orchestrator installation jobs.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
