---
# Task
> Replace all usage of bun $ with dex-sh, you will need to instll dex-sh

# Primary Objective
Replace the `bun $` shell utility with `dax-sh` across the codebase to ensure consistent and potentially more robust shell command execution, including installing the `dax-sh` dependency.

# Open Questions
- [x] Are there any specific options for `dax-sh` that map 1:1 or differently from `bun $`?
- [x] Do we need to update any documentation regarding the switch?

# Tasks
- [x] **TS001**: Install `dax-sh` and remove usages `Bun.$` and `import { $ } from 'bun'`.
- [x] **TS002**: Run tests to verify that the replacement works as expected.

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

# Change Log
- 2026-01-08: Initial task setup
- 2026-01-08: Completed migration to dax-sh
---
