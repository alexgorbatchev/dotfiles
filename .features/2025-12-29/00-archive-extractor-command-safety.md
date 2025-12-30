---
# Task Prompt
> Follow instructions in alex--feature--new.prompt.md.
> #file:review-CRITICAL-TASKS.md T001

# Primary Objective
Harden archive extraction in `packages/archive-extractor` by eliminating shell-string command execution and using collision-resistant temp directories.

# Open Questions
- [x] None.

# Tasks
- [x] **TS001**: Identify the root cause of the problem
  - [x] Inspect `ArchiveExtractor` implementation for command execution (`child_process.exec`) and temp dir naming.
  - [x] Identify all code paths that construct command strings for `tar`/`unzip`.
- [x] **TS002**: Create a failing test to isolate the problem; if unable to create a failing test STOP and report
  - [x] Add a test that covers archive paths with single quotes (would fail with single-quoted command strings).
  - [x] Note: temp dir uniqueness changed to UUID; no deterministic collision test added.
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
  - [x] Confirmed: single-quoting archive paths breaks extraction for paths containing `'`.
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and iterate with the user
  - [x] Replaced shell-string execution with Bun `$` argument interpolation.
  - [x] Replaced temp dir suffix from `Math.random()` to `randomUUID()`.
- [x] **TS005**: Write down follow up tasks needed to implement the solution
  - [x] Implement non-shell execution for `tar`/`unzip`.
  - [x] Replace temp dir suffix generation.
  - [x] Update tests.
- [x] **TS006**: Implement the solution
  - [x] Edit only task-owned files:
    - [x] `packages/archive-extractor/src/ArchiveExtractor.ts`
    - [x] `packages/archive-extractor/src/__tests__/ArchiveExtractor.test.ts`
  - [x] Ensure no `child_process.exec` is used.
  - [x] Ensure no command strings are constructed for tar/unzip via concatenation/interpolation.
  - [x] Ensure temp directory name uses `randomUUID()` (or equivalent strong uniqueness).
- [x] **TS007**: Verify
  - [x] Run `bun fix`
  - [x] Run `bun lint`
  - [x] Run `bun typecheck`
  - [x] Run `bun test packages/archive-extractor/src/__tests__/ArchiveExtractor.test.ts`
  - [x] Run `bun test`
  - [x] Run `bun run build`
  - [x] Run `bun test-project generate` and verify `.generated` is created

# Acceptance Criteria
- [x] Primary objective is met
- [x] No `child_process.exec` used for tar/unzip extraction.
- [x] No command strings constructed via string concatenation/interpolation for tar/unzip.
- [x] Temp directory names are collision-resistant.
- [x] `bun test packages/archive-extractor/src/__tests__/ArchiveExtractor.test.ts` passes.
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies; do not print it.
- [x] Use `bun test-project generate` to create `.generated`.
- [x] Tests do not print anything to console.
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated (if behavior changes)
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met

# Change Log
- 2025-12-29: Created task file and worktree/branch for T001.
- 2025-12-29: Replaced `exec`+command strings with Bun `$` arg interpolation; temp dir suffix now UUID; added quote-path regression tests; ran fix/lint/typecheck/test/build/test-project.
---
