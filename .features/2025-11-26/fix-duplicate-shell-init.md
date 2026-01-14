---
# User Prompt
> when ~/.zshrc file is updated, the tool may write multiple
>
> # Generated via dotfiles generator - do not modify
> # /Users/alex/Development/github/dotfiles-tool-installer/test-project/config.ts
> # ------------------------------------------------------------------------------
> source "/Users/alex/Development/github/dotfiles-tool-installer/test-project/.generated/shell-scripts/main.zsh"
>
> # Generated via dotfiles generator - do not modify
> # /Users/alex/.dotfiles/config.ts
> # ------------------------------------------------------------------------------
> source "/Users/alex/.dotfiles/.generated/shell-init/main.zsh"
>
>
> this shouldn't happen, it should update the source if it already exists, so i think we need a bit of special markers here, we can remove config path from the comment so that the header is constant and use it to identify existing source and update it maybe, make a test, then implement

# Primary Objective
Prevent the dotfiles generator from adding duplicate shell initialization entries to shell config files (e.g. ~/.zshrc) by using a constant header marker to identify and update existing blocks.

# Open Questions
- [ ] None

# Tasks
- [x] **TS001**: Create a reproduction test case where `~/.zshrc` gets duplicate entries.
- [x] **TS002**: Modify the shell init generator to use a constant header (removing the config path from the comment).
- [x] **TS003**: Implement logic to detect existing block using the constant header and update it instead of appending.
- [x] **TS004**: Verify the fix with the test case.

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met

# Change Log
- Initialized work file.
- Created reproduction test case `ProfileUpdater--duplicate-entries.test.ts`.
- Modified `shellTemplates.ts` to remove config path from header.
- Modified `ProfileUpdater.ts` to replace existing blocks instead of appending.
- Updated existing tests to match new header format.
- Verified all tests pass.
---
