# User Prompt
> current files command takes --tool tool-name, i want to remove --tool so that cli files tool-name is supported

# Primary Objective
Update the `files` command to accept the tool name as a positional argument instead of requiring the `--tool` flag, changing from `dotfiles files --tool fzf` to `dotfiles files fzf`.

# Open Questions
- [x] Should the command still accept both `--tool <name>` and the positional argument for backward compatibility? **No, remove --tool completely**
- [x] Should we update documentation and examples accordingly? **Yes**
- [x] Are there any other commands that use similar patterns that should be updated for consistency? **No**

# Tasks
- [x] **TS001**: Update `filesCommand.ts` to accept tool name as positional argument
- [x] **TS002**: Update `IFilesCommandSpecificOptions` interface in `types.ts` to reflect the change
- [x] **TS003**: Update command registration to accept positional argument
- [x] **TS004**: Update tests for the `files` command
- [x] **TS005**: Run tests to ensure all changes work correctly
- [x] **TS006**: Run linter and fix any issues
- [x] **TS007**: Update documentation (README.md, AGENTS.md) with new syntax

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met
- [x] Command accepts `dotfiles files <tool-name>` syntax
- [x] Backward compatibility maintained if decided
- [x] Documentation updated

# Change Log
- Created feature branch and work file
- Updated `filesCommand.ts` to accept tool name as positional argument instead of `--tool` flag
- Updated `IFilesCommandSpecificOptions` interface to document tool as positional argument
- Updated `filesCommand.test.ts` to verify `--tool` flag is not present
- Updated `packages/cli/README.md` and `packages/cli/AGENTS.md` with new syntax examples
- Verified docs already had correct syntax
- All tests passing (filesCommand.test.ts and related), linter clean
