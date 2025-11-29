# User Prompt
> i need to be able to use context in args, i think this could be context similar to after-install hook, specifically need to have $extended and the dir where binary/curl was downloaded to because if we are generating something it should go into that folder, so args should be (ctx) => [] or []

# Primary Objective
Enable args parameter to accept both static arrays and context-aware functions `(ctx) => string[]` to support dynamic argument generation with access to extended context and download directories.

# Open Questions
- [x] Should the context be exactly the same as `after-install` hook context? **No - create new context**
- [x] Which installers need this feature? **Only curl-script**
- [x] Should we maintain backward compatibility with array-only args? **Yes**
- [x] What should be the exact shape of the context object passed to the args function? **projectConfig**

# Tasks
- [x] **TS001**: Identify current args usage in curl-script installer
- [x] **TS002**: Understand ProjectConfig structure and what context should be provided
- [x] **TS003**: Create failing test for args as a function with projectConfig context
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as I understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Update type definition to support `args: string[] | ((ctx: ArgsContext) => string[] | Promise<string[]>)`
- [x] **TS006**: Update schema to validate both array and function args
- [x] **TS007**: Update installFromCurlScript to resolve args function if provided
- [x] **TS008**: Update tests to verify both static and dynamic args
- [x] **TS009**: Update README documentation
- [x] **TS010**: Run full test suite and fix any issues

# Acceptance Criteria
- [x] Primary objective is met
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met
- [x] `bun test` command runs successfully in the new worktree

# Change Log
- Created feature branch and work file
- TS001: Identified curl-script uses args parameter, currently only supports string[]
- TS002: ProjectConfig includes paths, system, logging, updates, github, cargo, downloader, features configuration
- TS003: Created failing test for args as function with context
- TS004: Analyzed problem and proposed solution with async support
- TS005-TS010: Implemented full solution:
  - Created ICurlScriptArgsContext type with projectConfig, scriptPath, installDir
  - Updated CurlScriptInstallParams to support function args (sync/async)
  - Modified installFromCurlScript to resolve args functions
  - Added tests for both sync and async function args
  - Updated README with examples
  - All tests pass (1017 pass, 0 fail)
  - Type checking passes
  - Linting passes (pre-existing warnings in other packages)
