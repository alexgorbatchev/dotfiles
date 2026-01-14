# Task

> Fix shell script output ordering so all scripts from one tool are grouped together under a single tool header

# Primary Objective

Group all shell scripts produced by one tool under a single header with simplified format: `====\nfull-tool-file-path\n====`

# Open Questions

- [x] Identified the relevant package: `shell-init-generator`

# Tasks

- [x] **TS001**: Identify the root cause of the problem - scripts from the same tool are scattered instead of grouped
- [x] **TS002**: Create a failing test to isolate the problem
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Design and implement solution to group scripts by tool
- [x] **TS005**: Update header format to simplified `====\nfull-tool-file-path\n====`
- [x] **TS006**: Verify all tests pass

# Acceptance Criteria

- [x] Primary objective is met - all scripts from one tool grouped under single header
- [x] Header format is simplified to just file path with horizontal lines
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully
- [ ] `bun run build` completes successfully (blocked by certificate error)
- [ ] `.dist/cli.js` contains no external dependencies (blocked by build)
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly
- [x] Tests do not print anything to console
- [ ] All acceptance criteria are met

# Change Log

- Initial task file created
- Implemented script grouping and simplified header format
- Updated tests to reflect new structure
- Build blocked by certificate error (network issue)
