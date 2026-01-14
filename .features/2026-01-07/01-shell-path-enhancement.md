# Task

> Need to add to PATH of `$` the location of the installed binary. `baseContext.currentDir` points to where binary archive may have been downloaded, but archive may have folders and subfolders... this needs to be added to `after-install` hook. May potentially be doing elsewhere for other contexts too.

# Primary Objective

Enhance the shell `$` in hook contexts to automatically include the directory containing installed binaries in PATH, so that `after-install` hooks can execute the freshly installed tool.

# Open Questions

- [ ] Should the PATH modification apply only to `after-install` hooks, or also to `after-extract` hooks?
- [ ] Should we add all unique binary directories to PATH, or just the first one?
- [ ] How should externally managed tools (e.g., Homebrew) be handled?

# Tasks

- [ ] **TS001**: Identify the root cause of the problem
- [ ] **TS002**: Create a failing test to isolate the problem
- [ ] **TS003**: Confirm the root cause of the problem based on the failing test
- [ ] **TS004**: Design solution for PATH enhancement in hook contexts
- [ ] **TS005**: Implement PATH enhancement for `after-install` hook context

# Acceptance Criteria

- [ ] Primary objective is met
- [ ] All temporary code is removed
- [ ] All tasks are complete
- [ ] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [ ] All code quality standards are met
- [ ] All changes are checked into source control
- [ ] All tests pass
- [ ] All acceptance criteria are met

# Change Log

- Initial task file creation
