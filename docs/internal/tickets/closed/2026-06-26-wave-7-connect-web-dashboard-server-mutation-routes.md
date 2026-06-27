---
created_on: 2026-06-26 17:00
last_modified: 2026-06-27 09:31
status: current
ticket_status: closed
---

# Wave 7: Connect Web Dashboard Server Mutation Routes

## Problem

Go's native dashboard server (`pkg/dashboard/dashboard.go` and `routes.go`) successfully serves built Preact dashboard client bundles from `pkg/dashboard/dist/`. However, its core interactive REST API mutation endpoints are currently non-functional stubs that return mock JSON records:

- `/api/tools/:name/readme`: Returns `# {name} README\nReadme loaded natively in Go`
- `/api/tools/:name/install`: Returns `{"installed": true}` instantly without running anything
- `/api/tools/:name/update`: Returns `{"updated": false}` instantly
- `/api/tools/:name/check-update`: Returns `{"hasUpdate": false}` instantly

If a user opens the dashboard client and clicks "Install" or "Check for Updates", the backend fakes the entire operation, executing no real orchestrator actions.

## Why this matters

The visual dashboard is a core differentiator of the system, enabling non-technical users to inspect and update their dotfiles environment. If the REST API mutation routes are stubs, the dashboard is completely broken for execution purposes.

## Observed context

- Go dashboard backend:
  - `pkg/dashboard/dashboard.go` (serves endpoints)
  - `pkg/dashboard/routes.go` (contains route handlers and mock stubs)
- TS dashboard client:
  - `packages/dashboard/src/client/`

## Desired outcome

The Go dashboard REST API endpoints are fully connected to the Go orchestrator, enabling real-world tool installations, updates, version checks, and log streaming through the web client.

## Acceptance criteria

- [x] **Connect Readme Endpoint**: Update the readme endpoint to parse and return the actual markdown documentation for the requested tool from its `.tool.ts` directory.
- [x] **Connect Install/Update Mutation Endpoints**: Wire the `/install` and `/update` endpoints to the core orchestrator. Trigger a real-time installation background thread when called.
- [x] **Stream Live Progress**: Pipe stdout and stderr execution logs from the orchestrator run directly to the dashboard client (e.g., via Server-Sent Events or WebSockets) to display interactive progress.
- [x] **Unit Testing**: Add integration tests in `pkg/dashboard/dashboard_test.go` asserting that calling the endpoints triggers orchestrator evaluations.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
