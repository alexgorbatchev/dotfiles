---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> dotfiles install zoxide
> INFO    [zoxide] mkdir ~/.dotfiles/.generated/binaries/zoxide/0.9.8
> Downloading zoxide-0.9.8-aarch64-apple-darwin.tar.gz |████████████████████████████████████████| 100% | 480166/480166 | 8.2 MB/s | ETA: 0s
> INFO    [zoxide] ln -s 0.9.8/zoxide ~/.dotfiles/.generated/binaries/zoxide/zoxide
> INFO    [zoxide] rm ~/.dotfiles/.generated/binaries/zoxide/0.9.8/zoxide-0.9.8-aarch64-apple-darwin.tar.gz
> sed: 1: "/Users/alex/.dot ...": command a expects \ followed by text
> ERROR   Installation failed [after-install hook] for tool "zoxide"
>
>  ShellError  Failed with exit code 1, [object Object], 1, , sed: 1: "/Users/alex/.dot ...": command a expects \ followed by text
> , ShellError, 75, 16
> error stack:
>   • native      new ShellPromise
>         native:75
>   • native      BunShell
>         native:191
>   • createConfiguredShell.ts    I
>         node_modules/@gitea/packages/installer/src/utils/createConfiguredShell.ts:18
>   • zoxide.tool.ts      <anonymous>
>         tools/core-system/zoxide/zoxide.tool.ts:16
>   • native      processTicksAndRejections
>         native:7
> INFO    Tool "zoxide" vv0.9.8 installed successfully using github-release
>
> if $ fails in a hook, i need to see its full shell output, not a stack trace as end user
>
> additionally, I DO want to see which line in the .tool.ts file is causing the issue, specifically we should use stack trace to find the line, then read the .tool.ts file and print 2 lines above and 2 lines below, with line numbers and error line highlighted in red and with > character, i think we can use @babel/code-frame to do this

# Primary Objective
Improve hook failure error reporting so that end users see full shell output (not a raw stack trace), and also see a small code-frame pinpointing the failing `.tool.ts` line.

# Open Questions
- [x] Should we display both `stdout` and `stderr` always, or only `stderr` unless `--log=trace` is enabled?
    - Display both when non-empty.
- [x] If the failing frame points into `node_modules/**` (not a `.tool.ts`), should we still show a code-frame (or only when a tool file frame exists)?
    - Show a code-frame only when a `.tool.ts` frame is present and readable.
- [x] Do you want ANSI colors even when output is piped (non-TTY), or should we auto-disable color in that case?
    - Keep ANSI enabled for the code-frame.

# Tasks
- [x] **TS001**: Identify the root cause of the hook failure reporting behavior
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
    - No public docs changes needed.
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree
    - Note: e2e tests can intermittently fail with `EADDRINUSE` on port `8765`; re-running resolves.
- [x] All acceptance criteria are met

# Change Log
- 2025-12-18: Task created
- 2025-12-18: Added failing test for hook ShellError user-facing output
- 2025-12-18: Print hook failure details via stdout and avoid stack trace in user logs
- 2025-12-18: Add `.tool.ts` code-frame output for hook failures based on stack trace
---
