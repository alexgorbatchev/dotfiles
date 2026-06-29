---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Implement Full Hook Lifecycle Execution in Go Orchestrator

## Problem

The TypeScript installer implements a robust, multi-stage lifecycle hook system that triggers custom commands or JS/TS scripts inside the virtual context at crucial points during download, extraction, and installation:
1. `before-install`
2. `after-download`
3. `after-extract`
4. `after-install`

These are triggered contextually inside each installer plugin (for instance, `cargo` runs `after-download` hooks immediately after fetching, and `after-extract` before binary promotion).

However, Go's orchestrator **only supports `after-install` hooks** (implemented globally in `Orchestrator.InstallTool`). It completely ignores the `before-install`, `after-download`, and `after-extract` hooks. Individual Go installer files (like `cargo.go`, `dmg.go`, `pkg.go`, and `curl_script.go`) do not perform any hook execution calls whatsoever.

## Why this matters

Many advanced `.tool.ts` configurations rely on editing or preparing extracted files (such as patching config files, compiling assets, or updating configuration headers via `after-extract` hooks) before binaries are promoted or symlinked. By ignoring these hooks, installations will complete but produce un-configured or broken binaries on disk.

## Observed context

- Go files:
  - `pkg/orchestrator/orchestrator.go` (only implements `after-install` global hook trigger)
  - `pkg/installer/` (all plugins miss hook execution points)
- TS files:
  - `packages/installer/src/Installer.ts` (defines and dispatches all four hook types)
  - `packages/installer-cargo/src/installFromCargo.ts` (demonstrates stage-specific hooks)

## Desired outcome

The Go orchestrator and all relevant download-and-extract-based installer plugins correctly dispatch and execute all four lifecycle hooks (`before-install`, `after-download`, `after-extract`, and `after-install`) at their respective execution boundaries.

## Acceptance criteria

- [ ] **Define Full Hook Lifecycle in Go**: Extend the hook-execution capability in Go to support `before-install`, `after-download`, `after-extract`, and `after-install` hooks.
- [ ] **Dispatch Hooks Contextually**:
  - Run `before-install` before any installer-specific setup runs.
  - Run `after-download` inside relevant installers (such as `curl_binary`, `curl_tar`, `cargo`) immediately after downloading the artifact but before extraction.
  - Run `after-extract` immediately after extracting the downloaded archive but before moving, symlinking, or promoting binaries.
  - Maintain the global `after-install` execution flow.
- [ ] **Provide Correct Context**: Ensure that when executing hooks, the VM environment has access to the correct dynamic paths (`stagingDir`, `tempDir`, etc.) corresponding to that tool's installation transaction.
- [ ] **Unit testing**: Add or update E2E integration tests in `tests/e2e/hook_test.go` asserting that all four hook phases trigger in the correct sequence and write tracking files successfully.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
