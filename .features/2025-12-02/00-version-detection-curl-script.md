# User Prompt
> Follow instructions in [alex--feature--new.prompt.md](file:///Users/alex/.dotfiles/instructions/chat/prompts/alex--feature--new.prompt.md).
> - INFO    Tool "fnm" >>>vunknown<<< installed successfully using curl-script 
> 
> when installing from curl, we should try calling --version on the tool... im wondering if this could be done to also determine the version used for the folder creation because currently we use fnm/timestamp, but if fnm --version could be obtained, we could create fnm/version instead, which would be a much better end user experience, investigate

# Primary Objective
Implement version detection for curl-script installations by calling `--version` on installed tools to create version-based directories (e.g., `fnm/18.0.0`) instead of timestamp-based directories (e.g., `fnm/20251202-123456`).

# Open Questions
- [x] Should we make version detection optional or mandatory for curl-script installations? **Optional (fall back to timestamp)**
- [x] What should happen if `--version` call fails - fall back to timestamp or fail the installation? **Fall back to timestamp**
- [x] Should we support other version flag patterns like `-v`, `-V`, `version`? **Yes, try all patterns**
- [x] Should this approach be extended to other installer types beyond curl-script? **Yes: curl-script, curl-tar, and brew**

# Tasks
- [x] **TS001**: Identify the root cause - understand why curl-script uses timestamps instead of version directories
- [x] **TS002**: Investigate current version resolution implementation across installer plugins
- [x] **TS003**: Create shared utility for detecting version via CLI flags (`--version`, `-v`, `-V`, `version`)
- [x] **TS004**: Implement `resolveVersion` for curl-script installer (implemented via post-install detection)
- [x] **TS005**: Implement `resolveVersion` for curl-tar installer
- [x] **TS006**: Implement `resolveVersion` for brew installer
- [x] **TS007**: Add tests for curl-script version resolution
- [x] **TS008**: Add tests for curl-tar version resolution
- [x] **TS009**: Add tests for brew version resolution
- [x] **TS010**: Add e2e test scenario for version detection with fnm
- [x] **TS011**: Verify e2e tests pass after implementing resolveVersion
- [x] **TS012**: Update documentation for new version detection capability
- [x] **TS013**: Refactor E2E tests for version detection (generic scenarios)
- [x] **TS014**: Update `detectVersionViaCli` to throw error on regex failure
- [x] **TS015**: Update `Installer` to rename timestamped directories to versioned directories
- [x] **TS016**: Simplify `normalizeVersion` to only ensure path safety
- [x] **TS017**: Refactor version detection test tools to include installer name (e.g., `version-detection--curl-script--*`)
- [x] **TS018**: Add version detection tests for curl-tar installer
- [x] **TS019**: Add version detection tests for brew installer (brew uses `brew info` for version detection - already implemented)

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
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree

# Change Log
- Created feature branch and worktree for version detection in curl-script installations
- TS001: Investigated Installer.ts - found existing `resolveVersion` infrastructure that falls back to timestamps
- TS002: Confirmed GitHub Release and Cargo already implement `resolveVersion`, brew/curl-script/curl-tar do not
- Clarified requirements: optional version detection, fallback to timestamp, support multiple flags, implement for curl-script/curl-tar/brew
- TS003: Created `detectVersionViaCli` utility in packages/utils with comprehensive tests (22 tests passing)
  - Supports multiple version flags: --version, -v, -V, version
  - Extracts versions from CLI output using regex patterns
  - Makes versions filesystem-safe by replacing unsafe characters with hyphens
  - Handles semver with prerelease and build metadata (e.g., 1.2.3-beta.1+build.123)
  - Includes timeout support and error handling
  - All tests pass, typecheck and lint clean
- TS010: Added e2e test scenario `versionDetectionScenarios` for fnm
  - Tests version-based directory creation (e.g., fnm/1.37.2 not fnm/20251202-123456)
  - Verifies filesystem-safe version strings
  - Tests reinstall behavior (directory reuse)
  - Added `executeCommand` helper method to TestHarness
  - Tests will pass once TS004-TS006 are implemented
- TS013: Refactored E2E tests to use generic `version-detection` scenarios instead of specific `fnm` tests
- TS014: Updated `detectVersionViaCli` to throw explicit errors when regex fails, preventing silent fallbacks
- TS015: Updated `Installer` to rename timestamped directories to versioned directories after successful installation
- TS016: Simplified `normalizeVersion` to only handle path safety, removing semver logic
- TS011: Verified E2E tests pass with the new implementation
