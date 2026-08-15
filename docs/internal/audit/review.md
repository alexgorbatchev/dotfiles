---
review_sha: c19404bf55596ee9dd64a2748b862005e417facc
reviewed_at: 2026-08-15T01:01:39Z
---

# Review Summary

- Findings: critical=2, moderate=6, minor=3
- Coverage: 85.1% total Go statement coverage (target: 90%), 90.8% Dashboard JS line coverage
- Test status: PASS (Go unit tests pass, Go E2E tests pass, Bun dashboard unit tests pass)

# Project Review Runbook

- Last verified at: 2026-08-15T01:01:39Z (c19404bf55596ee9dd64a2748b862005e417facc)
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
  - `DOTFILES_REPO_ROOT` (optional; defaults to discovering `go.mod` up from working directory)
  - `DOTFILES_E2E_TEST=true` (set automatically during E2E test harness execution)
  - `MOCK_SERVER_PORT` (optional; sets mock HTTP server port for offline installer tests)
  - Fixture project: `test-project/` containing `test-project/dotfiles.config.ts` and `test-project/tools/`
- Monorepo/package working-directory notes:
  - Root: Contains `Justfile`, `package.json`, `go.mod`
  - CLI binary entrypoint: `cmd/dotfiles/`
  - Domain packages: `pkg/` (`pkg/config/`, `pkg/installer/`, `pkg/orchestrator/`, `pkg/dashboard/`, etc.)
  - Dashboard frontend workspace: `packages/dashboard/`
  - E2E tests: `tests/e2e/`
- Known caveats:
  - **Embedded Dashboard Assets:** The Go binary embeds compiled dashboard assets from `pkg/dashboard/dist/`. Any client change under `packages/dashboard/src/client/` requires running `just compile` (or `bun compile`) before starting `just dashboard` or running the Go binary.
  - **Stale Generated Output:** Do not manually edit `.generated/` output directories. If generated artifacts become stale, delete the matching `.generated/` folder and rerun `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts generate`.

# Findings by Category

## Correctness Bugs

### [REV-005] [moderate] Dashboard Server `handleToolUpdate` Re-installs Unupdated Version

- Location: `pkg/dashboard/routes.go:1299` (`handleToolUpdate`)
- Current behavior: The `POST /api/tools/:name/update` HTTP handler calls `s.orchestrator.InstallTool(ctx, targetTool, s.projectConfig)` directly without fetching the latest version or updating `targetTool.Version`.
- Expected behavior: `handleToolUpdate` should check for the latest release version via `inst.CheckUpdate(ctx, targetTool)`, assign `targetTool.Version = &res.LatestVersion`, and then trigger `s.orchestrator.InstallTool`.
- Why it matters: Triggering an update from the Dashboard UI re-executes installation using the existing pinned or zero version instead of upgrading the tool to the newly available version.

### [REV-007] [moderate] Unhandled Goroutine and Connection Leak in Proxy CONNECT Tunneling

- Location: `pkg/proxy/proxy.go:480` (`handleProxy`)
- Current behavior: When handling `HTTP/1.1 CONNECT` tunneling requests, two goroutines execute `io.Copy(destConn, clientConn)` and `io.Copy(clientConn, destConn)`. When the server connection loop finishes, `clientConn` is closed, but `destConn` is never closed by that goroutine.
- Expected behavior: Both `clientConn` and `destConn` should be closed whenever either copy loop completes, ensuring both goroutines unblock and exit cleanly.
- Why it matters: Causes memory and socket resource leaks on every HTTPS proxy tunnel connection handled by the proxy server.

### [REV-009] [minor] `break` Inside `switch` Statement Fails to Exit Outer Binary Loop

- Location: `cmd/dotfiles/install.go:41`, `cmd/dotfiles/uninstall.go:39` (`RunE`)
- Current behavior: When matching binary names in tool configurations, `break` is called inside a `switch` statement that resides inside `for _, b := range tc.Binaries`. In Go, `break` inside `switch` breaks out of the `switch` block only, not the enclosing `for` loop.
- Expected behavior: Use a labeled break or exit the binary loop immediately upon matching the target binary.
- Why it matters: Unnecessarily continues iterating over remaining binary elements after a match has already been identified.

## Security Issues

_No issues identified in this category._

## Project-Specific Policy Violations (always critical)

### [REV-001] [critical] Code Coverage Below Mandatory 90% Project Target

- Location: Project-wide (`pkg/...`, `cmd/dotfiles`)
- Policy source: `AGENTS.md` ("Always: maintain a minimum of 90% statement/line coverage across all packages")
- Current behavior: Overall Go statement coverage is 85.1%. Subpackages below target include `cmd/dotfiles` (61.2%), `pkg/installer` (74.1%), `pkg/orchestrator` (83.1%), `pkg/dashboard` (84.0%), and `pkg/downloader` (86.3%).
- Expected behavior: Every package must maintain a minimum of 90% statement/line coverage.
- Why it matters: Violates mandatory repository governance policies; leaves untested codepaths in core installation orchestration, CLI command routines, and dashboard HTTP server handlers.

### [REV-002] [critical] Violation of Project Policy against Global `/tmp` Usage in Installer Scripts

- Location: `scripts/managed-installer/install.sh:132`, `scripts/managed-installer/test.sh:221`
- Policy source: `cmd/dotfiles/AGENTS.md` ("Use `.tmp/` inside the project folder for temporary scripts and sandboxing. Never use global `/tmp`.")
- Current behavior: `install.sh` and `test.sh` hardcode `${TMPDIR:-/tmp}` for temporary script and sandbox directories (`mktemp -d "${TMPDIR:-/tmp}/dotfiles-install.XXXXXX"`).
- Expected behavior: Temporary directories should be created inside `.tmp/` relative to the repository or project root.
- Why it matters: Direct policy violation of `cmd/dotfiles/AGENTS.md` lines 13 and 26. Writing to global `/tmp` pollutes shared OS directories and risks collisions or permission conflicts across local multi-user environments.

## Cross-Component Contract Misalignment

### [REV-004] [moderate] `dotfiles update` Without Tool Arguments Does Not Perform Tool Updates

- Location: `cmd/dotfiles/update.go:40` (`updateCmd.RunE`)
- Current behavior: Running `dotfiles update` with no positional arguments checks for updates across all tools and prints "New version available", but never invokes `Orchestrator.InstallTool`. Running `dotfiles update <tool>` with a positional argument checks updates AND installs the new version (`targetTool.Version = &res.LatestVersion`).
- Expected behavior: `dotfiles update` without arguments should update all configured tools that have newer versions available (or delegate report-only functionality to `dotfiles check-updates`).
- Why it matters: Creates contract misalignment between single-tool and bulk update invocations; users executing `dotfiles update` expecting system-wide tool upgrades receive only a report.

## Stub Implementations

_No issues identified in this category._

## Unfinished Features

### [REV-003] [moderate] Ignored `--overwrite` Flag on `dotfiles generate` Command

- Location: `cmd/dotfiles/generate.go:102` (`var overwrite bool`)
- Current behavior: `cmd/dotfiles/generate.go` declares and binds the `--overwrite` flag to `var overwrite bool`, but `generateCmd.RunE` never reads `overwrite` or passes `config.WithOverwrite(ctx, overwrite)` into the execution context.
- Expected behavior: `generateCmd.RunE` should set `ctx = config.WithOverwrite(ctx, overwrite)` when `--overwrite` is true so that shim and symlink generators overwrite existing non-generator files.
- Why it matters: Users passing `dotfiles generate --overwrite` expecting conflicting shims or symlinks to be replaced will silently see warning messages ("Cannot create shim... Use --overwrite to replace it") because the flag is ignored.

## Dead Code

_No issues identified in this category._

## Overlapping Functionality and Responsibility Drift

### [REV-006] [moderate] Extreme Code Duplication in Goja VM Script Evaluation Functions

- Location: `pkg/vm/vm.go:27-184` (`EvaluateToolDefinition` and `EvaluateToolDefinitionWithContext`)
- Current behavior: `EvaluateToolDefinition` and `EvaluateToolDefinitionWithContext` contain approximately 80 lines of duplicated code covering VM setup, binding registration, script cleanup, environment object creation, polyfill execution, loader API bootstrapping, exports extraction, and JSON stringifying/unmarshaling.
- Expected behavior: Consolidate VM script evaluation into a single shared helper function (e.g., `evaluateScriptInVM`) called by both public functions.
- Why it matters: Increases risk of maintenance drift when polyfill initialization, binding registration, or export unmarshaling logic is modified in one function but missed in the other.

## Optimization Opportunities

_No issues identified in this category._

## File Size and Modularity

### [REV-010] [moderate] Monolithic File Size in Core Architecture Files (`orchestrator.go`, `routes.go`, `registry.go`)

- Location: `pkg/orchestrator/orchestrator.go` (1,870 lines), `pkg/dashboard/routes.go` (1,334 lines), `pkg/registry/registry.go` (968 lines)
- Current behavior: Core architecture source files significantly exceed recommended size thresholds (~500 lines) and combine multiple distinct domain responsibilities into single files.
- Proposed split plan:
  - Decompose `pkg/orchestrator/orchestrator.go` into:
    - `pkg/orchestrator/toposort.go` (Topological sorting algorithms and dependency graph construction)
    - `pkg/orchestrator/install_pipeline.go` (`InstallTools`, `InstallTool`, `UninstallTool`)
    - `pkg/orchestrator/generate_pipeline.go` (`GenerateTools`, `GenerateTool`, shim/symlink generation)
    - `pkg/orchestrator/shell_scripts.go` (`generateShellScripts`, zsh/bash/powershell script creation)
    - `pkg/orchestrator/hooks.go` (Lifecycle hook execution)
  - Decompose `pkg/dashboard/routes.go` into:
    - `pkg/dashboard/routes_tools.go` (Tool listing, detail, install, update, check-update handlers)
    - `pkg/dashboard/routes_stats.go` (Stats, activity, health handlers)
    - `pkg/dashboard/routes_config.go` (Config, shell integration handlers)
- Why it matters: Reduces maintainability, increases risk of merge conflicts, and complicates code reviews.

### [REV-011] [minor] Incomplete Test Coverage in Dashboard Shared Utilities (`api.ts` & `dashboardUtils.ts`)

- Location: `packages/dashboard/src/client/api.ts` (0% line coverage), `packages/dashboard/src/shared/dashboardUtils.ts` (51.5% line coverage)
- Current behavior: Unit tests for the dashboard frontend leave HTTP client functions (`api.ts`) and dashboard utility helpers (`dashboardUtils.ts`) partially or completely uncovered.
- Expected behavior: Expand unit tests in `packages/dashboard` to reach >90% coverage on `api.ts` and `dashboardUtils.ts`.
- Why it matters: Uncovered client-side HTTP request and data formatting functions risk undetected regressions during UI refactoring.

## API and Design Gaps (libraries only)

### [REV-008] [minor] Fragile Regex Import Stripping in `pkg/vm/vm.go`

- Location: `pkg/vm/vm.go:18-24` (`stripImports` & `importRegex`)
- Current behavior: `stripImports` uses a simple regex `(?s)\bimport\s+[\s\S]*?['"`][^'"`]+['"`];?`and basic string replacement for`export default` to clean scripts for direct Goja VM evaluation.
- Expected behavior: Standardize script transpilation across `pkg/vm` on the esbuild `transpileTS` / `api.Transform` pipeline already implemented in `pkg/vm/loader.go`.
- Why it matters: Multi-line named imports, re-exports, or comment blocks in `.tool.ts` files evaluated directly in Goja VM can cause SyntaxError runtime panics or script corruption.

# Test Results

- Commands run:
  - `just check` (oxfmt, dprint, oxlint, tsgo, go test ./pkg/... ./cmd/..., go test ./tests/e2e/...)
  - `bun test` (packages/dashboard test suite)
- Result: PASS
- Key notes: All 24 Go packages and E2E test suites passed cleanly. All 204 Bun frontend tests passed cleanly.

# Test Coverage

- Overall Go Statement Coverage: 85.1%
- Overall Dashboard JS Line Coverage: 90.8%
- Target: 90%
- Below-target Go packages:
  - `cmd/dotfiles`: 61.2%
  - `pkg/installer`: 74.1%
  - `pkg/orchestrator`: 83.1%
  - `pkg/dashboard`: 84.0%
  - `pkg/downloader`: 86.3%
- Below-target Dashboard JS files:
  - `packages/dashboard/src/client/api.ts`: 0.0%
  - `packages/dashboard/src/shared/dashboardUtils.ts`: 51.5%
  - `packages/dashboard/src/client/lib/highlightToolSource.ts`: 64.7%
