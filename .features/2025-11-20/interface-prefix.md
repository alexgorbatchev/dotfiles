---
# User Prompt
> Follow instructions in new-feature.prompt.md and make sure all interface names start with `I`

# Primary Objective
Ensure the requested TypeScript interfaces use the `I` prefix naming convention across the defined scope.

# Open Questions
- [x] What is the exact scope (specific files, packages, or entire repository) for enforcing the `I` prefix requirement? — Apply across the entire repository wherever non-compliant interfaces exist.

# Tasks
- [x] **TS001**: Confirm the scope and impacted files for the interface renaming effort
- [x] **TS002**: Update all affected interfaces and references to comply with the `I` prefix requirement
- [x] **TS003**: Rename `InstallContext` to `IInstallContext` and update remaining references
- [x] **TS004**: Rename `InstallerPlugin` and `InstallOptions` interfaces to include the `I` prefix

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met

# Change Log
- Created feature tracking file
- Clarified repository-wide scope and updated task status
- Prefixed all TypeScript interface names and updated dependent code
- Ran bun fix, lint, typecheck, and test to verify the refactor
- Logged follow-up request to rename `InstallContext`
- Completed TS003 by renaming `InstallContext` to `IInstallContext`, running bun fix/lint/typecheck/test
- Logged follow-up request for `IInstallerPlugin`/`IInstallOptions`
- Completed TS004 by renaming `InstallerPlugin`/`InstallOptions`, re-running bun fix/lint/typecheck/test, and confirming repository-wide updates
- Converted `InstallParamsRegistry` and all augmentations/docs to `IInstallParamsRegistry`, aligned toolcontext hierarchy references, and prefixed remaining helper interfaces/tests (reran bun fix/lint/typecheck/test)
- Corrected accidental `IIInstall…`/`IIInstaller…` renames, restored helper factory naming, reran bun fix/lint/typecheck/test to ensure clean state
- Mirrored the `IExtractOptions`/`IExtractResult` rename into the `hook-rework` worktree so archive extractor packages stay consistent, then reran bun fix/lint/typecheck/test
---
