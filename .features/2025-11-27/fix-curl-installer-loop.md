# User Prompt
> curl installer appears to be downloading and creating a new folder with downloaded file every time it's called, additionally if running script fails, it appears to be looping indefinetely, make failing tests first, the fix them

# Primary Objective
Fix the curl installer to prevent redundant downloads/folder creation and infinite looping on script failure.

# Open Questions
- [ ] None

# Tasks
- [x] **TS001**: Create a failing test case that reproduces the redundant download/folder creation and infinite loop issues.
- [x] **TS002**: Fix the redundant download/folder creation issue in the curl installer.
- [x] **TS003**: Fix the infinite loop on script failure issue in the curl installer.
- [x] **TS004**: Verify the fixes with the test case.

# Acceptance Criteria
- [x] Primary objective is met
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met

# Change Log
- Initialized feature file.
- Created reproduction test case `packages/installer/src/__tests__/Installer--repro-curl-loop.test.ts`.
- Modified `packages/installer/src/Installer.ts` to skip installation if tool is already installed and version is 'latest' (or unknown).
- Modified `packages/installer/src/Installer.ts` to always create binary symlinks for all tools, ensuring shims work correctly.
- Modified `packages/installer/src/Installer.ts` to set `DOTFILES_INSTALLING_<TOOL>` env var globally, protecting all installer types from recursion loops.
- Modified `packages/shim-generator/src/ShimGenerator.ts` to detect and prevent recursive installation loops using `DOTFILES_INSTALLING_<TOOL>` env var.
- Modified `packages/installer-curl-script/src/installFromCurlScript.ts` to properly handle `env` from config and move binaries from `/usr/local/bin` if needed.
- Added `packages/installer/src/__tests__/Installer--recursion-guard.test.ts` to verify recursion guard logic for all installers.
- Modified `packages/installer/src/Installer.ts` to prepend `installDir` to `PATH` during installation, allowing scripts to find the newly installed binary.
- Added `packages/installer/src/__tests__/Installer--env-setup.test.ts` to verify PATH modification logic.
- Added `packages/installer/src/__tests__/Installer--path-precedence.test.ts` to verify that installed binaries take precedence over shims during installation.
- Verified fixes with tests.

# Implementation Summary

### 1. Core Infrastructure: Safe Shell Execution
*   **`$extended` Type** (`packages/core/src/shell/extendedShell.types.ts`):
    *   Introduced a branded type to distinguish a "configured" shell from a raw Bun shell.
    *   **Why:** Prevents accidental usage of raw `$` which lacks the necessary recursion protection.
*   **`createConfiguredShell`** (`packages/installer/src/utils/createConfiguredShell.ts`):
    *   A new utility that wraps Bun's `$` to inject environment variables.
    *   **Critical Feature:** Intercepts `.env()` calls to **merge** variables instead of replacing them. This ensures that recursion guards persist even if a plugin sets its own environment.

### 2. Recursion Prevention Logic
*   **Installer Updates** (`packages/installer/src/Installer.ts`):
    *   **Guard Variable:** Sets `DOTFILES_INSTALLING_<TOOL>=true` globally during installation.
    *   **PATH Precedence:** Prepends the installation directory to `PATH`. This ensures scripts find the *real* binary immediately, bypassing the shim entirely.
    *   **Cleanup:** Automatically removes these variables after installation (success or failure).
*   **Shim Updates** (`packages/shim-generator/src/ShimGenerator.ts`):
    *   Shims now include a check for `DOTFILES_INSTALLING_<TOOL>`.
    *   If detected, the shim aborts with an error, breaking the infinite loop.

### 3. Type Safety & Refactoring
*   **Strict Context**: Updated `InstallContext` to require `$extended`. This forces all plugins and hooks to use the safe, configured shell.
*   **CLI Entry Points**: Updated `check-updates` and `update` commands to initialize contexts using `createConfiguredShell`.
*   **Test Helpers**: Updated mocks in `hookContextTestHelper.ts` and `installer-test-helpers.ts` to satisfy the new strict typing.

### 4. Verification & Testing
*   **New Test Suites**:
    *   `Installer--recursion-guard.test.ts`: Verifies guard variables are set/unset.
    *   `Installer--path-precedence.test.ts`: Confirms real binaries are preferred over shims during install.
    *   `createConfiguredShell.test.ts`: Unit tests for environment merging logic.
*   **Updated Tests**:
    *   `ShimGenerator.test.ts`: Updated snapshots to reflect the new bash guard logic.
    *   `HookExecutor` tests: Updated to use the configured shell.
