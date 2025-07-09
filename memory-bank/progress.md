# Progress

This document tracks the current status, what's left to build, and known issues for the dotfiles project, focusing on the development of the new TypeScript/Bun management tool.

## Current Status

The project is currently focused on refactoring the `src` directory into a modular structure. Core Memory Bank files and `.roorules` are up-to-date. The high-level architectural goal of a shim-based execution system with centralized tool configuration remains, informed by a completed Zinit analysis.

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
    * [x] Refactor `src/utils/getArchitectureRegex.ts` into `src/modules/architecture-utils/`.
    * [x] Refactor `src/config.ts` into `src/modules/config/`.
    * [x] Refactor `src/toolConfigBuilder.ts` into `src/modules/tool-config-builder/`.
    * [x] Define shared project-wide types in `src/types.ts` (remains top-level).
    * [x] **Update types.ts with new requirements from Zinit analysis** (already done).
    * [x] Implement core file system abstraction utilities and tests (as a new module: `src/modules/file-system/`).
    * [x] Implement the main CLI entry point and argument parsing (at [`src/cli.ts`](src/cli.ts:1), importing from modules).

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
    * [x] **Implement `extractor` module (`src/modules/extractor/`)**:
    * [x] **Implement `github-client` module (`src/modules/github-client/`)**: (Verified existing `src/modules/github-client/GitHubApiClient.ts` as complete and functional)
    * [ ] **Implement `completion-installer` module (`src/modules/completion-installer/`)**:
        * [ ] Define `ICompletionInstaller.ts` interface.
        * [ ] Implement `CompletionInstaller.ts` class.
        * [ ] Support Zsh, Bash, and Fish completions.
        * [ ] Track installed completions in manifest.
        * [ ] Write tests in `__tests__/`.
    * [x] **Implement `version-checker` module (`src/modules/version-checker/`)**:

5.  **Implement Installation Methods (with tests):**
    * [x] Implement support for `github-release` installation method with enhanced features.
    * [ ] Implement support for other installation methods (Brew, curl | script, Pip, manual).
    * [x] Implement support for `curl-tar` installation method.
    * [ ] Write tests for hook execution.
    * [ ] Implement hook support for custom installation steps.
    * [x] Design and implement a Bash wrapper script (`install-tool.sh`) or integrate its logic into the main CLI if a separate script is not needed.
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
    * [x] Write tests for file writing operations.
    * [x] Implement logic to write the generated shim files.
    * [ ] Write tests for Zsh init file generation.
    * [x] Implement logic to generate the consolidated Zsh init file (Handles PATH, env vars, zshInit snippets, and fpath completion setup. Output to `appConfig.zshInitDir` via `ShellInitGenerator` module).
    * [x] Write tests for symlink creation.
    * [x] Implement `generator-symlink` module (Handles `~` expansion, source existence checks, overwrite/backup options for existing targets. Tests are fully compliant.)
    * [ ] Write tests for manifest file operations.
    * [ ] Implement logic to create and update the manifest file with version tracking.
    * [x] **Add completion file generation to Zsh init**.
    * [x] Implement `generator-orchestrator` module to coordinate artifact generation and manage the `GeneratedArtifactsManifest`.
    * [x] Refactor `generator-shim`, `generator-shell-init`, and `generator-symlink` to return detailed artifact information for the manifest.

8.  **Implement Management Commands (with tests):**
    * [x] Write tests for the `generate` command.
    * [x] Implement the `generate` command.
    * [x] Write tests for the `cleanup` command.
    * [x] Implement the `cleanup` command.
    * [x] Write tests for the `detect-conflicts` command.
    * [x] Implement the `detect-conflicts` command.
    * [ ] Write tests for the `guess-lost-shims` command.
    * [ ] Implement the `guess-lost-shims` command.
    * [x] **Add `check-updates` command**:
    * [x] **Add `update` command**:
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
    * [ ] Translate installation methods and parameters, adhering to new guidelines.
    * [ ] Include Zsh init details and config linking, adhering to new guidelines.
    * [ ] **Add completion configuration for each tool**.
    * [ ] Test that each tool configuration loads correctly.

12. **Follow up actions**:
  * [x] Replace all usage of `createMockFileSystem` with `createMemFileSystem` in tests.
  * [x] Refactor tests to use `createTestDirectories` helper.

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
