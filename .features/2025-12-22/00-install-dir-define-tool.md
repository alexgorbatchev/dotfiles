---
# Task Prompt
> We currently expose an ambiguous “install directory” concept across multiple contexts. The stable path should be `currentDir` on the `defineTool(..., ctx)` context, while installers/hooks should use `stagingDir` (UUID) during install attempts and `installedDir` (versioned) after a successful install. Audit installers for custom path assumptions and remove legacy fields so the model is unambiguous.

# Primary Objective
Remove the legacy install-directory field as an overloaded concept and replace it with unambiguous paths:
- `currentDir` is the only stable path (symlink) exposed in `defineTool(..., ctx)`.
- Installers/hooks use `stagingDir` (UUID) during install attempts and `installedDir` (versioned) after a successful install.

Result: one single source of truth for stable location (`currentDir`) and no ambiguity about where installs happen.

# Open Questions
- [x] Versioned directories are required when version is available (critical UX).
- [x] `stagingDir` must be UUID-based.
- [x] Retention behavior must not change.
- [x] No aliases/back-compat fields; remove ambiguity entirely.

# Decisions / Invariants (Must Hold)
- **Stable path (single source of truth):** `currentDir` from `IBaseToolContext` remains the only stable path.
    - Definition: `currentDir === path.join(projectConfig.paths.binariesDir, toolName, 'current')`
    - It is a symlink updated only after a successful install.

- **Tool root dir:** `toolRootDir === path.join(projectConfig.paths.binariesDir, toolName)`

- **Staging directory:**
    - `stagingDir` is UUID-based and unique per install attempt.
    - Directory layout is fixed:
        - `stagingDir === path.join(toolRootDir, <uuid>)`
    - UUID generation must use `crypto.randomUUID()` (no custom generator).

- **Installed directory (final):**
    - For managed installers, `installedDir` is always versioned when a version is known.
    - Definition: `installedDir === path.join(toolRootDir, <version>)` where `<version>` is normalized.

- **Version resolution precedence (for directory naming):**
    1) If `toolConfig.version` is set and is not `'latest'`, that version is used for `installedDir`.
    2) Else, if plugin supports pre-install resolution (`plugin.resolveVersion`) and returns a value, use it.
    3) Else, install into `stagingDir`, then detect version post-install (CLI/metadata), then rename to versioned `installedDir`.

- **Externally managed installers (e.g., brew):**
    - They do not download/extract into our directories, but we still maintain stable shims.
    - `installedDir` for externally managed installs is:
        - `installedDir === path.join(toolRootDir, 'external')`
    - `currentDir` must point to `installedDir` (`external`) after success.
    - Entry points in `installedDir` must be created to execute the real external binaries.
    - No retention behavior changes.

- **No legacy / clean slate:**
    - No legacy install-directory field anywhere in production types, runtime contexts, plugins, utilities, docs, or tests.
    - No compatibility properties, aliases, or optional fallbacks for removed fields.
    - A repo-wide search for the legacy token must return 0 matches outside historical git history.

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Redesign context types (clean slate; no compat)
    - [x] Update [packages/core/src/installer/installHooks.types.ts](packages/core/src/installer/installHooks.types.ts) as follows:
        - [x] **Remove** from `IInstallContext`: legacy install-directory field
        - [x] **Add** to `IInstallContext`: `stagingDir: string` (absolute path, always `path.join(toolRootDir, <uuid>)`)
        - [x] Keep `timestamp: string` (used for logs/registry; retention unchanged)
        - [x] `IDownloadContext` and `IExtractContext` continue to extend `IInstallContext` and therefore *must* use `stagingDir` (no other install path fields)
        - [x] Update `IAfterInstallContext` to be success-only:
            - [x] `IAfterInstallContext` must include `installedDir: string` (versioned dir)
            - [x] `IAfterInstallContext` must NOT include `stagingDir`
            - [x] `after-install` hooks must run only when install succeeded
            - [x] `IAfterInstallContext` must include `binaryPaths` (or equivalent) resolved against `installedDir`, never `stagingDir`
        - [x] Update `AsyncInstallHook<T extends IInstallContext = IInstallContext>` constraints as needed so hooks can still be stored/executed without type assertions.
    - [x] Delete any legacy install-directory fields from any other context types (e.g. `packages/installer-curl-script/src/types/ICurlScriptArgsContext.ts`) and replace with `stagingDir` (or `installedDir` where appropriate).
    - [x] Enforce “no legacy”:
        - [x] No aliases
        - [x] No deprecated properties
        - [x] No backward-compatible union fields for removed properties
        - [x] Update every call site in the same session.

- [x] **TS007**: Update installer lifecycle to use UUID staging + versioned installed dir (no mutation of staging)
    - [x] In [packages/installer/src/Installer.ts](packages/installer/src/Installer.ts):
        - [x] Compute `toolRootDir` and ensure it exists
        - [x] Generate UUID and set `stagingDir === toolRootDir/<uuid>` for each install attempt
        - [x] Use `stagingDir` for download/extract/install steps and for PATH prepending during the attempt
        - [x] Resolve/detect the version; compute `installedDir = binariesDir/<tool>/<version>`
        - [x] If installing to `stagingDir`, rename `stagingDir -> installedDir` (do not “mutate” stagingDir variable; produce a new `installedDir` value)
        - [x] Repoint `currentDir` symlink to `installedDir` (retention unchanged)
        - [x] Ensure registry records use `installedDir` (final path)
        - [x] Ensure after-install hook runs only on success and receives `IAfterInstallContext` with `installedDir`
        - [x] Externally managed plugins:
            - [x] Skip staging download/extract work
            - [x] Set `installedDir === toolRootDir/external` and ensure it exists
            - [x] Ensure entrypoints are created in `installedDir`
            - [x] Point `currentDir` to `installedDir`

- [x] **TS008**: Update all installer plugins to the new context semantics (no legacy install-directory field remaining)
    - [x] curl-tar: use `stagingDir` for tarball download/extract destination; success context uses `installedDir`
    - [x] curl-script: env `INSTALL_DIR` must be set to `stagingDir`; binary discovery uses `installedDir` after success
    - [x] cargo: download/extract into `stagingDir`; rename to `installedDir` once version known
    - [x] github-release: install/extract into `stagingDir`; rename to `installedDir`; fix update() so it does not treat any context field as “binaries root”
    - [x] manual: binary path computations use `installedDir` after success
    - [x] brew: confirm it uses externally-managed semantics; ensure hooks still receive consistent contexts without legacy fields

- [x] **TS009**: Update installer utilities/helpers to stop assuming a legacy install-directory field
    - [x] `getBinaryPaths(...)` signature and callers: replace legacy parameter with `installedDir`
    - [x] `setupBinariesFromArchive(...)` and `setupBinariesFromDirectDownload(...)`: take explicit `stagingDir` and/or `installedDir` (no reliance on parsing directory name from context)
    - [x] Entry point creation / shim expectations: ensure stable entrypoints are created in a consistent place relative to `installedDir` and `currentDir`

- [x] **TS010**: Update tests + fixtures (no legacy install-directory token references anywhere)
    - [x] Replace all test contexts and helpers that build the legacy install-directory field with phase-correct `{ stagingDir: ... }` or `{ installedDir: ... }`
    - [x] Update hook integration tests to use union-aware assertions (`assert(result.success)` etc.) without `if` blocks
    - [x] Replace the failing core test added in TS002 with a correct assertion about `currentDir` being present on `defineTool` context AND that parsing an object containing the removed legacy field fails.
    - [x] Pre-merge checklist (do not commit as a test): verify the legacy token search yields 0 results.

- [x] **TS011**: Update docs/examples (remove all mention of legacy install-directory token)
    - [x] Replace examples in docs that reference a legacy install-directory token with `currentDir` (stable) and/or `stagingDir` (hook-only) depending on the phase being described.
    - [x] Ensure prompts/templates are updated similarly (no legacy references).
- [x] **TS012**: Run full validation in worktree: `bun fix`, `bun lint`, `bun typecheck`, `bun test`, `bun run build`

# Acceptance Criteria
- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [ ] All changes are checked into source control
- [x] All tests pass
- [ ] All acceptance criteria are met

**Acceptance Criteria**
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Tests do not print anything to console.

# Change Log
- 2025-12-22: Initialize task file
- 2025-12-22: TS001 - Stable vs transient install paths were ambiguous (define-tool vs installer vs update code)
- 2025-12-22: TS002 - Add failing test asserting `createToolConfigContext()` exposes a stable install path
- 2025-12-22: TS003 - Failing test confirms define-tool context did not expose the expected stable path
- 2025-12-22: TS004/TS005 - Align on `currentDir` (stable) + UUID `stagingDir` + versioned `installedDir` (no aliases, no retention change)
- 2025-12-22: TS006 - Context types redesigned: UUID staging for install phases; success-only after-install context contains installedDir + binaryPaths
- 2025-12-22: TS007 - Installer updated to use stagingDir per attempt and installedDir after version resolution; currentDir repointed on success
- 2025-12-22: TS008 - Installer plugins updated to use stagingDir during install and installedDir after success
- 2025-12-22: TS009 - Utilities updated to take explicit stagingDir/installedDir and stop assuming removed fields
- 2025-12-22: TS010 - Tests updated and legacy token removed from tracked sources
- 2025-12-22: TS011 - Docs/prompts/READMEs updated to document currentDir/stagingDir/installedDir
- 2025-12-22: TS012 - Validation run: bun fix, bun lint, bun typecheck, bun test, bun run build
---
