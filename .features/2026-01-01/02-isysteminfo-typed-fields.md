# Task
> Change `ISystemInfo` interface to use proper types for `platform` and `arch` fields instead of `string`.

# Primary Objective
Update `ISystemInfo.platform` to use `NodeJS.Platform` type and `ISystemInfo.arch` to use `NodeJS.Architecture` type.

# Open Questions
- [x] What types should be used? → `NodeJS.Platform` and `NodeJS.Architecture` from Node.js types

# Tasks
- [x] **TS001**: Identify the root cause of the problem
  - `ISystemInfo` uses `string` for `platform` and `arch` fields
  - Node.js provides specific types: `NodeJS.Platform` and `NodeJS.Architecture`
  - These fields receive values from `process.platform` and `process.arch` which have these types
- [x] **TS002**: Create a failing test to isolate the problem
  - Type tests in `packages/core/type-tests/ISystemInfo.test-d.ts` verify that `ISystemInfo` accepts proper typed values
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
  - Test files used invalid architecture values like `'x86_64'` instead of `'x64'`
- [x] **TS004**: Think very hard, step by step, to identify a solution
  - Use `NodeJS.Platform` and `NodeJS.Architecture` from `@types/node`
  - Update all test files to use valid values
  - Add `'arm'` case to `getArchitecturePatterns.ts`
- [x] **TS005**: Update `ISystemInfo` interface to use typed fields
  - File: `packages/core/src/common/common.types.ts`
  - Change `platform: string` to `platform: NodeJS.Platform`
  - Change `arch: string` to `arch: NodeJS.Architecture`
- [x] **TS006**: Update all test files that create `ISystemInfo` objects
  - Updated test values to use valid `NodeJS.Platform` and `NodeJS.Architecture` values
  - Added `'arm'` case to `getArchitecturePatterns.ts` switch statement
- [x] **TS007**: Run typecheck and tests to verify all changes are correct

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
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log
- Initial task file created
- Updated `ISystemInfo` interface to use `NodeJS.Platform` and `NodeJS.Architecture` types
- Added `'arm'` case to `getArchitecturePatterns.ts`
- Updated all test files to use valid type values
- Added type test file `ISystemInfo.test-d.ts`
- Fixed CLI `createSystemInfo` function with proper type casting
- Added `@types/node` to tsd test package.json
