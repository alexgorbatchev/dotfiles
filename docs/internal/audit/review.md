---
review_sha: 26ca9327827c3d31255cc97ed0125dad87c4860e
reviewed_at: 2026-08-19T04:50:39Z
created_on: 2026-08-15 01:01
last_modified: 2026-08-19 04:50
status: current
---

# Review Summary

- Findings: critical=1, moderate=2, minor=1
- Coverage: 88.1% Go statement coverage (target: 90%), Dashboard JS/TS 98.7% line coverage (useRepeatedQueryParam.ts at 85.7% funcs)
- Test status: PASS (`just check` passes cleanly, all Go unit tests pass, Go E2E tests pass, Bun test suite passes 221 tests)

# Project Review Runbook

- Last verified at: 2026-08-19T04:50:39Z (26ca9327827c3d31255cc97ed0125dad87c4860e)
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

# Findings by Category

## Correctness Bugs

### [REV-013] [moderate] Bypass of Deferred Resource Cleanup via `os.Exit(1)` in Cobra `whyCmd`

- Location: `cmd/dotfiles/why.go:19`, `cmd/dotfiles/why.go:33`, `cmd/dotfiles/why.go:42`, `cmd/dotfiles/why.go:49` (`whyCmd`)
- Current behavior: `whyCmd` calls `os.Exit(1)` directly when positional arguments are missing or when bootstrap/tool resolution fails unless `isDevTest()` returns true.
- Expected behavior: Cobra `RunE` handlers should return `fmt.Errorf(...)` or errors, allowing Cobra's execution loop to handle error formatting and process exits.
- Why it matters: Calling `os.Exit(1)` inside `RunE` abruptly terminates the process, bypassing deferred cleanup functions (`defer services.DB.Close()`) and leaving open SQLite database handles. It also prevents clean error reporting when calling Cobra commands programmatically.

## Security Issues

No active security issues identified in this review round.

## Project-Specific Policy Violations (always critical)

### [REV-012] [critical] Code Coverage Below Mandatory 90% Project Target

- Location: `cmd/dotfiles` (62.6%), `pkg/installer` (80.4%), `pkg/dashboard` (87.7%), `pkg/downloader` (88.6%), `pkg/registry` (89.8%), `packages/dashboard/src/client/hooks/useRepeatedQueryParam.ts` (85.71% Funcs)
- Current behavior: Overall Go statement coverage across all packages stands at 88.1% (below the mandatory 90% threshold). `cmd/dotfiles` coverage is at 62.6% due to untested paths in `validate.go`, `why.go`, `update.go`, and `generate.go`. On the Dashboard frontend, `bun test --coverage` triggers a coverage threshold failure on `useRepeatedQueryParam.ts` (85.71% function coverage vs 90.0% threshold).
- Policy violated: `AGENTS.md` Shared boundaries section ("Always: maintain a minimum of 90% statement/line coverage across all packages").
- Expected behavior: All Go packages must maintain >= 90% statement coverage, and all TypeScript/JavaScript modules must satisfy the 90% coverage threshold.
- Why it matters: Violates explicit project governance rules in `AGENTS.md` and increases regression risk for un-tested CLI commands and UI hooks.

## Cross-Component Contract Misalignment

### [REV-014] [moderate] Duplicate Tool Lookup Logic in `install` and `uninstall` Commands Omits `BinaryConfig` Types

- Location: `cmd/dotfiles/install.go:35-55`, `cmd/dotfiles/uninstall.go:28-48` (`installCmd`, `uninstallCmd`)
- Declaration site: `pkg/config/config.go:284` (`FindTool`), `pkg/config/config.go:334` (`getBinaryName`)
- Usage site: `cmd/dotfiles/install.go:44-55`, `cmd/dotfiles/uninstall.go:37-48`
- Current behavior: `installCmd` and `uninstallCmd` execute custom inline type-switch loops over `tc.Binaries` that only inspect `string` and `map[string]interface{}` entries. They ignore `BinaryConfig` and `*BinaryConfig` struct types.
- Expected behavior: `installCmd` and `uninstallCmd` should call `config.FindTool(services.ToolConfigs, toolName)`, which uniformly resolves tools by name, suffix, binary string, binary map, `BinaryConfig` struct pointer, or shell alias/function.
- Why it matters: Code duplication across command handlers and contract misalignment with `config.FindTool`. Tools configured with structured `BinaryConfig` instances will fail to resolve in `install` and `uninstall` commands, while resolving correctly in `why` and `pkg/config`.

## Stub Implementations

No stub implementations identified in this review round.

## Unfinished Features

No unfinished features identified in this review round.

## Dead Code

No unreferenced dead code identified in this review round.

## Overlapping Functionality and Responsibility Drift

### [REV-015] [minor] `scripts/release.ts` Uses Stale Property / API Calls for Bun Shell Result

- Location: `scripts/release.ts:68-74` (`executeCommand`)
- Current behavior: `executeCommand` invokes `Bun.$`${args}`.cwd(cwd).env(mergedEnv).quiet().nothrow()` and reads `result.exitCode`.
- Expected behavior: Standardized usage matching project Bun shell patterns.
- Why it matters: Low near-term operational risk, but maintenance drift relative to updated Bun shell type contracts.

## Optimization Opportunities

No hot-path performance bottlenecks identified in this review round.

## File Size and Modularity

Monolithic file refactoring carried out in recent commits successfully decomposed `pkg/orchestrator/orchestrator.go`, `pkg/dashboard/routes.go`, and `pkg/registry/registry.go` into domain-focused submodules (`toposort.go`, `install_pipeline.go`, `generate_pipeline.go`, `shell_scripts.go`, `routes_tools.go`, `routes_stats.go`, `routes_config.go`, `registry_install.go`, `registry_ops.go`). No files currently exceed threshold limits.

## API and Design Gaps (libraries only)

Not applicable (application/CLI toolchain).

# Test Results

- Commands run:
  - `just check` (runs oxfmt, dprint, oxlint, tsgo, `go test ./pkg/... ./cmd/...`, `go test ./tests/e2e/...`)
  - `go test -coverprofile=coverage.out ./pkg/... ./cmd/... && go tool cover -func=coverage.out`
  - `bun test`
- Result: PASS
  - Go unit tests: 25 packages passed cleanly
  - Go E2E test suite: passed cleanly (10.2s)
  - Bun dashboard test suite: 221 tests passed across 22 files (0 fails)

# Test Coverage

- Overall Go statement coverage: **88.1%**
- Target: **90.0%**
- Below-target Go packages:
  - `cmd/dotfiles`: 62.6%
  - `pkg/installer`: 80.4%
  - `pkg/dashboard`: 87.7%
  - `pkg/downloader`: 88.6%
  - `pkg/registry`: 89.8%
- Below-target TypeScript modules:
  - `packages/dashboard/src/client/hooks/useRepeatedQueryParam.ts`: 85.71% Funcs

# Issue Lifecycle (incremental reviews)

- Fixed this round:
  - [REV-002] Global `/tmp` usage in installer scripts eliminated
  - [REV-003] `--overwrite` flag passed to orchestrator context on generate
  - [REV-004] `dotfiles update` without arguments checks all installed tools
  - [REV-005] Dashboard server `handleToolUpdate` resolves latest version before installation
  - [REV-006] Goja VM script evaluation functions consolidated
  - [REV-007] Proxy CONNECT tunnel connection leaks resolved via closed channels
  - [REV-008] Regex import stripping replaced with esbuild transpilation
  - [REV-009] Labeled `binaryLoop:` break statements fixed in `install` and `uninstall` commands
  - [REV-010] Monolithic Go source files decomposed into modular package files
  - [REV-011] Dashboard shared utilities test coverage expanded to 100%
- Still open:
  - [REV-012] Code coverage below mandatory 90% project target (re-opened from REV-001)
  - [REV-013] Bypass of deferred resource cleanup via `os.Exit(1)` in Cobra `whyCmd`
  - [REV-014] Duplicate tool lookup logic in `install` and `uninstall` commands omits `BinaryConfig` types
  - [REV-015] `scripts/release.ts` uses stale property / API calls for Bun shell result
- Partially fixed: None
