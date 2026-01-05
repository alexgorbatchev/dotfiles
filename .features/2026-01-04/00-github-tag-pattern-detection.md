# Task
> GitHub Release Installer: Implement automatic tag pattern detection to handle repositories using different release tag conventions (v-prefix, tool-name prefix, no prefix).

# Primary Objective
Implement automatic tag pattern detection in the GitHub release installer to resolve version lookup failures when user-provided versions don't match the repository's actual tag format.

# Open Questions
- [x] How to efficiently detect the tag pattern without hitting API rate limits? → Use HEAD request to `github.com/{owner}/{repo}/releases/latest` which redirects to the actual tag (free, no API quota)
- [x] What patterns need to be supported? → `v{version}`, `{toolname}-{version}`, `{version}` (no prefix)
- [x] What to do when pattern detection fails? → Show up to 5 latest release tags to the user via `logger.info`

# Tasks
- [ ] **TS001**: Create `probeTagPattern` function in `GitHubApiClient`
    - Function signature: `probeTagPattern(owner: string, repo: string): Promise<string | null>`
    - Uses HEAD request to `https://github.com/{owner}/{repo}/releases/latest`
    - Extracts tag from `Location` header (e.g., `https://github.com/owner/repo/releases/tag/v1.2.3` → `v1.2.3`)
    - Returns `null` if no redirect or pattern detection fails
    - This does NOT count against GitHub API rate limits

- [ ] **TS002**: Create `detectTagPrefix` utility function
    - Function signature: `detectTagPrefix(latestTag: string): string`
    - Finds where semver-like pattern starts in the tag using regex: `/\d+\.\d+(\.\d+)?(-[\w.]+)?/`
    - Returns everything before the semver match as the prefix
    - Examples:
      - `v2.24.0` → prefix: `v`
      - `jq-1.8.1` → prefix: `jq-`
      - `15.1.0` → prefix: `` (empty)
      - `release-v1.0.0` → prefix: `release-v`

- [ ] **TS003**: Create `normalizeUserVersion` utility function
    - Function signature: `normalizeUserVersion(userVersion: string): string`
    - Strips common prefixes user might include (e.g., `v` prefix)
    - Returns clean version number

- [ ] **TS004**: Create `buildCorrectedTag` function
    - Function signature: `buildCorrectedTag(prefix: string, userVersion: string): string`
    - Combines detected prefix with normalized user version
    - Example: prefix `v` + user version `2.23.0` → `v2.23.0`

- [ ] **TS005**: Create `fetchLatestReleaseTags` function
    - Function signature: `fetchLatestReleaseTags(owner: string, repo: string, count: number): Promise<string[]>`
    - Uses existing `getAllReleases` with `perPage: count`
    - Returns array of tag names for display to user when all detection fails

- [ ] **TS006**: Update `fetchGitHubRelease` in `installFromGitHubRelease.ts`
    - Current flow:
      1. Try exact tag → return if found
      2. Return error if not found
    - New flow:
      1. Try exact tag → return if found
      2. Probe tag pattern via HEAD request (free)
      3. Detect prefix and build corrected tag
      4. Try corrected tag → return if found
      5. If still not found, fetch and display up to 5 latest tags via `logger.info`
      6. Return error

- [ ] **TS007**: Add log messages for tag pattern detection
    - `tagPatternProbing(owner, repo)` - DEBUG: "Probing release tag pattern for {owner}/{repo}"
    - `tagPatternDetected(prefix)` - DEBUG: "Detected tag prefix: '{prefix}'"
    - `tagPatternRetrying(correctedTag)` - DEBUG: "Retrying with corrected tag: {correctedTag}"
    - `availableReleaseTags()` - INFO: "Available release tags:"
    - `releaseTag(tag)` - INFO: "  - {tag}"

- [ ] **TS008**: Write unit tests for `detectTagPrefix`
    - Test cases:
      - `v2.24.0` → `v`
      - `jq-1.8.1` → `jq-`
      - `15.1.0` → ``
      - `release-v1.0.0` → `release-v`
      - `nightly` → `` (no semver found)
      - `stable` → `` (no semver found)

- [ ] **TS009**: Write unit tests for `probeTagPattern`
    - Test with mocked HEAD responses
    - Test redirect parsing
    - Test error handling (no redirect, network error)

- [ ] **TS010**: Write unit tests for updated `fetchGitHubRelease`
    - Test exact match succeeds (no probe needed)
    - Test fallback to pattern detection
    - Test corrected tag succeeds
    - Test display of available tags when all fails

- [ ] **TS011**: Write integration test with real repositories
    - Test `denisidoro/navi` (v prefix)
    - Test `BurntSushi/ripgrep` (no prefix)
    - Test `jqlang/jq` (tool-name prefix)

- [ ] **TS012**: Update documentation
    - Document that users can specify versions with or without `v` prefix
    - Document the automatic pattern detection behavior
    - Add troubleshooting section for tag mismatches

# Acceptance Criteria
- [ ] Primary objective is met
- [ ] All temporary code is removed
- [ ] All tasks are complete
- [ ] Tests added for all new production features
- [ ] Related READMEs and docs are updated
- [ ] All code quality standards are met
- [ ] All changes are checked into source control
- [ ] All tests pass
- [ ] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree
- [ ] `bun run build` completes successfully
- [ ] `.dist/cli.js` contains no external dependencies
- [ ] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly
- [ ] Tests do not print anything to console
- [ ] Installing `navi` with `version: '2.23.0'` succeeds (v-prefix repo)
- [ ] Installing `ripgrep` with `version: 'v15.1.0'` succeeds (no-prefix repo)
- [ ] When version doesn't exist, user sees up to 5 available tags

# Change Log
- Initial task file created with comprehensive breakdown of implementation tasks
