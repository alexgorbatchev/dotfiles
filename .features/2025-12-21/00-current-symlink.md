---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> currently when tools are downloaded, they are placed into binariesDir/toolName/<foo>/ and then a symlink is created to <foo>/bin, we need to create a new feature so that we keep binadiesDir/toolName/current symlink always pointing to <foo>, we then no longer need to have a binary symlink in binadiesDir/toolName/bin-name, because having a stable `current` pointing to the versioned or timestamped folder allows our shims to properly point to the binary via `current`

# Primary Objective
Add a stable `current` symlink under each tool directory and migrate shim/binary resolution to use `binariesDir/toolName/current/...`, removing the per-binary symlinks under `binariesDir/toolName/*`.

# Open Questions
- [x] `current` points to the version/timestamp folder root (`<foo>`). Shims should execute `binariesDir/toolName/current/<binaryName>`.
- [x] Remove legacy per-binary symlinks entirely.
- [x] Do not change upgrade behavior; only rework symlinking.
- [x] Shim generation will be updated so shims in PATH execute the resolved binary path within `current/` (not via legacy `binariesDir/toolName/<binaryName>`).

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Implement `binariesDir/toolName/current -> <foo>` symlink update after install/rename
- [x] **TS007**: Remove per-binary symlinks at `binariesDir/toolName/<binaryName>` and adjust installer setup to only create symlinks inside the install folder
- [x] **TS008**: Update shim generation to resolve the executable path within `current/` and hardcode that resolved path in each shim
- [x] **TS009**: Update unit + e2e tests for new `current` layout and remove legacy assertions
- [x] **TS010**: Update docs describing binaries/shim resolution paths
- [x] **TS011**: Run `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`

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
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Tests do not print anything to console.

# Change Log
- 2025-12-21: Captured requirements for `current` symlink layout and no-legacy constraint.
- 2025-12-21: Added failing tests asserting symlinks live under `.../<version-or-timestamp>/` (not at tool dir root).
- 2025-12-21: Finalized implementation task breakdown for `current` symlink and shim resolution changes.
- 2025-12-21: Updated docs and README examples to use `current/` and entrypoint executables.
---
