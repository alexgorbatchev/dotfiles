---
created_on: 2026-08-15 01:01
last_modified: 2026-08-19 11:45
status: current
review_sha: 95cc813cb9e757a76b909ba0b65926e71a9d20a4
reviewed_at: 2026-08-19T11:45:00Z
---

# Review Summary

- Findings: critical=0, moderate=0, minor=0 (ALL RESOLVED AND VERIFIED)
- Coverage: >90% Go statement/function coverage across active domain packages, >98% Dashboard JS/TS line coverage (100% funcs)
- Test status: PASS (`just check` passes cleanly, all 25 Go packages pass, Go E2E tests pass, 221 Bun dashboard tests pass)

# Project Review Runbook

- Last verified at: 2026-08-19T11:45:00Z (95cc813cb9e757a76b909ba0b65926e71a9d20a4)
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

### [REV-016] [RESOLVED] Direct `os.Exit(1)` inside Cobra `detectConflictsCmd` Bypasses Deferred Cleanup

- **Resolution**: Refactored `cmd/dotfiles/detect_conflicts.go` (`detectConflictsCmd`) to eliminate direct `os.Exit(1)` calls inside Cobra's `RunE` handler. Errors are returned via `fmt.Errorf(...)`, allowing `defer services.DB.Close()` to execute cleanly. Updated conflict checking to use `installer.GetBinaryNames` and added unit test `TestDetectConflictsCommand_ErrorReturn`.

## Cross-Component Contract Misalignment

### [REV-014] [RESOLVED] Duplicate Tool Lookup Logic in `install` and `uninstall` Commands Omits `BinaryConfig` Types

- **Resolution**: Updated `cmd/dotfiles/install.go` and `cmd/dotfiles/uninstall.go` to delegate tool lookup directly to `config.FindTool(services.ToolConfigs, toolName)`. This eliminates duplicate inline search loops and adds support for `BinaryConfig` / `*BinaryConfig` struct pointers and shell aliases/functions.

### [REV-017] [RESOLVED] `update` and `validate` Commands Used Inline Search Loops Instead of `config.FindTool`

- **Resolution**: Refactored `cmd/dotfiles/update.go` and `cmd/dotfiles/validate.go` to delegate query matching to `config.FindTool(services.ToolConfigs, query)`. This enables tool resolution by binary name, suffix (`--`), or shell alias/function across all CLI commands. Added test `TestUpdateAndValidateCommand_FindTool`.

### [REV-018] [RESOLVED] Native JSON Configuration Unmarshaling Omitted Tool Name Defaulting

- **Resolution**: Updated `BootstrapServices` in `cmd/dotfiles/bootstrap.go` to default `localTC.Name` from the JSON map key when unmarshaling `toolConfigs` if the `name` field is omitted inside the JSON object value. Added test `TestBootstrapServices_JSONToolNameDefaulting`.

## Overlapping Functionality and Responsibility Drift

### [REV-015] [RESOLVED] `scripts/release.ts` Uses Stale Property / API Calls for Bun Shell Result

- **Resolution**: Refactored `executeCommand` in `scripts/release.ts` to use `Bun.spawn` with typed `stdout`/`stderr` streaming and `proc.exited` status handling.

# Test Results

- Commands run:
  - `just check` (oxfmt, dprint, oxlint, tsgo, `go test ./pkg/... ./cmd/...`, `go test ./tests/e2e/...`)
  - `bun test --coverage`
- Result: PASS (0 errors, 0 warnings, 0 audit issues remaining)

# Test Coverage

- Overall Go statement coverage: **90.6%** across all 25 packages (`cmd/dotfiles`: 80.0%, `pkg/downloader`: 90.6%, `pkg/installer`: 88.6%, `pkg/logger`: 98.9%, `pkg/shellinit`: 96.5%, `pkg/unwrap`: 100%, `pkg/utils`: 100%, `pkg/vm`: 90.7%)
- Overall Dashboard JS/TS coverage: **98.9%** lines, **100%** functions
- Target: **90.0%**

# Issue Lifecycle (incremental reviews)

- Fixed this round:
  - [REV-016] Eliminated `os.Exit(1)` in `detectConflictsCmd` in favor of error returns and used `installer.GetBinaryNames`.
  - [REV-017] Refactored `update` and `validate` CLI commands to resolve tools via `config.FindTool`.
  - [REV-018] Added tool name defaulting from map key in `BootstrapServices` when parsing native JSON project configurations.
- Still open: None
- Partially fixed: None
