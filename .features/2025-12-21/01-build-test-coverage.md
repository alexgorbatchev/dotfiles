# Task: Add Comprehensive Test Coverage to Build Package

> This task implements three related test suites for the build package (T003, T004, T005) in parallel

## Primary Objective

Add comprehensive test coverage for critical build system logic covering dependency resolution, bundle size enforcement, and publishable artifact generation.

## Open Questions

- [x] How to test `resolveRuntimeDependencies` which reads actual bundle file? Answer: Test the function can be called with a mock context and returns expected structure
- [x] How to test without creating actual files? Answer: Use temporary files for filesystem-dependent tests, verify structure/types for others

## Tasks

- [x] **TS001**: Set up feature branch `feature/2025-12-21/build-test-coverage`
- [x] **TS002**: Implement T003 - Runtime dependency resolution tests
- [x] **TS003**: Implement T004 - CLI bundle size enforcement tests
- [x] **TS004**: Implement T005 - Dist package.json generation tests
- [x] **TS005**: Run full test suite and verify all tests pass
- [x] **TS006**: Verify type checking and linting pass
- [x] **TS007**: Commit changes with appropriate messages

## Acceptance Criteria

- [x] T003 test file: `packages/build/src/build/__tests__/resolveRuntimeDependencies.test.ts` created and passes
- [x] T004 test file: `packages/build/src/build/__tests__/enforceCliBundleSizeLimit.test.ts` created and passes
- [x] T005 test file: `packages/build/src/build/__tests__/generateDistPackageJson.test.ts` created and passes
- [x] All new tests are deterministic and pass consistently
- [x] No production code modified (only new test files added)
- [x] `bun test packages/build/src/build/__tests__/` runs all new tests successfully
- [x] `bun typecheck` passes with no errors
- [x] `bun lint` passes with no errors
- [x] `bun test` (full suite) passes with all tests passing

## Change Log

### Commit 1: `140cfad` - test: T003-T005 comprehensive test coverage for build package
- Created `resolveRuntimeDependencies.test.ts` (7 test cases)
- Created `enforceCliBundleSizeLimit.test.ts` (6 test cases)
- Created `generateDistPackageJson.test.ts` (8 test cases)
- Created fixture files for test data
- Created `createMockBuildContext.ts` test helper
- Total: 21 new test cases

### Commit 2: `331db04` - task: create T003-T005 test coverage tasks for build package
- Created this task documentation file
- Defined objectives and acceptance criteria

### Commit 3: `0816ed3` - refactor: use local .tmp folder instead of global /tmp for test files
- Updated all three test files to use local `.tmp` directory
- Improves test artifact organization and avoids conflicts

### Commit 4: `fc74512` - refactor: extract tmp directory setup into reusable helper
- Created `manageTmpDir.ts` helper for DRY tmp directory management
- Updated all three test files to use `setupTmpDir` helper
- Eliminated duplicate boilerplate code

### Final Status
- ✅ All 21 tests passing
- ✅ Type checking: 0 errors
- ✅ Linting: 0 errors
- ✅ Full test suite: 1,149 tests pass (1,128 existing + 21 new)

---

## Implementation Details

### T003: Runtime Dependency Resolution Tests

**File:** `packages/build/src/build/__tests__/resolveRuntimeDependencies.test.ts`

**What to test:**
- Function discovers all runtime dependencies from source files
- Correctly identifies external vs internal packages
- Handles monorepo package references (`@dotfiles/*`)
- Filters out dev-only dependencies
- Handles missing/malformed package.json gracefully

**Test fixtures location:** `packages/build/src/build/__tests__/fixtures/fixtures--resolve-runtime-deps.ts`

---

### T004: CLI Bundle Size Enforcement Tests

**File:** `packages/build/src/build/__tests__/enforceCliBundleSizeLimit.test.ts`

**What to test:**
- Function enforces maximum CLI bundle size
- Accepts builds under the size limit
- Rejects builds over the size limit with clear error message
- Handles edge cases (empty file, boundary sizes)
- Provides helpful output when limit exceeded

**Test fixtures location:** `packages/build/src/build/__tests__/fixtures/fixtures--bundle-size.ts`

---

### T005: Dist package.json Generation Tests

**File:** `packages/build/src/build/__tests__/generateDistPackageJson.test.ts`

**What to test:**
- Generated `package.json` contains required fields (name, version, main, etc)
- Correctly exports public API modules
- Removes private fields and dev dependencies
- Preserves all workspace package versions from source
- Generates valid JSON that parses correctly

**Test fixtures location:** `packages/build/src/build/__tests__/fixtures/fixtures--dist-package-json.ts`

---

## Notes to Keep Conflict-Free

- **Do not modify production code** in any file outside `__tests__/` directories
- **Add only new test files** - no edits to existing source
- **Keep fixtures local** - don't modify shared test helpers or testing-helpers package
- **Use consistent patterns** - follow naming conventions from other test files in the project
