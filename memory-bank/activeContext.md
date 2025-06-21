# Active Context

This document captures the current work focus, recent changes, next steps, and active considerations for the dotfiles project.

## Current Work Focus

- The `generate` CLI command is now fully functional with respect to loading configurations.
- Both `fzf.tool.ts` and `lazygit.tool.ts` configurations are now correctly ported according to the new stricter guidelines.
- Next priorities include:
  1.  Test the `generate` command with the `fzf.tool.ts` and `lazygit.tool.ts` configurations. (DONE)
  2.  Implement the `Extractor` core service. (DONE - Covered by `ArchiveExtractor` module)
  3.  Begin adding more CLI commands as outlined in [`memory-bank/progress.md`](memory-bank/progress.md:1) (e.g., `cleanup`, `check-updates`).
  4.  Implement the `CompletionInstaller` core service.
  5.  Implement tool installation logic.
  6.  Port all remaining tool configurations to the `*.tool.ts` format (to be handled as a final step after all other core functionalities are implemented and tested).

## Recent Changes
*   **Global `--config` Option and Test Refactoring:**
    *   Implemented the global `--config <path>` option in [`src/cli.ts`](src/cli.ts:1). The option's value is logged using `clientLogger.info()` via an `option:config` hook.
    *   Refactored tests for the `--config` option from [`src/__tests__/cli.test.ts`](src/__tests__/cli.test.ts:1) into a new dedicated file, [`src/__tests__/cli--config.test.ts`](src/__tests__/cli--config.test.ts:1), following project conventions.
    *   Resolved test instability ("cannot add command ... as already have command") by refactoring `main()` in [`src/cli.ts`](src/cli.ts:1) to instantiate the `commander.Command` object internally. This ensures each test run invoking `main()` operates on a fresh, isolated `program` instance.
*   **Standardized Code Validation Command:** Standardized the primary code validation command to `bun run test` for all worker modes. This command is expected to encompass unit tests, linting, and type checking, replacing previous instructions that might have specified separate `bun lint` or `bun tsc --noEmit` commands for these purposes when delegating tasks.
*   **Implemented `check-updates` Command:** The `check-updates [toolName]` CLI command ([`src/modules/cli/checkUpdatesCommand.ts`](src/modules/cli/checkUpdatesCommand.ts:1)) has been fully implemented and tested. This command checks for available updates for configured tools, with support for checking a specific tool or all tools. It integrates with the GitHub API client to fetch latest releases, uses the version checker to compare versions, and follows the project's DI pattern and standardized logging approach with `--verbose` and `--quiet` options. The command handles various scenarios including tools with 'latest' version configuration, missing configurations, and unsupported installation methods.

*   **Dependency Injection & Service Setup Refactoring:**
    *   Command action handlers (e.g., in `generateCommand.ts`, `installCommand.ts`) now call `setupServices` (from [`src/cli.ts`](src/cli.ts:1)) to get fresh instances of core services (`AppConfig`, `IFileSystem`, etc.), configured for the command's context (e.g., `--dryRun`). This ensures services are tailored to each command's specific needs.
    *   Consequently, most `register...Command` functions (e.g., `registerGenerateCommand`) have been simplified. They primarily accept only the Commander `program` instance, as services are no longer passed directly during registration.
    *   The `cleanupCommand.ts` file has been refactored to follow the same pattern as other commands. It now uses interfaces for services and options, has a separate function for command logic (`cleanupActionLogic`), and the `registerCleanupCommand` function only takes the `program` parameter. The action handler now calls `setupServices` to get fresh service instances and creates its own `clientLogger`.
*   **Client Logger Instantiation per Command:**
    *   Each command's action handler is now responsible for creating its own `clientLogger` (a Consola instance for user-facing output) by calling `createClientLogger` (from `@modules/logger`).
    *   This logger is configured based on command-line options like `--verbose` and `--quiet` passed to that specific command, ensuring command-specific output control.
*   **Test Spy Management Refactoring (`src/__tests__/cli.test.ts`):**
    *   The `beforeEach` block in [`cli.test.ts`](src/__tests__/cli.test.ts:1) was refactored for more robust spy hygiene. It now consistently uses `if (spy) spy.mockRestore(); spy = spyOn(...);` for spies on module-level functions, prototype methods, and global object methods. This ensures a clean state for each test by restoring any existing spy before creating a new one.
    *   `mockReset()` is used for mocks created with `mock()`.
    *   Specific `mockClear()` calls after `registerAllCommands` in `beforeEach` are retained to isolate assertions on whether action handlers themselves were called during a test, distinct from calls made during the registration process.
*   **Implemented `update` Command:** The `update <toolName>` CLI command ([`src/modules/cli/updateCommand.ts`](src/modules/cli/updateCommand.ts:1)) and its tests ([`src/modules/cli/__tests__/updateCommand.test.ts`](src/modules/cli/__tests__/updateCommand.test.ts:1)) have been implemented. This command allows updating a specified tool (currently supporting 'github-release' method) to its latest version by checking against the GitHub API, and then re-running the installation process if an update is available.
*   **Implemented `detect-conflicts` Command:** The `detect-conflicts` CLI command ([`src/modules/cli/detectConflictsCommand.ts`](src/modules/cli/detectConflictsCommand.ts:1)) and its corresponding tests ([`src/modules/cli/__tests__/detectConflictsCommand.test.ts`](src/modules/cli/__tests__/detectConflictsCommand.test.ts:1)) have been implemented. This command checks for potential conflicts between artifacts that would be generated (shims, symlinks) and existing files on the system, warning the user about files not owned by the generator or symlinks pointing to incorrect locations.
*   **Standardized CLI Output with `clientLogger`:** All direct `console.*` calls (e.g., `console.log`, `console.warn`) in the `src` codebase have been refactored to use the `clientLogger` from `src/modules/logger/clientLogger.ts`. This ensures that all user-facing CLI output consistently respects verbosity flags (`--verbose`, `--quiet`) and the `NODE_ENV=test` setting. A specific `console.warn` in `toolConfigBuilder.ts` was replaced, and an intentional bootstrap `console.error` remains in `cli.ts` for pre-logger critical errors. This standardization enhances user experience and code maintainability.
*   **Refactored Type Definitions and Added JSDoc:** Project-wide shared types, previously in [`src/types.ts`](src/types.ts:1), have been refactored into multiple files within the `src/types/` directory and are re-exported via [`src/types/index.ts`](src/types/index.ts:1). This change improves manageability and allows for easier maintenance of JSDoc comments. Comprehensive JSDoc documentation, including examples for callbacks and detailed explanations for installation methods, has been added to all exported types, interfaces, and their properties within these new type files. This enhances code clarity, maintainability, and developer understanding.

*   **Refactored `ToolConfig` to Discriminated Union:** The `ToolConfig` type, its Zod schema (`ToolConfigSchema`), and the `ToolConfigBuilder` have been refactored to use a discriminated union based on `installationMethod`. This ensures `installParams` are specific to the installation method, improving type safety and validation. This includes support for `installationMethod: 'none'`. All tool configurations and tests have been updated and confirmed to pass.
*   **Improved CLI Logging System:**
    *   The CLI now utilizes a `clientLogger` helper, which is based on the `consola` library, for standardized output.
    *   Global verbosity control is available through:
        *   `--verbose` (formerly `--details`): Enables detailed debug messages, typically using `logger.debug()`.
        *   `--quiet`: Suppresses all informational and debug output. Errors are still displayed.
    *   Standard CLI output is generally handled by `logger.info()`.
    *   The logger is automatically silenced when the `NODE_ENV` environment variable is set to `test` or when `--quiet` is passed.
    *   This provides a consistent logging experience across CLI commands.
*   **New Verbosity Control for `install` Command Output:**
    *   The `install` command now features `--verbose` and `--quiet` flags to control output verbosity.
    *   **Default Behavior (Concise):** Without the `--verbose` or `--quiet` flags, the `install` command provides a concise summary, typically showing the final symlink path (e.g., `Symlinked: .dotfiles/.generated/bin/mytool -> ...`).
    *   **Detailed Output (`--verbose`):** When the `--verbose` flag (formerly `--details`) is provided, the command displays all messages from the `InstallResult.otherChanges` array using `logger.debug`. This includes a step-by-step log of the installation process.
    *   **Quiet Output (`--quiet`):** When the `--quiet` flag is provided, all informational and debug output is suppressed. Errors will still be shown.
    *   **User Experience Improvement:** These changes offer a cleaner default output, access to granular details when needed (`--verbose`), and a silent mode (`--quiet`). The `otherChanges` array is populated by the `Installer` module ([`src/modules/installer/Installer.ts`](src/modules/installer/Installer.ts:0)).

*   **Enhanced `install` Command Output (Underlying Mechanism):**
    *   The `install` command's output in the CLI has been enhanced to provide more detailed information about the installation process (now controllable by the `--verbose` and `--quiet` flags using the new `clientLogger`).
    *   It displays the final symlink path created for the installed binary using `logger.info` (e.g., `Symlinked: .dotfiles/.generated/bin/mytool -> .dotfiles/.generated/binaries/mytool/0.1.0/mytool-bin`).
    *   The `InstallResult` interface (in [`src/types.ts`](src/types.ts:1)) was updated with:
        *   `symlinkPath?: string`: Stores the absolute path to the created symlink in the main binary directory (e.g., `~/.dotfiles/.generated/bin/tool`).
        *   `otherChanges?: string[]`: An array to log other filesystem changes or important messages during installation. This array is populated by the `Installer` module ([`src/modules/installer/Installer.ts`](src/modules/installer/Installer.ts:0)) with messages detailing various stages and actions, such as:
            *   Starting and completing file downloads.
            *   Starting and completing archive extractions.
            *   Details about temporary directories used and cleaned up.
            *   Permissions changes made to executables.
            *   Steps taken to locate the binary within an archive.
            *   Confirmation of successful binary placement.
    *   The `Installer` class ([`src/modules/installer/Installer.ts`](src/modules/installer/Installer.ts:0)) was modified to populate these new fields in the `InstallResult`, providing a step-by-step log of its operations.
    *   The CLI ([`src/cli.ts`](src/cli.ts:1)) was updated to use the `clientLogger`. `logger.info` is used for standard messages and `logger.debug` (activated by `--verbose`) for the `otherChanges` array. This significantly improves the transparency of the installation process.

*   **Implemented Archive Extraction Functionality:**
    *   A new `extractor` module ([`src/modules/extractor/ArchiveExtractor.ts`](src/modules/extractor/ArchiveExtractor.ts:0)) has been implemented to handle the extraction of various archive formats (e.g., `.tar.gz`, `.zip`).
    *   The `ArchiveExtractor` class uses system commands (like `tar` and `unzip`) via a promisified `child_process.exec` for robust extraction.
    *   It includes format detection based on file extension and a fallback to the `file` command.
    *   The `Installer` module ([`src/modules/installer/Installer.ts`](src/modules/installer/Installer.ts:0)) has been updated to integrate with the `ArchiveExtractor`.
    *   This integration allows the `Installer` to automatically extract downloaded archives for `github-release` and `curl-tar` installation methods.
    *   The `Installer` now handles temporary extraction directories, finding the binary within the extracted contents, and cleaning up afterward.
    *   Options like `stripComponents` are supported for tar-based extractions.

*   **Improved GitHub Download Testing:**
    *   Created a mock GitHub API server helper using Express (`setupMockGitHubServer` in [`src/__tests__/helpers.ts`](src/__tests__/helpers.ts:1)). This allows for controlled and predictable API responses during tests.
    *   Updated the GitHub downloader (`GitHubApiClient` and `Installer`) to use a configurable `GITHUB_HOST` environment variable. This enables tests to point to the mock server.
    *   Updated E2E install tests ([`cli-install.e2e.test.ts`](src/__tests__/cli-install.e2e.test.ts:1)) to utilize the mock Express server.
    *   **Benefits:** These changes significantly improve the reliability of tests involving GitHub downloads by avoiding real network requests, thus preventing rate limit issues and test flakiness.

*   **Fixed `SymlinkGenerator` to Use `appConfig.homeDir`:** Updated [`SymlinkGenerator`](src/modules/generator-symlink/SymlinkGenerator.ts:1) to correctly use `appConfig.homeDir` instead of deriving it from `appConfig.dotfilesDir`. This ensures symlinks work correctly in isolated environments like E2E tests.

*   **Refactored E2E Tests for Better Structure:**
    *   Moved setup and CLI execution to `beforeAll()` hook in [`cli-generate.e2e.test.ts`](src/__tests__/cli-generate.e2e.test.ts:1).
    *   Broke down single `it()` block into multiple, more granular test cases for better isolation and clarity.
    *   Removed console logging from the test file for cleaner output.
    *   Added explicit `DEBUG: ''` to control debug output during tests.

*   **Implemented Installation Script:**
    *   Created [`src/scripts/install-tool.sh`](src/scripts/install-tool.sh:1) for handling tool installation.
    *   Made the script executable and capable of handling different installation methods.
    *   Enhanced shim generation to use an absolute path for the `INSTALL_TOOL` reference.

*   **Fixed Generator Path Resolution:**
    *   Updated path determination in [`ShimGenerator`](src/modules/generator-shim/ShimGenerator.ts:1) to use ES modules' `import.meta.url` feature.
    *   Made the generator location-independent, not relying on `appConfig.dotfilesDir`.
    *   Ensured the generator works correctly regardless of its installation location.

*   **Added E2E Test for `cli generate`:** Implemented an end-to-end test for the `bun run cli generate` command in [`src/__tests__/cli-generate.e2e.test.ts`](src/__tests__/cli-generate.e2e.test.ts:1). This test:
    *   Runs in an isolated temporary directory.
    *   Uses a custom `.env` file and environment variables to configure all paths to point within this temporary directory.
    *   Copies actual `fzf.tool.ts` and `lazygit.tool.ts` into a `tool_configs` subdirectory within the temporary directory.
    *   Executes `bun run cli generate` (no `--dry-run`).
    *   Verifies that the expected artifacts (shims, shell init file, manifest, symlinks) are generated correctly in the temporary directory and that their content is as expected.
    *   Cleans up the temporary directory after execution.
*   **Comprehensive Verification of `generate --dry-run` with Verbose Output:** Successfully executed `DEBUG="*" bun run cli generate --dry-run` (effectively `dotenv -- bun run ./src/cli.ts generate --dry-run`), providing end-to-end verification of the artifact generation pipeline with multiple tool configurations. Key confirmations include:
    *   **Correct Tilde Expansion:** `AppConfig` paths (e.g., `DOTFILES_DIR`, `TOOL_CONFIGS_DIR`) were correctly expanded from tilde (`~`) to absolute paths.
    *   **`MemFileSystem` Pre-population:** The `MemFileSystem` was correctly pre-populated with the contents of [`fzf.tool.ts`](configs/tools/fzf.tool.ts:1) and [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) during the dry run, ensuring generators operated on real configuration data.
    *   **Successful Tool Configuration Loading & Validation:** [`toolConfigLoader.ts`](src/modules/config-loader/toolConfigLoader.ts:1) successfully loaded and validated both [`fzf.tool.ts`](configs/tools/fzf.tool.ts:1) (direct object export) and [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) (exported as an `AsyncConfigureTool` function).
    *   **Correct Processing by All Generators:** All core generator modules ([`ShimGenerator`](src/modules/generator-shim/ShimGenerator.ts:1), [`ShellInitGenerator`](src/modules/generator-shell-init/ShellInitGenerator.ts:1), [`SymlinkGenerator`](src/modules/generator-symlink/SymlinkGenerator.ts:1)) and the [`GeneratorOrchestrator`](src/modules/generator-orchestrator/GeneratorOrchestrator.ts:1) correctly processed both tool configurations.
    *   **Accurate Manifest Generation:** A manifest file was generated reflecting the expected artifacts for both `fzf` and `lazygit`.
    *   **Correct Handling of Missing Symlink Source:** The [`SymlinkGenerator`](src/modules/generator-symlink/SymlinkGenerator.ts:1) correctly identified and handled a missing source file for a symlink defined in [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) (due to a conditional path not being met), issuing a warning and skipping the symlink as expected.
    *   This comprehensive test validates the core end-to-end artifact generation pipeline in dry run mode with multiple, correctly ported tool configurations.
*   **Tilde Expansion in Path Configurations:** Implemented tilde (`~`) expansion for all relevant path configurations (e.g., `DOTFILES_DIR`, `TOOL_CONFIGS_DIR`, `GENERATED_DIR`) in [`src/modules/config/config.ts`](src/modules/config/config.ts:1). This uses `systemInfo.homedir` to ensure all path properties in `AppConfig` are absolute and fully resolved.
*   **Created `.env` Template:** A template `.env` file has been created at [`.env`](.env:1). This file lists all environment variables from `ConfigEnvironment` in [`src/modules/config/config.ts`](src/modules/config/config.ts:1), including their JSDoc descriptions and default values. Variables with non-empty defaults are uncommented.
*   **Successful End-to-End Test of `generate --dry-run`:** The `DEBUG="*" bun run cli generate --dry-run` command was successfully tested end-to-end. This test confirmed:
    *   Correct loading and processing of both [`fzf.tool.ts`](configs/tools/fzf.tool.ts:1) (object export) and [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) (using the `AsyncConfigureTool` function export pattern).
    *   All generator modules ([`ShimGenerator`](src/modules/generator-shim/ShimGenerator.ts:1), [`ShellInitGenerator`](src/modules/generator-shell-init/ShellInitGenerator.ts:1), [`SymlinkGenerator`](src/modules/generator-symlink/SymlinkGenerator.ts:1)) and the [`GeneratorOrchestrator`](src/modules/generator-orchestrator/GeneratorOrchestrator.ts:1) correctly processed these configurations during the dry run.
    *   The simulated output (shims, shell init script, symlinks, and manifest) appeared correct for both tools.
    *   The [`SymlinkGenerator`](src/modules/generator-symlink/SymlinkGenerator.ts:1)'s behavior was validated by its correct handling of the intentionally missing symlink source for `lazygit`'s `config.yml` (as its `symlink.source` is conditional and the condition was false in the test setup).
*   **Fixed `toolConfigLoader.ts` Promise Handling:** The [`toolConfigLoader.ts`](src/modules/config-loader/toolConfigLoader.ts:1) was fixed to correctly handle `*.tool.ts` files exporting an `AsyncConfigureTool` function. The loader now properly `await`s the `Promise<ToolConfig>` returned by such functions *before* attempting to validate the resolved `ToolConfig` object with Zod. This ensures the actual configuration object, not the promise, is validated and fixes issues like the one with `lazygit.tool.ts`.
*   **Enhanced `toolConfigLoader.ts` for Flexible Exports:** The [`toolConfigLoader.ts`](src/modules/config-loader/toolConfigLoader.ts:1) has been updated to correctly process `*.tool.ts` files that export either a direct `ToolConfig` object or an `AsyncConfigureTool` function (which uses `ToolConfigBuilder`). It now checks the type of the default export: if it's a function, it calls it (with a new `ToolConfigBuilder` instance and `appConfig`) and awaits the `ToolConfig` object before validation; otherwise, it processes the export as an object directly. This supports the `AsyncConfigureTool` pattern more robustly.
*   **Corrected `toolConfigsDir` Default Path:** The default path for `toolConfigsDir` in `AppConfig` (defined in [`src/modules/config/config.ts`](src/modules/config/config.ts:1)) has been corrected to `join(DOTFILES_DIR, 'generator', 'configs', 'tools')`. This ensures the CLI can correctly locate `*.tool.ts` files by default. This change is also reflected in [`memory-bank/techContext.md`](memory-bank/techContext.md:1).
*   **Enhanced `--dry-run` Accuracy in CLI:** The `--dry-run` functionality in [`src/cli.ts`](src/cli.ts:1) has been significantly improved. When `--dry-run` is active, [`cli.ts`](src/cli.ts:1) now reads the actual `*.tool.ts` files from the configured `toolConfigsDir` (using a temporary `NodeFileSystem`) and uses this content to pre-populate the `MemFileSystem` instance that is then passed to services. This ensures dry runs operate on real configuration data in memory, making them more accurate as `loadToolConfigs` (when operating on the pre-populated `MemFileSystem`) will process the real configurations.
*   **Successful Rewrite and Correction of `lazygit.tool.ts`:** The [`lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) file has been **successfully rewritten and corrected** to fully comply with the strict guidelines outlined in `memory-bank/techContext.md` (section "Porting Tool Configurations to `*.tool.ts`") and has passed all project tests and type checks. This definitive version uses an `AsyncConfigureTool` function with `ToolConfigBuilder`, `installMethod: 'github-release'`, correctly defines the symlink for `config.yml`, ensures `zshInit` is a single multi-line string for the alias, and contains no "garbage code."
*   **Successful Rewrite and Correction of `fzf.tool.ts`:** The [`fzf.tool.ts`](configs/tools/fzf.tool.ts:1) file has been **successfully rewritten and corrected** to fully comply with the strict guidelines outlined in `memory-bank/techContext.md` (section "Porting Tool Configurations to `*.tool.ts`") and has passed all project tests and type checks. This definitive version uses `installMethod: 'github-release'`, has all `zinit` logic completely removed, and features a `zshInit` property as a single script block (string array with one multi-line element) containing only `fzf`-specific Zsh initializations. Environment variables like `FZF_DEFAULT_OPTS` are correctly handled within `zshInit`, and completions are properly structured. This supersedes any previous documentation regarding this file.
*   **Added Strict Guidelines for `*.tool.ts` Creation:** New, detailed guidelines for porting shell configurations to `ToolConfig` (`*.tool.ts` files) have been added to `memory-bank/techContext.md`. These rules emphasize using structured fields, proper `installMethod` selection, correct `zshInit` formatting and content, and thorough analysis before porting. This aims to improve the quality and consistency of tool configurations.
+*   **Implemented `loadToolConfigs()` and Integrated into CLI:** The `loadToolConfigs()` function ([`src/modules/config-loader/toolConfigLoader.ts`](src/modules/config-loader/toolConfigLoader.ts:1)) has been successfully implemented and integrated into [`src/cli.ts`](src/cli.ts:1). This enables the CLI's `generate` command to dynamically find `*.tool.ts` files in `AppConfig.toolConfigsDir`, import them, validate their default export against `ToolConfigSchema` ([`src/modules/config/toolConfigSchema.ts`](src/modules/config/toolConfigSchema.ts:1)), and process them. The CLI can now operate with real tool configurations.
+*   **Created `createMockFileSystem` Test Helper:** Added a new test helper function `createMockFileSystem` in [`src/testing-helpers/fileSystemTestHelpers.ts`](src/testing-helpers/fileSystemTestHelpers.ts:0). This helper creates `MemFileSystem` instances, optionally initializing them with a given file structure. Existing tests that used `new MemFileSystem()` were refactored to use this helper, promoting consistency and reducing boilerplate. Documented in [`memory-bank/techContext.md`](memory-bank/techContext.md:65). All project tests and type checks pass.
+*   **Enhanced `createMockAppConfig` Documentation:** Updated [`memory-bank/techContext.md`](memory-bank/techContext.md:1) to include detailed usage examples and benefits for the `createMockAppConfig` test helper.
+*   **Dry Run Mechanism Refactoring:** The CLI's (`src/cli.ts`) `--dry-run` functionality has been refactored. It now works by conditionally injecting an `IFileSystem` implementation (`MemFileSystem` for dry run, `NodeFileSystem` otherwise) into the service layer (e.g., `GeneratorOrchestrator`). This centralizes the dry run logic, simplifying downstream generator modules (`GeneratorOrchestrator`, `ShimGenerator`, `ShellInitGenerator`, `SymlinkGenerator`) as they no longer manage a `dryRun` option directly and instead operate on the provided `IFileSystem` instance. All tests and type checks pass.
+*   **Asynchronous Refactoring of `MemFileSystem.ts`:** Successfully refactored [`MemFileSystem.ts`](src/modules/file-system/MemFileSystem.ts:1) to use asynchronous methods from its underlying `memfs` volume for all 14 targeted file system operations. All project tests and type checks are confirmed to be passing. This change aligns its internal workings more closely with typical asynchronous I/O patterns.
+*   **Code Cleanup Operation (Commit `4af6cc48`):** Performed a cleanup operation on several files modified in commit `4af6cc48 (... Add CLI)`. This involved removing commented-out code, unused imports/scripts, superfluous comments, and debug logs. Affected files include: [`package.json`](package.json:1), [`src/__tests__/cli.test.ts`](src/__tests__/cli.test.ts:1), [`src/cli.ts`](src/cli.ts:1), [`src/modules/file-system/MemFileSystem.ts`](src/modules/file-system/MemFileSystem.ts:1), [`src/modules/generator-orchestrator/GeneratorOrchestrator.ts`](src/modules/generator-orchestrator/GeneratorOrchestrator.ts:1), [`src/modules/generator-orchestrator/__tests__/GeneratorOrchestrator.test.ts`](src/modules/generator-orchestrator/__tests__/GeneratorOrchestrator.test.ts:1), and [`src/modules/generator-shim/__tests__/ShimGenerator.test.ts`](src/modules/generator-shim/__tests__/ShimGenerator.test.ts:1). All project tests and type checks remain passing after this cleanup.
+*   **Implemented Main CLI Entry Point:** The main CLI entry point has been successfully implemented in [`src/cli.ts`](src/cli.ts:1) using the `commander` library. It includes a DI setup function and an initial `generate` command (with `--dry-run` option) that utilizes `GeneratorOrchestrator`. The `loadToolConfigs()` function is currently stubbed. The CLI is exposed via the `bin` field in [`package.json`](package.json:1). Basic tests are in `src/__tests__/cli.test.ts`.
+*   **Completed `generator-orchestrator` and Generator Refactoring:** The `generator-orchestrator` module (`src/modules/generator-orchestrator/`) has been implemented and tested. This module coordinates the `generator-shim`, `generator-shell-init`, and `generator-symlink` modules.
+*   **Refactored Generator Return Types:** All core generator modules (`IShimGenerator`, `IShellInitGenerator`, `ISymlinkGenerator`) have been refactored to return detailed information about the artifacts they generate (`string[]` for shims, `string | null` for shell init path, and `SymlinkOperationResult[]` for symlinks).
+*   **Enhanced `GeneratedArtifactsManifest`:** The `GeneratedArtifactsManifest` (in `types.ts`) now stores detailed information (`shims: string[]`, `shellInit: { path: string | null }`, `symlinks: SymlinkOperationResult[]`, `lastGenerated: string`) consumed from the generator modules by the `GeneratorOrchestrator`. This provides a more accurate and comprehensive record of generated artifacts.
+*   **Completed and Corrected `generator-symlink` Module:** The `generator-symlink` module (`src/modules/generator-symlink/`) and its tests (`SymlinkGenerator.test.ts`) are now complete and correct. Test corrections included removing logger mocking and all `@ts-expect-error` directives. All project tests and type checks are confirmed to be passing.
+*   **Refined `generator-shell-init` Output:** The `ShellInitGenerator` module's output (the Zsh init file) has been refined. It is designed to be *sourced* (e.g., by `~/.zshrc`) and therefore no longer includes a shebang or linter/editor-specific directives.
+*   **Implemented `generator-shell-init` Module:** The `ShellInitGenerator` module (`src/modules/generator-shell-init/`) is now complete and tested. It handles the creation of a consolidated Zsh initialization file, processing `ToolConfig` entries for `PATH` modifications, environment variables, `zshInit` snippets, and Zsh completion setup (fpath management), outputting to `appConfig.zshInitDir`.
+*   **Corrected `ShimGenerator` and Test Suite:** Fixed the `generator-shim` module and its tests (`src/modules/generator-shim/__tests__/ShimGenerator.test.ts`). This involved removing logger mocking from tests and aligning `AppConfig` usage (e.g., using `appConfig.targetDir` instead of a `shimDir` property for output, and ensuring the shim correctly triggers the main CLI's installation mechanism which uses `appConfig.cliToolPath` or equivalent). All project tests and type checks are now passing.
+*   **Updated GitHub API Cache Configuration Loading:** The configuration loading mechanism in `src/modules/config/config.ts` for GitHub API cache settings (`githubApiCacheEnabled`, `githubApiCacheTtl`) has been implemented and tested. This includes loading from environment variables (`GITHUB_API_CACHE_ENABLED`, `GITHUB_API_CACHE_TTL`) and providing default values.
+*   **Reinforced Mandatory Type Checking Guideline:** Updated `memory-bank/techContext.md` to strongly emphasize the critical importance of running TypeScript type checks (e.g., `bun tsc --noEmit` or `bun lint`) and ensuring they pass *before* concluding any coding or debugging task. This is now a mandatory step, equal in importance to passing unit tests, and agents should explicitly confirm type checks passed upon task completion.
+*   **Established New Test File Splitting Convention:** Documented a new convention in `memory-bank/techContext.md` for splitting large test files into smaller, focused files using the `OriginalFileName--[specific-aspect-tested].test.ts` naming pattern. The `GitHubApiClient` tests serve as an example of this refactoring.
+*   **Implemented GitHub API Request Caching System:** Added a complete caching system for GitHub API requests with `IGitHubApiCache` interface and `FileGitHubApiCache` implementation. The cache provides configurable TTL (default 24h), can be enabled/disabled via configuration, and stores cached responses in the `.generated/cache/github-api` directory. The GitHub client was updated to use the cache for all API requests, helping to avoid rate limits.
+*   **Fixed GitHub Client Error Handling and VersionChecker Tests:** Improved the GitHub client error handling to return `null` for 404 errors and throw `GitHubApiClientError` for other errors. Fixed the `VersionChecker` tests to accommodate these changes.
+*   **Clarified Logger Testing Guidelines:** Updated `memory-bank/techContext.md` to explicitly state that logger instances (created via `createLogger`) must not be mocked in unit tests, and unit tests should not assert or verify log output. This reinforces that logging is for observability, not part of a module's testable contract.
+*   **Implemented Version Checker Module:** The `VersionChecker` module has been implemented in `src/modules/versionChecker/`, including `IVersionChecker.ts`, `VersionChecker.ts`, `index.ts`, and `VersionChecker.test.ts`. This module provides functionality for semantic version comparison, version constraint checking, and update checking logic.
- **Verified GitHub Client Module:** The GitHub client module at `src/modules/github-client/GitHubApiClient.ts` was reviewed and confirmed to be complete and meeting all functional requirements.
- The `src` directory is being newly implemented.
- Memory Bank files (`projectBrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `activeContext.md`, `progress.md`) were reviewed and updated to reflect the current development phase.
- Initial core Memory Bank files (`projectBrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `activeContext.md`, `progress.md`) were created.
- A detailed analysis of the existing `02-configs` structure and `alias-installer` usage was performed.
- Identified multiple tool installation methods currently in use: Zinit GitHub releases, Brew, curl | script (bash/sh), and curl | tar.
- Developed a new, comprehensive plan to build a TypeScript/Bun CLI tool that generates Bash shims, a consolidated Zsh init file, and manages config linking.
- Updated `projectBrief.md`, `productContext.md`, `systemPatterns.md`, and `techContext.md` to reflect the new project direction.
- Refined the shim architecture to use generic Bash shims that call a centralized TypeScript installation script rather than embedding method-specific installation logic in each shim.
- Updated the directory structure to keep all generated files within the `.dotfiles` directory, using dot-prefixed folders for files that shouldn't be checked into git.
- Added requirements for configuration management using a `.env` file and a centralized configuration module.
- Updated progress tracking with checkboxes for better visibility of completed tasks.
- Completed Zinit Discovery and Analysis by examining remaining `install.zsh` files (Navi, Yazi, Eza) and documenting patterns (`from=gh-r`, `bpick`, `mv`, `completions`, OS-specific logic, custom scripts).
- **Refactored Foundational Code into Modules:**
    - Moved `createLogger.ts` and its tests to `src/modules/logger/`.
    - Moved `getArchitectureRegex.ts` and its tests to `src/modules/architecture-utils/`.
    - Moved `config.ts` and its tests to `src/modules/config/`.
    - Moved `toolConfigBuilder.ts` and its tests to `src/modules/tool-config-builder/`.
    - Updated all relevant import paths and ensured barrel files (`index.ts`) correctly export module contents.
    - Verified all tests pass and 100% code coverage is maintained after refactoring.
- Created `src/types.ts` with core type definitions (remains top-level).
- **Analyzed `zinit-install.zsh.adoc`** to understand Zinit's installation mechanisms in detail.
- **Created comprehensive requirements updates** based on Zinit analysis, including:
    - Swappable download mechanism design
    - Enhanced archive extraction with comprehensive format support
    - Completion file management system
    - GitHub API integration using Zinit-compatible endpoints
    - Version checking and update mechanisms
    - Binary detection and permission management
- **Completed Initial Code Refactor:** Restructured existing foundational utilities and configuration into the new modular layout under `src/modules/` as per `memory-bank/module-refactor-plan.md`.
- **Implemented File System Abstraction Module:** Created `src/modules/file-system/` with `IFileSystem.ts`, `NodeFileSystem.ts`, and `MemFileSystem.ts`, along with passing tests.
- **Implemented Downloader Module:** The [`Downloader` module](src/modules/downloader/Downloader.ts:1) is now considered complete. It supports multiple download strategies, retry logic, and progress reporting. The optional cancellation feature was reviewed and deemed unnecessary; standard Ctrl+C interrupt is considered sufficient.
   - The `Downloader` module correctly uses Dependency Injection for `IFileSystem`.
   - The default `NodeFetchStrategy` within `Downloader` receives `IFileSystem` via DI.
   - The `Downloader` module has 100% test coverage.
- **Implemented Archive Extractor Module:** Created `src/modules/extractor/` with `IArchiveExtractor.ts` and `ArchiveExtractor.ts` (using `zx` for system commands), supporting initial formats (.tar.gz, .zip, etc.) and basic executable detection, along with passing tests.
- **Created GitHub API Test Fixtures:** Fetched real GitHub API responses for `sxyazi/yazi` (latest release, release by tag, all releases page 1, rate limit) and stored them as JSON files in `src/modules/github-client/__tests__/fixtures/`. This will aid in testing the `GitHubApiClient`.

## Active Decisions and Considerations

- **Dependency Injection Scope:** Services (`AppConfig`, `IFileSystem`, etc.) are now instantiated per command via `setupServices` within each command's action handler. This provides command-specific configurations (e.g., for `--dry-run`).
- **Logger Instantiation Scope:** `clientLogger` instances are created per command within their action handlers using `createClientLogger`, allowing command-specific verbosity control.
- **`cleanupCommand` DI Exception:** The `cleanupCommand` continues to receive its core dependencies (`AppConfig`, `IFileSystem`, `clientLogger`) during registration in `cli.ts` because its class constructor requires them, differing from other commands where action handlers manage service setup.
- Ensuring the implementation of `src` aligns with the established Memory Bank documentation and `.roorules`.
- Prioritizing the creation of foundational files and their basic structures first.
- Designing the TypeScript configuration structure to be flexible and cover all identified installation methods and configuration needs.
- Using a generic Bash shim that calls a centralized TypeScript installation script rather than embedding method-specific installation logic in each shim.
- Centralizing all generated files in a single `.generated` folder with organized subfolders:
  - `cache/`: Stores downloaded files for reuse
  - `binaries/`: Contains the actual installed binaries
  - `bin/`: Contains symlinks to all binaries for easy access
  - `zsh/`: Contains generated Zsh files
  - `completions/`: Contains shell completion files (NEW)
- Using dot-prefixed folders (like `.generated`) for files that shouldn't be checked into git.
- Using a `.env` file for configuration management with sensible defaults and command-line overrides, including making the tool configuration directory (`TOOL_CONFIG_DIR`) specifiable.
- Developing a systematic approach to analyze and port `zinit load` functionality. (Completed for analysis, implementation pending)
- Planning the implementation of the TUI for the `guess-lost-shims` command.
- Ensuring smooth transition from the old `alias-installer` system to the new shim-based approach.
- **Implementing a swappable download mechanism** using the strategy pattern for future extensibility.
- **Using Node.js native capabilities** as the primary download method instead of shell tools.
- **Supporting comprehensive archive formats** including tar variants, zip, rar, 7z, deb, rpm, and dmg.
- **Implementing automatic executable detection** using the `file` command after extraction.
- **Using the same GitHub API endpoints as Zinit** for compatibility.
- **Adopting a modular structure for `src`:** Code will be organized into feature modules under `src/modules/` with dash-case naming, each with its own `index.ts` and `__tests__` directory. `types.ts` will remain top-level in `src`.

## Learnings and Project Insights

- The existing dotfiles utilize a variety of installation methods, which the new shim system must accommodate.
- Centralizing installation logic in TypeScript rather than embedding it in each shim offers significant benefits for maintainability and reduces duplication.
- Using a generic shim template simplifies the shim generation process and makes it easier to update the shim logic in the future.
- Keeping all generated files within the `.dotfiles` directory simplifies the project structure and makes it easier to manage.
- Centralizing configuration in TypeScript offers significant benefits for maintainability and structure compared to shell scripts.
- **Zinit's robustness comes from**:
  - Multiple download backend support with fallback mechanisms
  - Comprehensive archive format support
  - Automatic executable detection and permission setting
  - Shell completion file management
  - Version tracking and update checking
- **The strategy pattern for downloads** allows easy addition of new download methods without modifying core logic.
- **Completion files are crucial** for CLI tool usability and should be managed as first-class citizens.
- **Commander.js Test Isolation:** For applications using Commander.js where tests involve multiple invocations of the main CLI execution logic (e.g., calling an exported `main()` function that uses a global `program` instance), it's crucial to ensure test isolation. The most effective pattern identified is to instantiate the `new Command()` object *inside* the `main()` function (or equivalent entry point). This guarantees that each test run (and the actual CLI execution) gets a completely fresh, state-free `program` instance, preventing errors like commands being registered multiple times.

## Important Patterns and Preferences

- **Code Validation:** Worker modes are instructed to run `bun run test` to ensure all tests pass, and that the code is free of linting and type errors before completing a task. This command is considered the primary gatekeeper for code quality.
- **Command-Scoped Dependency Injection:** Services are instantiated within command action handlers via `setupServices` to ensure they are configured according to the specific command's options (e.g., `--dry-run`, verbosity flags).
- **Command-Scoped Logger:** Each command creates its own `clientLogger` instance, configured by its specific command-line options, ensuring tailored output control.
- Use of TypeScript and Bun for the management tool.
- Generic Bash shims that call a centralized TypeScript installation script.
- Storing all generated files within the `.dotfiles` directory.
- Organizing source code into feature modules under `src/modules/` using dash-case.
- Using dot-prefixed folders for files that shouldn't be checked into git.
- Test-driven development with tests written before or alongside implementation.
- Configuration management via `.env` file with sensible defaults.
- Configurable shim target directory (defaulting to `/usr/bin`).
- Manual triggering of the management tool.
- Reliable cleanup, conflict detection, and lost shim guessing features.
- Use of Markdown for Memory Bank documentation.
- **Swappable service implementations** using interfaces and dependency injection.
- **Comprehensive error handling** with detailed error messages and recovery suggestions.
- **Progress indication** for long-running operations like downloads.
- **Caching strategies** to avoid redundant downloads and API calls.
