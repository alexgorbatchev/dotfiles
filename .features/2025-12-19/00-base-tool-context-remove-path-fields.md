---
# User Prompt
> Follow instructions in alex--feature--new.prompt.md.
> 
> remove
> 
>   /**
>    * The absolute path to the user's home directory, as defined in the
>    * application configuration (`projectConfig.paths.homeDir`).
>    */
>   homeDir: string;
> 
>   /**
>    * The absolute path to the directory where generated binaries (shims) are
>    * stored, as defined in `projectConfig.paths.binariesDir`.
>    */
>   binDir: string;
> 
>   /**
>    * The absolute path to the directory where generated shell scripts are
>    * stored, as defined in `projectConfig.paths.shellScriptsDir`.
>    */
>   shellScriptsDir: string;
> 
>   /**
>    * The absolute path to the root directory containing the user's dotfiles,
>    * as defined in `projectConfig.paths.dotfilesDir`).
>    */
>   dotfilesDir: string;
> 
>   /**
>    * The absolute path to the directory where all generated files are stored,
>    * as defined in `projectConfig.paths.generatedDir`.
>    */
>   generatedDir: string;
> 
> from IBaseToolContext, projectConfig already provides these values

# Primary Objective
Remove redundant path fields from `IBaseToolContext` and update all usages to use `projectConfig.paths.*` instead.

# Open Questions

# Tasks
- [x] **TS001**: Identify the root cause of the problem
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
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Tests do not print anything to console.

# Change Log
- Initialized feature work file.
- Identified root cause: `IBaseToolContext` duplicates path values already available via `projectConfig.paths.*`.
- Added a typecheck-based failing test asserting those redundant keys must be absent.
- Confirmed root cause: `IBaseToolContext` currently includes the redundant keys, causing `bun typecheck` to fail.
- Implemented the breaking change: removed redundant path fields from `IBaseToolContext` and updated all call sites.
- Updated tests/helpers/mocks to stop constructing contexts with removed fields.
- Verified `bun fix`, `bun lint`, `bun typecheck`, `bun test`, and `bun run build` in the feature worktree.
---
