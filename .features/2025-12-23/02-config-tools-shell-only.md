# Task Prompt

> Follow instructions in alex--feature--new.prompt.md.
> i want to add support for configuration tools only that don't install anything, they should only contribute to shell files but skip shims and install pipeline, for example
>
> install()
> .zsh((shell) =>
> shell
> .environment({ ... })

# Primary Objective

Add support for config-only tools that contribute shell configuration but do not install binaries or generate shims.

# Open Questions

- [ ] How should a tool be marked as "config-only" (explicit flag in tool definition vs inferred from missing installers/binaries)?
- [ ] Should config-only tools still be allowed to define installers (and just skip them), or should it be a hard validation error to define installers/binaries when config-only?
- [ ] Should config-only tools participate in any version checking / update logic, or be entirely excluded from install/version flows?

# Tasks

- [x] **TS001**: Identify the root cause of the problem
  - [x] Locate how config-only tools are represented in ToolConfig
  - [x] Confirm `install()` with no args is currently mapped to `installationMethod="manual"` and empty params
  - [x] Identify why `dotfiles install <tool>` still calls the installer for config-only tools
- [x] **TS002**: Create a failing test to isolate the problem
  - [x] Add a CLI test where a tool config is produced via `install()` (no args)
  - [x] Assert the install command should not call the installer for that tool
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
  - [x] Verify the new test fails because the installer is invoked
- [x] **TS004**: Decide on a solution
  - [x] Treat "manual + empty installParams + no binaries" as configuration-only
  - [x] Skip the installer and completion generation in the `install` command
- [x] **TS005**: Implement the pipeline change
  - [x] Skip install in `packages/cli/src/installCommand.ts`
  - [x] Add a log message for the skipped case
- [x] **TS006**: Update tests and docs
  - [x] Update CLI tests
  - [x] Document configuration-only tools in `docs/typescript.md`
- [x] **TS007**: Run quality gates in the new worktree
  - [x] `bun fix`
  - [x] `bun lint`
  - [x] `bun typecheck`
  - [x] `bun test`
  - [x] `bun run build`
  - [x] `bun run test-project -- generate` and verify `test-project/.generated` is created correctly
- [ ] **TS009**: Run quality gates in the new worktree
  - [ ] `bun lint`
  - [ ] `bun typecheck`
  - [ ] `bun test`
  - [ ] `bun run build`
  - [ ] `bun test-project` and verify `.generated` is created correctly

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
- [x] Use `bun run test-project -- generate` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log

- Initialized task file
- Added config-only tool install skipping (CLI)
- Ran full quality gates (fix/lint/typecheck/test/build/test-project)
