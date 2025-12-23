---
# Task Prompt
> Removing binaryPath and making callers use binaryPaths[0] (single source of truth), and/or
> Removing downloadPath/extractDir/extractResult from IAfterInstallContext (since they aren’t actually provided) do that

# Primary Objective
Make `IAfterInstallContext` a single-source-of-truth by removing redundant/unused fields and updating all call sites, tests, and docs accordingly.

# Open Questions
- [x] Scope is strictly `IAfterInstallContext`.

# Tasks
- [x] **TS001**: Identify the root cause of the ambiguity
  - [x] Confirm how `binaryPath` is derived from `binaryPaths` in the installer implementation
  - [x] Confirm whether `downloadPath`/`extractDir`/`extractResult` are ever populated for `after-install` hooks
  - [x] Identify all references to `ctx.binaryPath` and any `after-install` references to `downloadPath`/`extractDir`/`extractResult`
- [x] **TS002**: Create a failing test to isolate the problem
  - [x] Add a test asserting `after-install` hook context does not include `binaryPath`
- [x] **TS003**: Confirm the root cause of the ambiguity based on the failing test
  - [x] Verify the test fails specifically because `binaryPath` was present on the runtime context
- [x] **TS004**: Identify the solution
  - [x] Remove `binaryPath` (redundant) and remove unrelated fields from `IAfterInstallContext`
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Update types
  - [x] Remove `binaryPath` from `IAfterInstallContext`
  - [x] Remove `downloadPath`/`extractDir`/`extractResult` from `IAfterInstallContext`
  - [x] Ensure `IDownloadContext` / `IExtractContext` remain unchanged
- [x] **TS007**: Update implementation
  - [x] Update installer to no longer populate `binaryPath` in the after-install context
  - [x] Ensure `binaryPaths` is always provided as an array (even if empty)
- [x] **TS008**: Update all call sites
  - [x] Replace `ctx.binaryPath` usage with `ctx.binaryPaths[0]` (with safe empty handling)
  - [x] Confirm no `after-install` hook code depends on `downloadPath`/`extractDir`/`extractResult`
- [x] **TS009**: Update docs
  - [x] Update hook documentation and examples to reference `binaryPaths` only
- [x] **TS010**: Verify quality gates
  - [x] Run `bun fix`
  - [x] Run `bun lint`
  - [x] Run `bun typecheck`
  - [x] Run `bun test`
  - [x] Run `bun run build`
  - [x] Run `bun test-project generate` and verify `test-project/.generated` is created

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies (spot-checked via quiet grep for common externals).
- [x] Use `bun test-project generate` to generate artifacts, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log
- Added focused test proving `binaryPath` should not exist on `after-install` context.
- Removed `binaryPath` and download/extract fields from `IAfterInstallContext`.
- Updated installer to only provide `binaryPaths` (array) and `version`.
- Updated tests and docs to use `binaryPaths[0]`.
---
