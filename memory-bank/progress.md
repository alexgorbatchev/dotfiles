# Progress

This document tracks the current status, what works, what's left to build, and known issues for the dotfiles project, focusing on the development of the new TypeScript/Bun management tool.

## Current Status

The project is currently focused on refactoring the `src` directory into a modular structure, as detailed in `memory-bank/module-refactor-plan.md`. This involves reorganizing existing utilities and configuration files into distinct modules under `src/modules/` before proceeding with the implementation of new core services. Core Memory Bank files and `.roorules` are up-to-date. The high-level architectural goal of a shim-based execution system with centralized tool configuration remains, informed by a completed Zinit analysis.

## What Works
- **Dependency Injection & Service Setup:** Command action handlers now use `setupServices` from [`cli.ts`](src/cli.ts:1) to get command-specific service instances. Most `register...Command` functions are simplified.
- **Client Logger Instantiation:** Each command action handler creates its own `clientLogger` for user-facing output, configured by command-specific options (`--verbose`, `--quiet`).
- **Test Spy Management:** Robust spy hygiene practices are in place in [`cli.test.ts`](src/__tests__/cli.test.ts:1) using `mockRestore()` and `mockReset()`.
- **Refactored `cleanupCommand.ts`:** The `cleanupCommand.ts` file has been refactored to follow the same pattern as other commands by using `setupServices` in its action handler rather than receiving dependencies directly. This includes adding interfaces for services and options, creating a separate function for command logic, and updating the `registerCleanupCommand` function to only take the `program` parameter.
- **Standardized CLI Logging:** The CLI uses `clientLogger` for consistent output, respecting verbosity flags and `NODE_ENV=test`.
- **`install` Command Verbosity Control:** Supports `--verbose` and `--quiet` for detailed or suppressed output.
- **`check-updates` Command:** Fully implemented, tested, and integrated with the new DI and logger patterns. The command can check for updates for a specific tool or all configured tools, with support for GitHub releases. It handles tools configured with specific versions or 'latest', provides appropriate messaging for different update statuses (newer available, up-to-date, ahead of latest), and gracefully handles errors (config not found, API errors, unsupported installation methods).
- The core Memory Bank structure is in place and reflects the current project understanding.
- `.roorules` are defined and have been recently clarified, governing file structure, testing, and development workflow.
- High-level project goals, intended system patterns, and the chosen tech stack (TypeScript, Bun) are documented.
- Initial project setup for the `` directory is complete:
    - Bun project initialized (`bun init`).
    - TypeScript configuration (`tsconfig.json`) set up and refined.
    - `package.json` created with basic scripts (test, lint, fmt).
    - Necessary development dependencies (including `@types/bun`, `@types/node`, `eslint`, `prettier`, `zod`, `debug`, `dotenv`, etc.) are installed.
    - A `.env` file for configuration has been created.
    - The `.generated` directory structure for output artifacts is established.
    - The `src` directory and its basic subdirectories (`utils`, `__tests__`, etc.) have been created.
- **Core Foundational Modules Implemented:**
    - `src/types.ts`: Core type definitions established, including architecture-related types.
    - `src/utils/createLogger.ts` (and tests): Logging utility implemented and tested.
    - `src/config.ts` (and tests): Configuration module implemented with functional purity, Zod validation, and comprehensive tests.
    - `src/utils/getArchitectureRegex.ts` (and tests): Architecture detection utility for GitHub release asset matching, based on Zinit's `.zi::get-architecture` function.
    - `src/toolConfigBuilder.ts` (and tests): Implemented `ToolConfigBuilder` for defining tool configurations.
- **Development Guidelines Updated:**
    - `.roorules` updated for task granularity, TDD, JSDoc, functional purity, and `%mb` alias.
- All new foundational modules are lint-free with 100% test coverage.
- **Zinit Analysis Completed:**
    - Comprehensive analysis of `zinit-install.zsh.adoc` documented in `docs/zinit-analysis-consolidated.md`.
    - Type definitions summarized in `memory-bank/types-summary.md`.
    - Core types and interfaces updated in `src/types.ts` and `src/config.ts` with new requirements from Zinit analysis.
    - **Module Refactoring Plan Created:** A detailed plan for restructuring `src` into modules is documented in `memory-bank/module-refactor-plan.md`.
- **Application Tests:** All 446 application tests are passing.
- **Linting:** All linting errors have been resolved.

## Recent Features

- **Unified Platform-Specific ToolConfigBuilder:**  
  The `.platform()` method in `ToolConfigBuilder` now enables platform- and architecture-specific tool configuration via a unified builder interface.  
  This eliminates the need for a separate `PlatformConfigBuilder`, reduces code duplication, and ensures type safety.  
  All platform-specific logic is now handled through the main builder, with full test coverage and strict validation.  
  See [docs/toolConfigBuilder-platform-analysis.md](../docs/toolConfigBuilder-platform-analysis.md) for a detailed technical analysis and rationale.
- **Global `--config` CLI Option:**
 - Implemented a global `--config <path>` option in [`src/cli.ts`](src/cli.ts:1) using Commander.js.
 - The option allows specifying a configuration file path, which is logged via `clientLogger.info()` using an `option:config` hook.
 - Tests for this option are in a dedicated file: [`src/__tests__/cli--config.test.ts`](src/__tests__/cli--config.test.ts:1).
 - Resolved test isolation issues with Commander.js by instantiating `new Command()` within the `main()` function in [`src/cli.ts`](src/cli.ts:1), ensuring each test run gets a fresh `program` instance.
## What's Left to Build (Detailed Tasks)

1.  **Project Setup:** (All sub-tasks considered complete for this initial phase)
    * [x] Create the main project directory for the TypeScript/Bun tool (``).
    * [x] Initialize a Bun project (`bun init`) inside ``.
    * [x] Set up TypeScript configuration (`tsconfig.json`) inside ``.
    * [x] Install necessary dependencies inside ``.
    * [x] Set up `package.json` scripts.
    * [x] Create a `.env` file.
    * [x] Create the `.generated` directory structure.

2.  **Refactor `src` into Modules (Adhering to `.roorules` and `module-refactor-plan.md`):**
    * [x] Create the `src/modules/` directory (implicitly created by file writes).
    * [x] Refactor `src/utils/createLogger.ts` into `src/modules/logger/`.
        * [x] Create `src/modules/logger/index.ts`.
        * [x] Move `createLogger.ts` to `src/modules/logger/createLogger.ts`.
        * [x] Move `src/utils/__tests__/createLogger.test.ts` to `src/modules/logger/__tests__/createLogger.test.ts`.
        * [x] Update imports and run tests.
    * [x] Refactor `src/utils/getArchitectureRegex.ts` into `src/modules/architecture-utils/`.
        * [x] Create `src/modules/architecture-utils/index.ts`.
        * [x] Move `getArchitectureRegex.ts` to `src/modules/architecture-utils/getArchitectureRegex.ts`.
        * [x] Move `src/utils/__tests__/getArchitectureRegex.test.ts` to `src/modules/architecture-utils/__tests__/getArchitectureRegex.test.ts`.
        * [x] Update imports and run tests.
    * [x] Refactor `src/config.ts` into `src/modules/config/`.
        * [x] Create `src/modules/config/index.ts`.
        * [x] Move `config.ts` to `src/modules/config/config.ts`.
        * [x] Move `src/__tests__/config.test.ts` to `src/modules/config/__tests__/config.test.ts`.
        * [x] Update imports and run tests.
    * [x] Refactor `src/toolConfigBuilder.ts` into `src/modules/tool-config-builder/`.
        * [x] Create `src/modules/tool-config-builder/index.ts`.
        * [x] Move `toolConfigBuilder.ts` to `src/modules/tool-config-builder/toolConfigBuilder.ts`.
        * [x] Move `src/__tests__/toolConfigBuilder.test.ts` to `src/modules/tool-config-builder/__tests__/toolConfigBuilder.test.ts`.
        * [x] Update imports and run tests.
    * [x] Define shared project-wide types in `src/types.ts` (remains top-level).
    * [x] **Update types.ts with new requirements from Zinit analysis** (already done).
    * [x] Implement core file system abstraction utilities and tests (as a new module: `src/modules/file-system/`).
        * [x] Create `src/modules/file-system/index.ts`.
        * [x] Create `src/modules/file-system/IFileSystem.ts`.
        * [x] Create `src/modules/file-system/NodeFileSystem.ts` and tests.
        * [x] Create `src/modules/file-system/MemFileSystem.ts` and tests.
* [x] *Refactored [`MemFileSystem.ts`](src/modules/file-system/MemFileSystem.ts:1) to use asynchronous internal operations for all 14 targeted methods, aligning with typical async I/O patterns.*
        * [x] Ensure all tests pass and unused arguments are handled.
    * [x] Implement the main CLI entry point and argument parsing (at [`src/cli.ts`](src/cli.ts:1), importing from modules).
        * [x] *Refactored CLI `--dry-run` mechanism to inject `MemFileSystem` or `NodeFileSystem` into services, centralizing dry run logic.*
        * [x] *Added global `--config <path>` option, with logging via `option:config` hook and dedicated tests in [`src/__tests__/cli--config.test.ts`](src/__tests__/cli--config.test.ts:1). Resolved Commander.js test isolation issues.*
        *   Note: The initial `generate` command is implemented. The `loadToolConfigs()` function within [`cli.ts`](src/cli.ts:1) is currently stubbed and will require full implementation later.

3.  **Zinit Discovery and Analysis (Inform Future Implementation):**
    * [x] Analyze `02-configs/*.zsh` files to understand existing tool installation patterns.
    * [x] Study Zinit documentation if further clarification on specific behaviors is needed during implementation.
    * [x] Map Zinit concepts to the new TypeScript model as installer functionalities are built.
    * [x] Identify and plan for edge cases from old configurations.
    * [x] Document any Zinit features that prove difficult to replicate or require alternative approaches.
    * [x] Implement architecture detection based on Zinit's `.zi::get-architecture` function.
    * [x] **Analyze `zinit-install.zsh.adoc` for detailed implementation requirements**.

4.  **Implement Core Utility Modules (within `src/modules/`, with tests):**
    * [x] **Implement `downloader` module ([`src/modules/downloader/`](src/modules/downloader/Downloader.ts:1))**:
        * [x] Define [`IDownloader.ts`](src/modules/downloader/IDownloader.ts:1), [`DownloadStrategy.ts`](src/modules/downloader/DownloadStrategy.ts:1) interfaces.
        * [x] Implement [`NodeFetchStrategy.ts`](src/modules/downloader/NodeFetchStrategy.ts:1) as primary strategy, receiving `IFileSystem` via DI.
        * [x] Implement [`Downloader.ts`](src/modules/downloader/Downloader.ts:1) class with strategy registration, using DI for `IFileSystem`.
        * [x] Add progress tracking support (implemented in [`NodeFetchStrategy.ts`](src/modules/downloader/NodeFetchStrategy.ts:1) and [`Downloader.ts`](src/modules/downloader/Downloader.ts:1)).
        * [x] Write comprehensive tests in `__tests__/` (100% coverage).
        * [x] [`Downloader.ts`](src/modules/downloader/Downloader.ts:1) module is complete, including progress reporting. Cancellation feature intentionally omitted (Ctrl+C is sufficient).
    * [x] **Implement `extractor` module (`src/modules/extractor/`)**:
        * [x] Define [`IArchiveExtractor.ts`](src/modules/extractor/IArchiveExtractor.ts:0) interface.
        * [x] Implement [`ArchiveExtractor.ts`](src/modules/extractor/ArchiveExtractor.ts:0) class using `child_process.exec` for system commands.
        * [x] Support archive formats: `.tar.gz` (and `.tgz`), `.tar.bz2` (and `.tbz2`, `.tbz`), `.tar.xz` (and `.txz`), `.tar`, and `.zip`.
        * [x] Implement format detection by extension with fallback to `file` command.
        * [x] Implement `stripComponents` option for tar archives.
        * [x] Implement executable detection and `chmod +x` for extracted files.
        * [x] Write comprehensive tests in `__tests__/` for supported formats, options, and cleanup.
    * [x] **Implement `github-client` module (`src/modules/github-client/`)**: (Verified existing `src/modules/github-client/GitHubApiClient.ts` as complete and functional)
        * [x] Define `IGitHubApiClient.ts` interface. (Verified)
        * [x] Implement `GitHubApiClient.ts` class. (Verified)
        * [x] Use Zinit-compatible API endpoints. (Verified)
        * [x] Implement rate limiting with proper error handling. (Verified)
        * [x] Add version constraint support. (Verified)
        * [x] Create test fixtures using real API responses for `sxyazi/yazi` in `src/modules/github-client/__tests__/fixtures/`. (Verified)
        * [x] Write tests using `FetchMockHelper` (from `src/testing-helpers/FetchMockHelper.ts`) in `__tests__/`. (Verified)
        * [x] Improve error handling to return `null` for 404 errors and throw `GitHubApiClientError` for other errors.
        * [x] Implement caching for API responses:
          * [x] Create `IGitHubApiCache.ts` interface defining the cache contract
          * [x] Implement `FileGitHubApiCache.ts` with file-based storage in `.generated/cache/github-api`
          * [x] Update `GitHubApiClient.ts` to use the cache for all API requests
          * [x] Add configuration options (`githubApiCacheEnabled` and `githubApiCacheTtl`) - *Configuration loading in `config.ts` and associated tests updated.*
          * [x] Write comprehensive tests for the cache implementation
    * [ ] **Implement `completion-installer` module (`src/modules/completion-installer/`)**:
        * [ ] Define `ICompletionInstaller.ts` interface.
        * [ ] Implement `CompletionInstaller.ts` class.
        * [ ] Support Zsh, Bash, and Fish completions.
        * [ ] Track installed completions in manifest.
        * [ ] Write tests in `__tests__/`.
    * [x] **Implement `version-checker` module (`src/modules/version-checker/`)**:
        * [x] Define `IVersionChecker.ts` interface.
        * [x] Implement `VersionChecker.ts` class.
        * [x] Implement semver comparison.
        * [x] Support version constraints.
        * [x] Add update checking logic.
        * [x] Write comprehensive tests in `__tests__/`.
        * [x] Fix tests to accommodate GitHub client error handling changes (returning `null` for 404 errors).

5.  **Implement Installation Methods (with tests):**
    * [x] Implement support for `github-release` installation method with enhanced features.
        * [x] Integrated `GITHUB_HOST` environment variable for configurable API endpoint.
        * [x] E2E tests for `install` command now use a mock GitHub server ([`cli-install.e2e.test.ts`](src/__tests__/cli-install.e2e.test.ts:1)).
        * [x] Integrated `ArchiveExtractor` for handling archived release assets.
    * [ ] Implement support for other installation methods (Brew, curl | script, Pip, manual).
    * [x] Implement support for `curl-tar` installation method.
        * [x] Integrated `ArchiveExtractor` for handling downloaded tarballs.
    * [ ] Write tests for hook execution.
    * [ ] Implement hook support for custom installation steps.
    * [x] Design and implement a Bash wrapper script (`install-tool.sh`) or integrate its logic into the main CLI if a separate script is not needed.
        * [x] Created [`src/scripts/install-tool.sh`](src/scripts/install-tool.sh:1) for handling tool installation.
        * [x] Made the script executable and capable of handling different installation methods.
    * [ ] Test wrapper script behavior (if applicable).

6.  **Implement Config Loader (with tests):**
    * [x] Create the config loader module (likely `src/modules/config-loader/`).
    * [x] Implement dynamic import of tool configurations (from `src/tools/` or `AppConfig.toolConfigsDir`) and building of `ToolConfig` objects using the `tool-config-builder` module. This includes validation against `ToolConfigSchema`. ([`src/modules/config-loader/toolConfigLoader.ts`](src/modules/config-loader/toolConfigLoader.ts:1))
    * [x] Define Zod schema for `ToolConfig` ([`src/modules/config/toolConfigSchema.ts`](src/modules/config/toolConfigSchema.ts:1)).
    * [x] Integrate `loadToolConfigs()` into [`src/cli.ts`](src/cli.ts:1), enabling the `generate` command to use real configurations.
    * [ ] Handle architecture-specific overrides during loading.
    * [ ] **Add support for completion configuration**.
    * [ ] **Add support for update checking configuration**.
    * [x] Write tests for tool configuration loading and validation.

7.  **[x] Implement Generator Logic (with tests):**
    * [ ] Write tests for the core generator functionality.
    * [ ] Develop the core logic to read all tool configuration files.
    * [x] Write tests for shim template rendering.
    * [x] Implement logic to render the generic Bash shim template.
        * [x] Enhanced shim generation to use ES modules' `import.meta.url` feature for path resolution.
        * [x] Made the generator location-independent, not relying on `appConfig.dotfilesDir`.
    * [x] Write tests for file writing operations.
    * [x] Implement logic to write the generated shim files.
    * [ ] Write tests for Zsh init file generation.
    * [x] Implement logic to generate the consolidated Zsh init file (Handles PATH, env vars, zshInit snippets, and fpath completion setup. Output to `appConfig.zshInitDir` via `ShellInitGenerator` module).
    * [x] Write tests for symlink creation.
    * [x] Implement `generator-symlink` module (Handles `~` expansion, source existence checks, overwrite/backup options for existing targets. Tests are fully compliant.)
        * [x] Fixed `SymlinkGenerator` to correctly use `appConfig.homeDir` instead of deriving it from `appConfig.dotfilesDir`.
    * [ ] Write tests for manifest file operations.
    * [ ] Implement logic to create and update the manifest file with version tracking.
    * [x] **Add completion file generation to Zsh init**.
    * [x] Implement `generator-orchestrator` module to coordinate artifact generation and manage the `GeneratedArtifactsManifest`.
    * [x] Refactor `generator-shim`, `generator-shell-init`, and `generator-symlink` to return detailed artifact information for the manifest.
    *   **Note:** The `generate --dry-run` command has been **successfully and thoroughly verified** end-to-end with multiple tool configurations ([`fzf.tool.ts`](configs/tools/fzf.tool.ts:1) and [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1)) and verbose logging. This confirmed correct tilde expansion, `MemFileSystem` pre-population, loading/validation of both tool configs (object and async function exports), processing by all generators, accurate manifest generation, and correct handling of missing symlink sources. This validates the core artifact generation pipeline in dry run mode.

8.  **Implement Management Commands (with tests):**
    * [x] Write tests for the `generate` command.
        * [x] Implemented E2E test for the `bun run cli generate` command in [`src/__tests__/cli-generate.e2e.test.ts`](src/__tests__/cli-generate.e2e.test.ts:1).
        * [x] Refactored E2E test to move setup and CLI execution to `beforeAll()` hook.
        * [x] Broke down single `it()` block into multiple, more granular test cases.
        * [x] Added explicit `DEBUG: ''` to control debug output during tests.
    * [x] Implement the `generate` command.
    * [x] Write tests for the `cleanup` command.
    * [x] Implement the `cleanup` command.
    * [x] Write tests for the `detect-conflicts` command.
    * [x] Implement the `detect-conflicts` command.
    * [ ] Write tests for the `guess-lost-shims` command.
    * [ ] Implement the `guess-lost-shims` command.
    * [x] **Add `check-updates` command**:
        * [x] Write tests for update checking.
        * [x] Implement command to check all tools for updates.
        * [x] Add option to check specific tools.
    * [x] **Add `update` command**:
    * [x] Write tests for update functionality.
    * [x] Implement command to update tools.
    * [ ] Add interactive mode for selective updates.

10. **Documentation:**
    * [ ] Write detailed documentation for the management tool.
    * [ ] **Document the swappable download mechanism**.
    * [ ] **Document supported archive formats**.
    * [ ] **Document completion management**.
    * [ ] **Document version management and update checking**.

11. **Port Tool Configurations (Ongoing - Stricter guidelines now in place):** (NOTE: This entire task block will be addressed last, after all preceding core development tasks (items 1-10 and any other higher-priority items) are completed.)
    * [ ] Write tests for tool configuration loading and validation.
    * [ ] Create TypeScript tool configuration files for each tool.
        * [x] `fzf.tool.ts` has been **correctly and compliantly ported** according to the new strict guidelines in `memory-bank/techContext.md`. This includes using `installMethod: 'github-release'`, the complete removal of `zinit` logic, and ensuring `zshInit` is a single script block containing only `fzf`-specific Zsh initializations.
        * [x] [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) has been **correctly and compliantly ported** according to the new strict guidelines in `memory-bank/techContext.md`. This porting emphasizes the use of an `AsyncConfigureTool` function with `ToolConfigBuilder`, `installMethod: 'github-release'`, and proper `zshInit` and `symlinks` definitions, ensuring no "garbage code" remains.
    * [ ] Translate installation methods and parameters, adhering to new guidelines.
    * [ ] Include Zsh init details and config linking, adhering to new guidelines.
    * [ ] **Add completion configuration for each tool**.
    * [ ] Test that each tool configuration loads correctly.

12. **Follow up actions**:
  * [ ] Replace all usage of `createMockFileSystem` with `createMemFileSystem` in tests.

## Known Issues

- Handling permissions for writing shims to system directories (like `/usr/bin`) will need careful implementation and potentially `sudo` handling.
- Design and implementation of the TUI for the `guess-lost-shims` command will require careful consideration.
- Ensuring robust error handling and user feedback throughout the tool.
- **Rate limiting for GitHub API** has been addressed through the implementation of a caching system.
- **Archive format detection** may need fallback mechanisms for edge cases.
- **Executable detection** using `file` command may vary across different systems.
- **Completion file formats** vary between shells and tools, requiring flexible detection.

## Evolution of Project Decisions

- The project's core goal is to develop a robust TypeScript/Bun based management tool that uses shims for tool execution, improving consistency and accessibility over traditional alias-based systems.
- Key architectural decisions guiding the new implementation include:
    - Centralized tool configuration defined in TypeScript.
    - Generic Bash shims that trigger a TypeScript-based installation script on first run.
    - A single, generated Zsh initialization file.
    - Storing all generated artifacts within a dedicated `.generated` directory within the project.
    - The `generator-orchestrator` consumes detailed return values from individual generator modules (`generator-shim`, `generator-shell-init`, `generator-symlink`) to create an accurate `GeneratedArtifactsManifest`. This manifest now includes specific paths for shims, the shell init file, and detailed results for symlink operations.
- This approach aims for improved maintainability, testability, and a clearer separation of concerns.
- The `src` directory is being refactored into a modular structure under `src/modules/` to enhance organization and adhere to "Feature Modules" rule.
- **Dependency Injection and Service/Logger Scoping:**
    - Services (`AppConfig`, `IFileSystem`, etc.) are instantiated on a per-command basis via `setupServices` within each command's action handler. This allows for command-specific configurations (e.g., respecting `--dry-run` or verbosity flags).
    - `clientLogger` instances are also created per command within their action handlers using `createClientLogger`, enabling command-specific verbosity control.
- **New architectural decisions based on Zinit analysis**:
    - Swappable download mechanism using strategy pattern for extensibility.
    - Comprehensive archive format support matching Zinit's capabilities.
    - First-class support for shell completion files.
    - Version tracking and update checking as core features.
    - Using Zinit-compatible GitHub API endpoints for consistency.
    - Automatic executable detection and permission management.
- Clarified and standardized the code validation process: worker modes are to be instructed to use `bun run test` as the comprehensive command to verify changes, covering tests, linting, and type safety.
