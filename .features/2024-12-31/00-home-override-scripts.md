# Task
> Override HOME environment variable in always and once generated scripts to use `projectConfig.paths.homeDir`

# Primary Objective
Ensure that always and once shell scripts execute with HOME set to the configured home directory (`projectConfig.paths.homeDir`) rather than the system's actual HOME.

# Open Questions
- [x] How should bash/zsh handle the override? Using subshell with `HOME=...` at the start
- [x] How should PowerShell handle the override? Save/restore pattern with `$homeOrig` and `$userProfileOrig` variables

# Tasks
- [x] **TS001**: Modify `AlwaysScriptFormatter` to accept `homeDir` parameter and inject HOME override
  - bash/zsh: `HOME="{homeDir}"` as first line inside subshell
  - powershell: save `$env:HOME` and `$env:USERPROFILE` to `$homeOrig`/`$userProfileOrig`, set new values in try block, restore in finally block
- [x] **TS002**: Modify `OnceScriptFormatter` to accept `homeDir` parameter and inject HOME override
  - Same pattern as AlwaysScriptFormatter for each shell type
- [x] **TS003**: Update `BaseShellGenerator` to pass `projectConfig.paths.homeDir` when instantiating formatters
- [x] **TS004**: Update `AlwaysScriptFormatter.test.ts` with new expected output snapshots
- [x] **TS005**: Update `OnceScriptFormatter.test.ts` with new expected output snapshots
- [x] **TS006**: Run all tests to verify no regressions
- [x] **TS007**: Verify with test-project that generated scripts contain HOME override

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
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree
- [x] `bun run build` completes successfully
- [x] `.dist/cli.js` contains no external dependencies
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly
- [x] Tests do not print anything to console

# Change Log
- Created task file and worktree
- Implemented HOME override in AlwaysScriptFormatter and OnceScriptFormatter
- Updated BaseShellGenerator to pass homeDir to formatters
- Updated all test snapshots to verify HOME override output
- Verified with test-project that generated scripts contain HOME override
- All tests pass (1188 tests), lint and typecheck clean, build successful
- Committed changes to feature branch
