# Task Prompt
Deduplicate `cleanupTempFiles` in build package. Two identical implementations exist in `packages/build/src/build/steps/cleanupTempFiles.ts` and `packages/build/src/build/helpers/cleanupTempFiles.ts`, creating maintenance risk and potential divergence.

# Primary Objective
Remove the duplication by establishing a single canonical implementation of `cleanupTempFiles` while maintaining stable public API and ensuring zero breaking changes to existing callers.

# Open Questions
- [x] Should the canonical implementation live in `steps/` or `helpers/`?
  - **Decision**: Keep in `steps/`, delete `helpers/cleanupTempFiles.ts`
  - **Rationale**: `build.ts` imports from `./steps`, and `cleanupTempFiles` is NOT exported from `helpers/index.ts`, indicating it was only meant to be in `steps`. The copy in `helpers/` appears to be accidental duplication.

# Tasks
- [x] **TS001**: Examine both implementations and confirm they are truly identical
  - **Result**: Confirmed identical - both delete same 6 temp file paths using fs.rmSync
- [x] **TS002**: Identify which file should be the canonical source (steps vs helpers)
  - **Result**: Keep canonical in `steps/cleanupTempFiles.ts`; remove `helpers/cleanupTempFiles.ts`
- [x] **TS003**: Delete the duplicate file `packages/build/src/build/helpers/cleanupTempFiles.ts`
  - **Result**: File deleted successfully
- [x] **TS004**: Verify all tests pass and no callers are affected
  - **Result**: All 1128 tests pass, linting passes, typecheck passes
- [x] **TS005**: Confirm no dangling references in codebase
  - **Result**: No references to deleted path found

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features (no new features, only dedup)
- [x] Related READMEs and docs are updated (no changes needed)
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met

# Change Log
- Initial setup: Created task file and worktree
- TS001-TS005: Analyzed duplicate implementations, removed helpers/cleanupTempFiles.ts, verified all tests pass
