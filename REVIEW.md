---
review_sha: c8509e9b3c7dc25d4df5adfe259529a4ffd50965
reviewed_at: 2026-03-18T17:16:12Z
---

# Review Summary

- Findings: critical=0, moderate=5, minor=1
- Coverage: 89.65% line coverage (target: 90%)
- Test status: fail (`test:all` worker failure; `test:native` reports 1 failing test in `CachedDownloadStrategy`; typecheck currently fails in dashboard test files present in workspace)
- Architecture snapshot: Bun/TypeScript monorepo (38 workspace packages) with a CLI entrypoint (`packages/cli`) orchestrating config loading, plugin-based installers, generation (shims/shell/symlinks), registry tracking, and an optional dashboard server/UI.

# Project Review Runbook

- Last verified at: 2026-03-18T17:16:12Z (c8509e9b3c7dc25d4df5adfe259529a4ffd50965)
- Setup/install commands:
  - `cd main && bun install --frozen-lockfile`
- Test commands:
  - `cd main && bun run test:all`
  - `cd main && bun run test:native`
  - `cd main && BUN_TEST_SEQUENTIAL=1 bun test <path-to-test-file>`
- Coverage commands:
  - `cd main && BUN_TEST_SEQUENTIAL=1 bun test --coverage`
- Build/typecheck/lint commands (if applicable):
  - `cd main && bun run compile`
  - `cd main && bun run typecheck`
  - `cd main && bun run lint`
- Required env/services/fixtures:
  - Bun 1.3.x runtime
  - Local system tools used by tests/build: `git`, `tar`, `unzip`, `file`, `npm` (and `hdiutil` on macOS for DMG flows)
  - Optional envs: `GITHUB_TOKEN` (API auth), `DEV_PROXY` (development HTTP proxy)
- Monorepo/package working-directory notes:
  - Run commands from repo root: `main/`
  - Test preload (`packages/testing-helpers/src/parallel-test-runner.ts`) alters default `bun test` behavior; use package scripts for expected modes.
- Known caveats:
  - `bun run test:all` currently exits non-zero with `Worker 1: FAILED`.
  - `bun run test:native` and coverage run currently fail due one failing test in `packages/downloader/cache/__tests__/CachedDownloadStrategy.test.ts`.
  - `bun run typecheck` currently reports dashboard test typing errors in files present in the workspace.
  - `bun run lint` is mutating (`dprint fmt` + `oxlint --fix`).

# Findings by Category

## Correctness Bugs

### [REV-001] [moderate] Cyclic token substitution can hang config loading indefinitely

- Location: `packages/config/src/stagedProjectConfigLoader.ts:213` (`performFixedPointStringSubstitution`)
- Current behavior: string token substitution loops with `while (previous !== current)` and no iteration/cycle guard. Cyclic substitutions (e.g. `A -> {B}`, `B -> {A}`) never converge and can hang CLI startup/config loading.
- Expected behavior: enforce a max-iteration limit (as done in `performFixedPointObjectSubstitution`) and/or detect cycles, then throw a descriptive config error.
- Why it matters: a malformed environment/config token graph can freeze all commands before user-facing error handling runs.

### [REV-002] [moderate] Invalid `DEV_PROXY` values silently enable a broken proxy configuration

- Location: `packages/cli/src/cli.ts:252-288` (`setupServices`)
- Current behavior: non-numeric `DEV_PROXY` values skip availability checks, but `proxyConfig` is still created with `port: parseInt(devProxyPort, 10)` (NaN), and passed to `Downloader`.
- Expected behavior: validate `DEV_PROXY` once; if invalid, fail fast with a clear message or ignore proxy mode entirely.
- Why it matters: misconfiguration causes avoidable runtime download failures that are hard to diagnose.

### [REV-003] [moderate] README repository fallback ignores active platform/architecture

- Location: `packages/dashboard/src/server/routes/tool-readme.ts:28` (`getRepoFromToolConfig`)
- Current behavior: when top-level `installParams.repo` is missing, fallback scans `platformConfigs` and returns the first `repo`, regardless of whether that entry matches the current `services.systemInfo` platform/arch.
- Expected behavior: select repo from the platform-config entry that matches the active system (or from resolved tool config), not first-match order.
- Why it matters: dashboard README/source data can point at the wrong repository for multi-platform tools, producing misleading docs in the UI.

### [REV-004] [moderate] Test suite is red due conflicting cache behavior expectations

- Location: `packages/downloader/cache/__tests__/CachedDownloadStrategy.test.ts:55-68` (`should skip cache when progress callback is provided`) and `packages/downloader/CachedDownloadStrategy.ts:151+` (`download`)
- Current behavior: implementation checks cache even when `onProgress` is provided, but the unit test still expects zero cache calls. `bun run test:native` fails with this assertion.
- Expected behavior: align implementation and test contract (either restore no-cache behavior with progress callbacks, or update/remove the stale assertion and keep cache-enabled progress semantics).
- Why it matters: failing baseline tests block CI confidence and can mask real regressions.

## Security Issues

- No critical security defects identified in this review pass.

## Stub Implementations

- None identified.

## Unfinished Features

- None identified.

## Dead Code

### [REV-005] [minor] `find-unused` script references a non-existent analyzer path

- Location: `package.json:17` (`scripts.find-unused`)
- Current behavior: script points to `packages/build/src/unused-analyzer/analyze.ts`, which is absent; command fails with `Module not found`.
- Expected behavior: repoint to the current analyzer path or remove the stale script entry.
- Why it matters: dead scripts erode trust in project automation and slow maintenance tasks.

## Optimization Opportunities

- No high-confidence optimization issues worth escalating this round.

## File Size and Modularity

### [REV-006] [moderate] `Installer` class has become a multi-responsibility bottleneck

- Location: `packages/installer/src/Installer.ts:157` (`Installer` class, 1061 LOC)
- Current behavior: a single file/class owns event hook dispatch, installation orchestration, version resolution, filesystem layout/symlink mutation, registry recording, and context assembly.
- Expected behavior: split into focused modules, e.g.:
  - `installer/src/pipeline/InstallationPipeline.ts` (install flow + skip/decision logic)
  - `installer/src/hooks/HookLifecycle.ts` (before/after hook orchestration)
  - `installer/src/context/InstallContextFactory.ts` (minimal/full context creation)
  - `installer/src/state/InstallationStateWriter.ts` (recording + symlink/current pointer updates)
- Why it matters: this size and responsibility mix increases review friction, merge conflict risk, and change-safety hazards.

## API and Design Gaps (libraries only)

- None flagged as release-relevant in this pass.

# Test Results

- Commands run:
  - `cd main && bun run test:all`
  - `cd main && bun run test:native`
  - `cd main && BUN_TEST_SEQUENTIAL=1 bun test --coverage`
  - `cd main && bun run typecheck`
  - `cd main && bun run lint`
  - `cd main && bun run compile`
  - `cd main && bun run find-unused`
- Result:
  - `test:all`: failed (`Worker 1: FAILED`)
  - `test:native`: failed (`1 tests failed`: `CachedDownloadStrategy > download > should skip cache when progress callback is provided`)
  - `typecheck`: failed (dashboard test typing error in workspace files)
  - `lint`: passed (auto-fixed formatting)
  - `compile`: passed
  - `find-unused`: failed (`Module not found "packages/build/src/unused-analyzer/analyze.ts"`)
- Failures:
  - Unit test failure in downloader cache strategy test
  - Typecheck failure in dashboard test file(s) currently present in workspace
  - Broken `find-unused` script target

# Test Coverage

- Overall: 89.65% lines (88.20% funcs)
- Target: 90%
- Below-target areas:
  - `packages/installer-cargo/src/installFromCargo.ts` (2.16% lines)
  - `packages/dashboard/src/server/routes/tool-configs-tree.ts` (2.63% lines)
  - `packages/dashboard/src/server/routes/tool-history.ts` (5.41% lines)
  - `packages/dashboard/src/server/routes/tool-readme.ts` (6.12% lines)
  - `packages/dashboard/src/server/routes/tool-source.ts` (8.33% lines)
  - `packages/cli/src/cli.ts` (10.93% lines)
  - `packages/installer-github/src/installFromGitHubRelease.ts` (29.72% lines)

# Issue Lifecycle (incremental reviews)

- Fixed this round: N/A (initial full review)
- Still open: [REV-001], [REV-002], [REV-003], [REV-004], [REV-005], [REV-006]
- Partially fixed: None
