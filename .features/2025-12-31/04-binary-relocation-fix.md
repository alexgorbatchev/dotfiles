# Task

> Binary installation is incorrectly relocating binaries by copying them from their extracted archive location to the versioned directory root. This breaks tools that rely on supplementary files (completions, docs, man pages) being in the same directory as the binary.

# Primary Objective

Replace binary copy operations with symlinks to preserve tool's access to co-located supplementary files.

# Open Questions

- [ ] None

# Tasks

- [x] **TS001**: Identify the root cause of the problem
  - **Root cause**: In `packages/installer/src/utils/createBinaryEntrypoint.ts` line 48, the function uses `fs.copyFile()` to copy the binary from its extracted location to the entrypoint path
  - This creates a duplicate copy of the binary at the versioned directory root (e.g., `15.1.0/rg`) instead of pointing to the original location within the extracted archive (e.g., `15.1.0/ripgrep-15.1.0-aarch64-apple-darwin/rg`)
  - The copy operation breaks tools that rely on supplementary files (completions, docs, man pages) being relative to the binary's location
- [x] **TS002**: Create a failing test to isolate the problem
  - Updated `packages/installer/src/utils/__tests__/createBinaryEntrypoint.test.ts` to verify entrypoints are symlinks
  - Tests fail as expected: `expect(entrypointStats.isSymbolicLink()).toBe(true)` fails because current implementation copies files
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
  - Test confirms: `fs.copyFile()` creates a regular file, not a symlink
  - The entrypoint should be a symlink pointing to the relative path (e.g., `extracted/test-binary`)
- [x] **TS004**: Think step by step to identify a solution, then STOP and propose to user
  - **Problem**: `createBinaryEntrypoint()` uses `fs.copyFile()` which duplicates the binary
  - **Solution**: Replace `fs.copyFile()` with `fs.symlink()` using relative path
  - **Implementation location**: `packages/installer/src/utils/createBinaryEntrypoint.ts` lines 46-53
  - **Before**:
    ```typescript
    const targetPath = path.relative(timestampedDir, actualBinaryPath);
    logger.debug(messages.binarySymlink.creating(entrypointPath, targetPath));
    await fs.copyFile(actualBinaryPath, entrypointPath);
    const binaryStats = await fs.stat(actualBinaryPath);
    const binaryMode: number = binaryStats.mode & 0o777;
    await fs.chmod(entrypointPath, binaryMode);
    ```
  - **After**:
    ```typescript
    const targetPath = path.relative(timestampedDir, actualBinaryPath);
    logger.debug(messages.binarySymlink.creating(entrypointPath, targetPath));
    await fs.symlink(targetPath, entrypointPath);
    ```
  - **Benefits**:
    1. Preserves original binary location within extracted archive
    2. Tools can access co-located supplementary files via relative paths
    3. Saves disk space by not duplicating binaries
  - **No other changes needed**: The `current` symlink mechanism in `Installer.ts` remains unchanged
- [x] **TS005**: Write down follow up tasks needed to implement the solution
  - TS006: Modify `createBinaryEntrypoint()` to use `fs.symlink()` instead of `fs.copyFile()`
  - TS007: Run all tests and verify they pass
  - TS008: Run `bun test-project` to verify end-to-end behavior
  - TS009: Verify the generated structure shows symlinks, not copies
- [x] **TS006**: Modify `createBinaryEntrypoint()` to use `fs.symlink()` instead of `fs.copyFile()`
  - Changed `fs.copyFile()` to `fs.symlink()` with relative path
  - Removed `chmod` call since symlinks don't need permissions set
  - Updated verification to check that entrypoint IS a symlink
- [x] **TS007**: Run all tests and verify they pass
  - 1207 tests pass across 143 files
  - `bun lint` and `bun typecheck` pass
- [x] **TS008**: Run `bun test-project` to verify end-to-end behavior
  - `bun test-project generate` works
  - `bun test-project install github-release--rg` works
  - `./rg --version` executes successfully
- [x] **TS009**: Verify the generated structure shows symlinks, not copies
  - `15.1.0/rg` is now a symlink → `ripgrep-15.1.0-aarch64-apple-darwin/rg`
  - Supplementary files (complete/, doc/, README.md) accessible alongside binary

# Acceptance Criteria

- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated (no changes needed - behavior unchanged from API perspective)
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree
- [x] `bun run build` completes successfully
- [x] `.dist/cli.js` contains no external dependencies
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly
- [x] Tests do not print anything to console

# Change Log

- Created task file
- TS001: Identified root cause - `fs.copyFile()` in `createBinaryEntrypoint.ts` duplicates binaries
- TS002: Added failing tests in `createBinaryEntrypoint.test.ts` that verify symlinks
- TS003: Confirmed tests fail because entrypoints are copies, not symlinks
- TS004: Proposed solution - replace `fs.copyFile()` with `fs.symlink()`
- TS005: Defined implementation tasks
- TS006: Implemented fix - replaced `fs.copyFile()` with `fs.symlink()` in `createBinaryEntrypoint.ts`
- TS007-TS009: Verified all tests pass and end-to-end behavior works correctly
