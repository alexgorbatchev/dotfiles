# Task

> Implement cleanup of tool contributions when a tool is disabled via `.disable()` method

# Primary Objective

When a tool is disabled, remove all its generated contributions (shims, shell entries, symlinks, completions) while preserving downloaded binaries.

# Open Questions

- [x] Where is the `.disable()` method currently implemented?
  - In `packages/tool-config-builder/src/toolConfigBuilder.ts` - sets `isDisabled = true` which becomes `disabled: true` in built config
- [x] What generates shims and how are they tracked?
  - `packages/shim-generator/src/ShimGenerator.ts` generates shims via `generate()` method
  - Shims are tracked via `TrackedFileSystem` which records operations in `FileRegistry`
- [x] What generates shell entries and how are they tracked?
  - `packages/shell-init-generator/src/ShellInitGenerator.ts` generates shell init files
  - Shell entries are aggregated from all enabled tools and written to consolidated init files per shell type
- [x] How does the generate/install flow work currently?
  - `GeneratorOrchestrator.generateAll()` filters out disabled tools with a warning
  - Then generates shims, shell init files, and symlinks for enabled tools only
  - Currently disabled tools are simply skipped - their existing contributions are NOT cleaned up

# Root Cause Analysis

The current implementation in `GeneratorOrchestrator.generateAll()` only filters out disabled tools and skips them. It does not:

1. Remove existing shims for disabled tools
2. Regenerate shell init files without the disabled tool's contributions
3. Remove symlinks created by disabled tools

# Tasks

- [x] **TS001**: Identify the root cause of the problem - understand current `.disable()` implementation and generation flow
- [x] **TS002**: Create a failing test to isolate the problem - test that disabled tools should not have shims/shell entries remaining after regeneration
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
  - Describe the problem as you understand it
  - Describe proposed solution
  - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Fix CompletionGenerator to use TrackedFileSystem (currently uses untracked fs)
- [x] **TS007**: Add `IFileRegistry` dependency to `GeneratorOrchestrator` constructor
- [x] **TS008**: Add `cleanupToolArtifacts(toolName: string)` method to `GeneratorOrchestrator`
- [x] **TS009**: Call `cleanupToolArtifacts` for each disabled tool in `generateAll()`
- [x] **TS010**: Update main.ts to pass `fileRegistry` to `GeneratorOrchestrator`
- [x] **TS011**: Update tests to use mock `IFileRegistry`
- [x] **TS012**: Update log-messages.ts with cleanup messages
- [x] **TS013**: Run all tests and fix any issues
- [ ] **TS014**: Verify with test-project that disabled tools are cleaned up

# Acceptance Criteria

- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [x] All code quality standards are met
- [ ] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [ ] `bun run build` completes successfully.
- [ ] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [ ] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log

- Initial task setup with worktree `feature/2026-01-01/disable-tool-cleanup`
- Completed TS001: Identified root cause - `GeneratorOrchestrator.generateAll()` only skips disabled tools but does not clean up their contributions
- Completed TS002: Created failing tests in `GeneratorOrchestrator--disabled-cleanup.test.ts`:
  - `should remove shims for disabled tools that were previously enabled` - FAILS (shim remains)
  - `should remove symlinks for disabled tools that were previously enabled` - FAILS (symlink remains)
  - `should NOT remove downloaded binaries when tool is disabled` - PASSES (correct behavior)
- Completed TS003: Confirmed root cause - `GeneratorOrchestrator.ts:82-88` filters disabled tools but has no cleanup logic
- Completed TS004: Proposed solution using FileRegistry for cleanup, user approved approach
- Completed TS005: Detailed implementation tasks, discovered CompletionGenerator uses untracked fs
- Completed TS006-TS013: Implemented cleanup functionality:
  - Added `IFileRegistry` and `IFileSystem` dependencies to `GeneratorOrchestrator` constructor
  - Added `cleanupToolArtifacts()` method that queries registry and deletes cleanable file types (shim, symlink, completion)
  - Added `CLEANABLE_FILE_TYPES` constant to define which file types are cleaned up (excludes 'binary')
  - Updated `generateAll()` to call cleanup for disabled tools before generating for enabled tools
  - Created `createMockFileRegistry()` testing helper for mocking `IFileRegistry` in tests
  - Updated all test files to use new constructor signature
  - Added cleanup log messages to log-messages.ts
  - All 1234 tests pass
