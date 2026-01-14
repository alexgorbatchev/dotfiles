# Task Prompt

> install('github-release', { repo: 'oven-sh/bun', assetPattern: '' }) need to support regex for assetPattern here and in all other installers
> one more thing. regex should be against the same path value that current assetselector glob is used with

# Primary Objective

Add regex support for `assetPattern` across all installers that select release assets, without changing which path/value is matched compared to the existing glob-based selector.

# Open Questions

- [x] How should users specify regex patterns in config?
  - [x] Option A: allow `assetPattern: /.../` as a real `RegExp` in TypeScript configs.
  - [x] Option B (partial): support regex-as-string in the `/pattern/flags` form.
- [x] If regex is supported as string, do we need flags (e.g. `i`, `m`), and what is the string syntax?
  - [x] Yes; support `/pattern/flags` with standard JS flags.

# Tasks

- [x] **TS001**: Identify the root cause of the limitation (glob-only matching) and catalog all installer code paths that consume `assetPattern`.
  - [x] Locate the asset selection implementation and confirm what "path" value the glob matches today.
  - [x] Enumerate all installers/options that use `assetPattern` (GitHub releases and any other release-asset selectors).
- [x] **TS002**: Create a failing test to isolate the problem.
  - [x] Add a test that configures `assetPattern` as a regex and asserts the correct asset is selected.
  - [x] Add a test that confirms the regex matches the same "path" field used by the existing glob matcher.
  - [x] If a failing test cannot be created (e.g. selection is not unit-testable), STOP and report back.
- [x] **TS003**: Confirm the root cause of the problem based on the failing test.
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
  - Describe the problem as you understand it
  - Describe proposed solution
  - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution.
  - [x] Implement the pattern-matching change behind a single shared helper used by all relevant installers.
  - [x] Update config/zod schemas + TypeScript types to accept regex (and/or regex-as-string, per decision).
  - [x] Update docs and examples where `assetPattern` appears.
  - [x] Run `bun lint`, `bun typecheck`, `bun test`, and `bun run build` in the new worktree.

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
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log

- 2025-12-23: Initialized worktree and created task file.
- 2025-12-23: Added regex support for `assetPattern` (RegExp + `/pattern/flags` string), updated docs, and verified lint/typecheck/tests/build.
- 2025-12-23: Updated `docs/` to document regex `assetPattern` support.
