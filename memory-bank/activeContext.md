# Active Context

This document captures the current work focus, recent changes, next steps, and active considerations for the dotfiles project.

## Current Work Focus
- **Testing Helper Refactoring:** The testing helpers for the file system have been refactored. The `createMockFileSystem` has been deprecated in favor of the new `createMemFileSystem` helper, which provides a more robust and flexible way to test file system interactions.

## Recent Changes

*   **Testing Helper Refactoring:** Refactored the `createMemFileSystem` testing helper to provide a more robust and flexible way to test file system interactions. This new helper replaces the deprecated `createMockFileSystem`.
*   **Configuration Migration Planning:** Completed an intensive planning and design phase for migrating the application's configuration from `.env` files to a single, structured `config.yaml`.
*   **Meta-Comment Rule:** Added a new rule to `.roo/rules/rules.md` to explicitly forbid meta-comments.
*   **Global `--config` Option and Test Refactoring:** Implemented the global `--config <path>` option and refactored tests for better isolation.
*   **Standardized Code Validation Command:** Standardized the primary code validation command to `bun run test` for all worker modes.
*   **Implemented `check-updates` Command:** Fully implemented and tested the `check-updates` command.
*   **Dependency Injection & Service Setup Refactoring:**
    *   Command action handlers now call `setupServices` to get fresh instances of core services, configured for the command's context (e.g., `--dry-run`).
    *   Most `register...Command` functions have been simplified to only accept the Commander `program` instance.
*   **Client Logger Instantiation per Command:** Each command's action handler is now responsible for creating its own `clientLogger`.
*   **Implemented `update` Command:** Implemented and tested the `update <toolName>` command.
*   **Implemented `detect-conflicts` Command:** Implemented and tested the `detect-conflicts` command.
*   **Standardized CLI Output with `clientLogger`:** Refactored all `console.*` calls to use the `clientLogger` for consistent, controllable output.
*   **Refactored Type Definitions and Added JSDoc:** Moved shared types into the `src/types/` directory and added comprehensive JSDoc documentation.
*   **Refactored `ToolConfig` to Discriminated Union:** Improved type safety by refactoring `ToolConfig` to a discriminated union based on `installationMethod`.
*   **Improved CLI Logging System:** Implemented global verbosity control with `--verbose` and `--quiet` flags.
*   **Improved CLI Logging System:** Implemented global verbosity control with `--verbose` and `--quiet` flags.

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
