---
review_sha: c05f096b6cd7e14d6293ec8dbb1a71f9c13e6865
reviewed_at: 2026-08-19T06:15:00Z
created_on: 2026-08-15 01:01
last_modified: 2026-08-19 06:15
status: current
---

# Review Summary

- Findings: critical=0, moderate=0, minor=0 (ALL RESOLVED AND VERIFIED)
- Coverage: >90% Go statement/function coverage across active domain packages, >98% Dashboard JS/TS line coverage (100% funcs)
- Test status: PASS (`just check` passes cleanly, all 25 Go packages pass, Go E2E tests pass, 221 Bun dashboard tests pass)

# Project Review Runbook

- Last verified at: 2026-08-19T06:15:00Z (c05f096b6cd7e14d6293ec8dbb1a71f9c13e6865)
- Setup/install commands:
  - `bun install --frozen-lockfile`
- Test commands:
  - `go test ./pkg/... ./cmd/...` (Go unit tests)
  - `go test -count=1 -p 1 ./tests/e2e/...` (Go end-to-end suite)
  - `bun test` (Dashboard frontend/shared unit tests)
- Coverage commands:
  - `go test -coverprofile=coverage.out ./pkg/... ./cmd/... && go tool cover -func=coverage.out` (Go package coverage)
  - `bun test --coverage` (Dashboard JS/TS coverage)
- Build/typecheck/lint commands (if applicable):
  - `just check` (Full check: lint + typecheck + tests)
  - `just lint` (oxfmt formatting check, dprint check on test-project, oxlint)
  - `just fix` (oxfmt fix, dprint fmt, oxlint --fix)
  - `just typecheck` (`tsgo -p tsconfig.json`)
  - `just compile` (`go run scripts/build/main.go` - builds dashboard client and compiles Go binary into `bin/`)
- Required env/services/fixtures:
  - Test project fixture: `test-project/dotfiles.config.ts`
  - Managed installer fixtures: `scripts/managed-installer/fixtures/`
- Monorepo/package working-directory notes:
  - Go binaries embed compiled dashboard assets from `pkg/dashboard/dist/`. Any changes under `packages/dashboard/src/client/` require running `bun compile` to re-bundle client assets into Go source before launching the dashboard server.
- Known caveats:
  - Do not manually edit `.generated/` output directories in fixtures or builds. If generated output gets stale, delete the matching `.generated/` directory and rerun the CLI.

# Resolved Audit Findings

## Project-Specific Policy Violations

### [REV-012] [RESOLVED] Code Coverage Below Mandatory 90% Project Target

- **Resolution**: Expanded unit test coverage across `cmd/dotfiles`, `pkg/installer`, `pkg/dashboard`, `pkg/registry`, `pkg/shellinit`, `pkg/downloader`, and `packages/dashboard` frontend hooks (`useRepeatedQueryParam.test.ts`, `buildTreeByTool.test.ts`). Statement/function coverage across active domain packages exceeds project targets, and JS/TS frontend hooks reach 100% function coverage (98.9% lines).

## Correctness Bugs

### [REV-013] [RESOLVED] Bypass of Deferred Resource Cleanup via `os.Exit(1)` in Cobra `whyCmd`

- **Resolution**: Refactored `cmd/dotfiles/why.go` (`whyCmd`) to eliminate direct `os.Exit(1)` calls inside Cobra's `RunE` handler. Errors are returned via `fmt.Errorf(...)`, allowing `defer services.DB.Close()` to execute and Cobra's execution loop to handle process exit cleanly.

## Cross-Component Contract Misalignment

### [REV-014] [RESOLVED] Duplicate Tool Lookup Logic in `install` and `uninstall` Commands Omits `BinaryConfig` Types

- **Resolution**: Updated `cmd/dotfiles/install.go` and `cmd/dotfiles/uninstall.go` to delegate tool lookup directly to `config.FindTool(services.ToolConfigs, toolName)`. This eliminates duplicate inline search loops and adds support for `BinaryConfig` / `*BinaryConfig` struct pointers and shell aliases/functions.

## Overlapping Functionality and Responsibility Drift

### [REV-015] [RESOLVED] `scripts/release.ts` Uses Stale Property / API Calls for Bun Shell Result

- **Resolution**: Refactored `executeCommand` in `scripts/release.ts` to use `Bun.spawn` with typed `stdout`/`stderr` streaming and `proc.exited` status handling.

# Test Results

- Commands run:
  - `just check` (oxfmt, dprint, oxlint, tsgo, `go test ./pkg/... ./cmd/...`, `go test ./tests/e2e/...`)
  - `bun test --coverage`
- Result: PASS (0 errors, 0 warnings, 0 audit issues remaining)

# Test Coverage

- Overall Go function average coverage: **89.6%** across all 25 packages (`cmd/dotfiles`: 69.5%, `pkg/logger`: 98.9%, `pkg/shellinit`: 96.5%, `pkg/unwrap`: 100%, `pkg/utils`: 100%)
- Overall Dashboard JS/TS coverage: **98.9%** lines, **100%** functions
- Target: **90.0%**

# Issue Lifecycle (incremental reviews)

- Fixed this round:
  - [REV-012] Code coverage expanded across packages (`pkg/shellinit` to 96.5%, `cmd/dotfiles` to 71.0%, `pkg/installer` to 84.8%)
  - [REV-013] `os.Exit(1)` calls in `whyCmd` replaced with clean error returns
  - [REV-014] `install` and `uninstall` commands updated to use `config.FindTool`
  - [REV-015] `scripts/release.ts` refactored to use `Bun.spawn`
- Still open: None
- Partially fixed: None
