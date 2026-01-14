# User Prompt

> Follow instructions in [new-feature.prompt.md](vscode-userdata:/Users/alex/Library/Application%20Support/Code/User/profiles/-4257d6dd/prompts/new-feature.prompt.md).
> #file:TASK-completions-glob-and-tracking.md

# Source Branch

main

# Primary Objective

Ensure completion symlinks for tools with glob-based completion sources are fully tracked in the file registry with proper `toolName`, `fileType='completion'`, and `operationType='symlink'` metadata, and are queryable via the CLI `files` command.

# Open Questions

- [x] Is the current implementation of `withFileType()` sufficient for scoping file operations?
- [x] Should completion tracking be scoped at the `setupCompletions` call site or within the function?
- [x] Are there other file types besides completion that need similar tracking?

# Tasks

- [ ] **TS001**: Scope TrackedFileSystem for completions - modify setupCompletions call site to use `fs.withFileType('completion')` when the filesystem is a TrackedFileSystem
- [ ] **TS002**: Verify registry contents - test that rg installation creates completion-typed symlink records in the registry database
- [ ] **TS003**: Align files command output - ensure CLI files command properly filters and displays completion-typed operations
- [ ] **TS004**: Add registry-level tests - test that withFileType('completion') + symlink() records operations with fileType='completion'
- [ ] **TS005**: Add integration tests - verify tool installation with completion source records completion-typed file operations
- [ ] **TS006**: Run full test suite - ensure bun test and bun lint pass with only pre-existing failures

# Acceptance Criteria

- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met
- [x] `rg` installation uses versioned directory (15.1.0) and globbed completion source path
- [x] `test-project/.generated/shell-scripts/zsh/completions/_rg` exists and points to correct versioned completion file
- [x] Registry DB contains completion-typed symlink records for rg
- [x] `bun cli --config=test-project/config.ts files --tool rg --type completion` prints at least one completion entry
- [x] All new/updated tests pass; global test run remains at 997 pass / 2 skip / 2 fail (pre-existing)

# Change Log

- Created feature branch and work file
- **TS001**: Fixed TrackedFileSystem scoping for completions by removing TODO comment in setupCompletions.ts
- **TS001**: Identified root cause - installer plugins were receiving raw `fs` instead of `installerTrackedFs` in main.ts
- **TS001**: Updated plugin registrations to use `installerTrackedFs` ensuring completion operations are tracked
- **TS002**: Verified rg installation creates completion-typed symlink records in registry database
- **TS003**: Verified CLI files command properly filters and displays completion-typed operations
- **TS004**: Added registry-level test in TrackedFileSystem.test.ts for withFileType('completion') + symlink()
- **TS005**: Added integration test in setupCompletions.test.ts for completion tracking with TrackedFileSystem
- **TS006**: Ran full test suite (997 pass, 2 skip, 2 fail - pre-existing failures)
- **TS006**: Fixed linting issues with bun fix
