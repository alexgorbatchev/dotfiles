# User Prompt
> we need to add a new files command that takes toolName and prints tree of files in current version binaries, for example tree of eza/version/*, this is a helper command to allow tool authors to see the content of folder

# Primary Objective
Add a new CLI command `files <toolName>` that displays a tree structure of files in the tool's current version binaries directory to help tool authors inspect installed tool contents.

# Open Questions
- [x] Should the command show the full tree or just the top-level structure by default? **No depth limit, show full tree**
- [x] Should there be a depth limit option? **No**
- [x] What should happen if the tool doesn't exist or has no installed version? **Same error handling as other commands that take toolName**
- [x] Should it show file sizes or permissions? **Just tree structure with ASCII art branches**
- [x] Should the command output include the full path to the binaries directory at the top? **Yes, full path as first line with tree branching from it**

# Tasks
- [x] **TS001**: Research existing CLI commands to understand toolName error handling patterns
- [x] **TS002**: Research how other commands display information (check existing command structure in packages/cli)
- [x] **TS003**: Create a failing test for the new `files` command
- [x] **TS004**: Implement the `files` command handler
- [x] **TS005**: Implement tree formatting utility with ASCII art
- [x] **TS006**: Wire up the command in the CLI
- [x] **TS007**: Fix failing tests
- [x] **TS008**: Verify all tests pass
- [x] **TS009**: Update relevant documentation

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree

# Change Log
- Created feature branch and worktree
- Created feature work file
- Researched existing CLI command patterns
- Created failing tests for files command
- Implemented filesCommand.ts with tree display functionality
- Added log messages for the files command
- Wired up command registration in main.ts
- Fixed all tests - all passing
- Fixed linter issues
- All 1040 tests passing
- Added e2e tests for files command (installScenario pattern)
- Refactored to use dependency injection for print function (avoiding logger prefixes)
- Updated tree format: removed trailing slashes, single dashes (└─, ├─)
- Updated README.md to include files command in Quick Start
- All 1042 tests passing
- All acceptance criteria met
