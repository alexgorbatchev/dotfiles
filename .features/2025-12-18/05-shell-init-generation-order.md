---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> currently we generate shell main.zsh/bash/ps1 content during generate command, however that creates a problem... basically all actions such as generating shell completions, configs, etc inits rely on the tools already available... for example after i ran generate i ran this in a different project
>
> source ./.generated/shell-init/main.zsh
> __dotfiles_zoxide_always:source:1: no such file or directory: /Users/alex/.dotfiles/.generated/binaries/zoxide/zoxide-init
> __dotfiles_atuin_always:source:2: no such file or directory: /Users/alex/.dotfiles/.generated/binaries/atuin/init.zsh
>
> these files are created during after-install hook, but .zsh(shell...) specifies that they need to be included
>
> your job is to analyze the source and propose solutions, i have one in mind but want to hear you out first

# Primary Objective
Propose a robust fix for shell init generation so sourced shell init never references tool init files that do not exist yet.

# Open Questions
- [x] Soft-source: skip missing files silently
- [x] Shell init must be safe even if install hooks have not run yet
- [ ] PowerShell behavior will be handled in a follow-up

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Propose a solution and iterate with the user
- [x] **TS005**: Implement solution + update docs
- [x] **TS006**: Run `bun lint`, `bun typecheck`, `bun test`, `bun run build`

# Acceptance Criteria
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Tests do not print anything to console.
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
- 2025-12-18: Continue investigation
- 2025-12-18: Decide on unconditional safe source shim
- 2025-12-18: User requested autonomous completion
- 2025-12-18: Implement conditional `shell.source()` for zsh/bash + add tests + docs update
- 2025-12-19: Verify generated main.zsh after generate
- 2025-12-19: Add shell.source() to fnm test tool for demo
- 2025-12-19: Verify fix coverage by temporarily disabling it
---
