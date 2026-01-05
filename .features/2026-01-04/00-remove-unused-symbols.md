# Task: Remove Unused Symbols

> Check VS Code problems for unused symbols, for each one verify if it's really unused and remove it if it is.

# Primary Objective
Identify and remove all unused symbols from the codebase after verifying they are truly unused.

# Open Questions
- [x] None at this time

# Tasks
- [x] **TS001**: Analyze all unused symbols reported by VS Code
- [x] **TS002**: Verify each symbol is truly unused (check all usages)
- [x] **TS003**: Remove unused symbols
- [x] **TS004**: Run full test suite to ensure no regressions
- [x] **TS005**: Commit changes

# Acceptance Criteria
- [x] All unused symbols are identified
- [x] Each symbol is verified to be truly unused
- [x] All unused symbols are removed
- [x] All tests pass (1321 tests)
- [x] No type errors remain
- [x] Code is linted and formatted
- [x] Changes are committed to git

# Summary of Changes

## Removed Unused Symbols

### packages/build/src/git-utils.ts
- ❌ Removed `expectToFail` property from `IExecuteCommandOptions`
- ❌ Removed `validateGitRepository()` function

### packages/config/src (Legacy File Cleanup)
- ❌ Deleted entire `projectConfigLoader.ts` file (all exports removed)
  - Removed `getDefaultConfig()` function
  - Removed `loadProjectConfig()` function
  - Removed `createProjectConfigFromObject()` function
  - Removed `ICreateProjectConfigFromObjectOptions` interface from this file
- ❌ Removed `IPlatformOverride` interface from `stagedProjectConfigLoader.ts`
- ❌ Removed `IPlatformMatch` interface from `stagedProjectConfigLoader.ts`

## Verified False Positives (Not Removed)

### Type-Related Issues (Not Unused Symbols)
- ✅ `formatLogMessage()` - Used 3 times in TestLogger.ts (type issue about return value, not unused)
- ✅ `handleAbsoluteUrl()` - Return type union issue, not unused (function is called)

### GitHub API Incomplete Code (Not Unused)
- ✅ GitHub API methods (`probeLatestTag`, `getLatestReleaseTags`) - Methods exist and are called
- ✅ Log messages for GitHub operations - Messages exist, code that uses them just incomplete

### Design Patterns (Not Unused)
- ✅ `ResolvedFileSystemBrand` type - Used for internal type annotations
- ✅ `__placeholder__` property - Required for TypeScript module augmentation
- ✅ `message` property in error interface - Used in error formatting
- ✅ Shell config properties - All actively used in code

## Final Verification

✅ **Type checking**: Zero errors  
✅ **Test suite**: 1321 tests pass  
✅ **Linting**: No issues (34 formatting fixes applied)  
✅ **All functionality preserved**

## Commits

1. `chore: remove unused symbols` - Initial cleanup of 7 unused symbols
2. `chore: remove unused IPlatformMatch interface from stagedProjectConfigLoader.ts` - Additional cleanup
3. `chore: apply formatting fixes` - Code formatting with biome
