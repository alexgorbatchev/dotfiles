# Tech Context

This document details the technologies, development setup, and technical constraints relevant to this dotfiles project, now incorporating a TypeScript/Bun management tool.

## Technologies Used

- **Shell:** Zsh is the primary shell, with configurations now *generated* by the management tool. Bash shims will be generated for tool execution.
- **Management Tool:** TypeScript and Bun are used to build the core dotfiles management CLI application.
- **Command-line Tools:** Various tools are managed, including:
    - Fzf, Navi, Yazi, Zellij, Jq, Caddy, Chatgpt, Bat, Aerospace, Lazydocker, Fnm, K9s, Sentences, Eza, Grit, Shfmt, Spf, Bun, Sgpt, Gitui, Rust, Hermit, Zoxide, Fq, Dive, Nvim, Lazygit, Fly, Git-Town, Borders, Gh, Gum, Onefetch, Ast-grep, Btm, Ruff.
- **Configuration:** YAML is used for the main configuration file (`config.yaml`).
- **Version Control:** Git is used for managing the repository.
- **Scripting:** Bash scripting will be used within the generated shims for tool installation and execution logic. `zx` is used for running system commands within TypeScript.

## Development Setup

- The dotfiles are managed within a Git repository.
- Development of the management tool requires Node.js (or Bun) and TypeScript.
- A standard text editor or IDE (like VS Code) is used for editing TypeScript configuration files and the management tool's source code.
- Access to a Unix-like environment (macOS, Linux) is required for deployment and running the generated shims.

## Technical Constraints

- Compatibility of generated shims and shell configurations with different operating system versions and distributions needs careful consideration.
- The shim installation logic must correctly handle various tool installation methods (GitHub releases, Brew, curl scripts).
- Dependencies on external tools (brew, curl, etc.) are required for some installation methods to function.
- Dependencies on system tools (`tar`, `unzip`, `gunzip`) are required for archive extraction via `zx`.
- Writing shims to `/usr/bin` (or other system locations) requires appropriate permissions (sudo).
- The approach relies on the availability and functionality of symbolic links.

## Import Path Aliases

The project utilizes a primary `@`-prefixed import path alias configured in [`tsconfig.json`](tsconfig.json:1). The `compilerOptions.paths` in `tsconfig.json` is set to `{"@*": ["./src/*"]}`. This means that any import starting with `@` followed by a path (e.g., `@foo/bar` or `@modules/foo`) will have the path segment after `@` resolved relative to the `src/` directory.

Common usage patterns based on this single alias include:

-   `@path/to/file`: Resolves to `src/path/to/file` (general form).
-   `@modules/module-name`: Resolves to `src/modules/module-name`.
-   `@testing-helpers/helper-name`: Resolves to `src/testing-helpers/helper-name`.
-   `@types/type-definition`: Resolves to `src/types/type-definition`.

**Example:**

You must use the alias:

```typescript
import { Foo, type Bar, Baz } from '@modules/my-module';
```

**Benefits:**

-   **Readability:** Makes import paths shorter and easier to understand at a glance.
-   **Maintainability:** Reduces the need to update import paths when files are moved, as long as they remain within the aliased base directory.
-   **Reduced Errors:** Simplifies path construction, minimizing the chances of typos or incorrect relative path calculations.

## Dependencies

- Git
- Zsh (for the main shell)
- Bash (for shims)
- Bun (or Node.js/npm for the management tool development)
- TypeScript
- **Testing Helpers**: A comprehensive suite of testing helpers is available in `src/testing-helpers` to support unit, integration, and E2E tests. For a detailed overview of these helpers, see [docs/testing-helpers-analysis.md](docs/testing-helpers-analysis.md:1).
- NPM packages:
  - `consola`: Used by the `clientLogger` (from `src/modules/logger/createClientLogger.ts`) for standardized CLI output.
  - `debug`: For structured, namespaced logging (used internally by modules, distinct from `clientLogger`).
  - `dotenv`: For loading configuration from .env file
  - `memfs`: For virtual file system in testing and dry-run mode
- *Note on [`MemFileSystem.ts`](src/modules/file-system/MemFileSystem.ts:1) (uses `memfs`):* This implementation has been refactored to primarily use asynchronous internal operations (`this.vol.promises`). This aligns its internal workings more closely with typical asynchronous I/O patterns, even though it still fulfills the potentially mixed sync/async [`IFileSystem`](src/modules/file-system/IFileSystem.ts:1) interface.
  - `FetchMockHelper`: A utility (from `src/testing-helpers/FetchMockHelper.ts`) for mocking fetch requests in tests. This is complemented by real API response fixtures (captured via `curl`) for comprehensive testing of API clients like `GitHubApiClient`, as per project testing rules.
- **`createMockAppConfig` Helper:** A utility function (`createMockAppConfig(overrides?: Partial<AppConfig>): AppConfig`) located in [`src/testing-helpers/appConfigTestHelpers.ts`](src/testing-helpers/appConfigTestHelpers.ts:0) for creating mock `AppConfig` objects for tests.
    - **Benefits:** Ensures consistency in `AppConfig` mocks across tests, reduces boilerplate code, and makes tests easier to read and maintain by centralizing mock creation.
    - **Importing:**
      ```typescript
      import { createMockAppConfig } from '@testing-helpers/appConfigTestHelpers';
      ```
    - **Default Mock:**
      ```typescript
      // Example: Get default mock AppConfig
      const defaultConfig = createMockAppConfig();
      // Now use defaultConfig in your test...
      ```
    - **Customized Mock with Overrides:**
      ```typescript
      // Example: Override specific properties
      const customConfig = createMockAppConfig({
        githubApiCacheEnabled: false,
        targetDir: '/custom/test/dir'
      });
      // Now use customConfig in your test...
      ```
- **`createMemFileSystem` (In-Memory & Mockable File System):** A utility function (`createMemFileSystem(options: MemFileSystemOptions = {}): MemFileSystemReturn`) located in [`src/testing-helpers/createMemFileSystem.ts`](src/testing-helpers/createMemFileSystem.ts:1) for creating a fully functional in-memory `IFileSystem` instance that can be partially or fully mocked.
    - **Benefits:** Provides a real `MemFileSystem` instance by default, allowing tests to interact with a stateful file system. It also allows providing mocks for any `IFileSystem` method, offering the same level of control as the deprecated `createMockFileSystem`.
    - **Return Value (`MemFileSystemReturn`):**
      - `fs: IFileSystem`: The file system instance, which is a `MemFileSystem` wrapped with spies/mocks.
      - `spies: FileSystemSpies`: An object containing spies for all `IFileSystem` methods. This allows tests to make assertions about how the file system was used (e.g., `expect(spies.writeFile).toHaveBeenCalled()`).
    - **Options (`MemFileSystemOptions`):**
      - `initialVolumeJson?: Record<string, string>`: A JSON object to pre-populate the in-memory file system with files and their content.
      - `...mocks`: Any method from `IFileSystem` can be provided as a mock function, which will be used instead of the real `MemFileSystem` method.
    - **Importing:**
      ```typescript
      import { createMemFileSystem } from '@testing-helpers';
      ```
    - **Basic Usage (Stateful In-Memory FS):**
      ```typescript
      const { fs, spies } = createMemFileSystem({
        initialVolumeJson: {
          '/test/file.txt': 'hello world',
        },
      });
      // fs can be passed to classes expecting IFileSystem.
      // const content = await fs.readFile('/test/file.txt', 'utf8'); // content will be 'hello world'
      // expect(spies.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf8');
      ```
    - **Customizing a Specific Method (Mocking):**
      ```typescript
      import { mock } from 'bun:test';
      const mockReadFile = mock(async (path: string) => 'mocked content');
      const { fs } = createMemFileSystem({ readFile: mockReadFile });
      // Now fs.readFile will use your custom mockReadFile.
      ```
  - `zx`: For executing system commands within TypeScript scripts
  - `zod/v4`: For schema validation (e.g., GitHub API responses)
  - `eslint` and related plugins: For code quality and consistency
  - `prettier`: For code formatting
  - `semver`: For version comparison and constraint checking
  - Bun's (not jest, not vite) built-in test runner for unit and integration testing (`import ... from 'bun'`). The `bun run test` command is the primary command for comprehensive code validation, expected to cover unit tests, linting, and type checking as per project setup. The `test` script in [`package.json`](package.json:1) should be configured to ensure these checks are included.
    - Note: `bun run test [file]` can be used while working on a specific file, and `bun run test` (without specifying a file) **must** be used to verify the entire project before task completion.
  - **Logger Mocking and Assertions:**
    - Logger instances (created via `createLogger` using the `debug` module) **must not** be mocked in unit tests.
    - Unit tests **should not** attempt to assert or verify log output.
    - This rule reinforces the principle that logging is a side effect intended for observability and debugging, not a part of a module's testable contract. Adherence to this ensures tests focus on functional behavior rather than implementation details of logging.
- Tools managed by the dotfiles (installed on demand by shims): Fzf, Navi, Zellij, etc.
- System package managers/tools used for installation: brew, curl, etc.
- System tools used for archive extraction (via zx): `tar`, `unzip`, `gunzip`.

## Testing Conventions
- **E2E Testing for CLI Commands**: A standard pattern for E2E testing of CLI commands has been established. For details, see [docs/cli-e2e-testing-analysis.md](docs/cli-e2e-testing-analysis.md:1).

- **Test File Location:** Test files are named `*.test.ts` and must be stored in a `__tests__` directory located *directly next to the file or module directory they are testing*. For example, tests for `src/utils/myUtil.ts` should be in `src/utils/__tests__/myUtil.test.ts`.
- **Splitting Large Test Files:**
    - When a single test file (`OriginalFileName.test.ts`) becomes too large or covers too many distinct aspects of a module, it should be broken down into multiple, more focused test files.
    - The naming convention for these smaller, focused test files is `OriginalFileName--[specific-aspect-tested].test.ts`. For example, if `MyModule.test.ts` is being split, parts could become `MyModule--featureA.test.ts` and `MyModule--errorHandling.test.ts`.
    - The top-level `describe` block in each split file should generally remain the name of the module being tested (e.g., `describe('MyModule', ...)`). This maintains clarity about the overall module under test, even when tests are granular.
- **Test Spy Management (Example: [`src/__tests__/cli.test.ts`](src/__tests__/cli.test.ts:1)):**
    - For robust spy hygiene, particularly in complex test setups like in [`cli.test.ts`](src/__tests__/cli.test.ts:1), a consistent pattern is used in `beforeEach` blocks:
        - **Primary Reset Mechanism:** To ensure a clean state for each test, `mock.restore()` (imported from `bun:test`) **must** be called at the top of every `beforeEach` block. This resets all mocks created by `mock()` or `spyOn()` to their original implementations (or `undefined` if there was no original implementation).
- **Commander.js Test Isolation:**
    - To ensure proper test isolation when testing CLI applications built with Commander.js, especially when dealing with a global `program` instance or commands being registered multiple times across test files:
        - Instantiate the main `Command` object (e.g., `const program = new Command();`) *inside* the primary execution function (e.g., `main()` in [`src/cli.ts`](src/cli.ts:1)) rather than as a global singleton.
        - This ensures that each invocation of the main function (whether by the actual CLI or by a test runner calling an exported version of `main()`) operates on a fresh, isolated `program` instance.
        - This prevents errors like "command already defined" and ensures that options, hooks, and command actions do not bleed state between test runs.
- **Primary Validation Command:** Worker modes should be instructed to run `bun run test` for full validation of their changes, as this command is expected to encompass unit tests, linting, and type checking.

### Mandatory Code Validation

- **Critical Prerequisite for Task Completion:** Before concluding any coding or debugging task and reporting completion, it is **mandatory** to run the comprehensive code validation command: `bun run test`.
- **Scope of Validation:** The `bun run test` command is expected to cover all necessary checks, including unit tests, linting, and TypeScript type checking, as per the project's setup. This aligns with the "Testing" and "Code Quality" sections of `rules.md`, which state that `bun run test` enforces test coverage and `bun run lint` (which should be part of the `test` script) enforces quality.
- **Equal Importance to Core Logic:** Passing all checks executed by `bun run test` is considered as critical as the correctness of the implemented logic itself. These checks are essential for ensuring code correctness, robustness, and maintainability.
- **Explicit Confirmation:** When reporting task completion, agents **must** explicitly state that `bun run test` was executed and passed successfully. This confirms adherence to this critical quality gate.
### E2E Testing for `cli generate`
- **Location:** E2E tests for the `bun run cli generate` command are located in `src/__tests__/cli-generate.e2e.test.ts`.
- **Purpose:** These tests verify the end-to-end functionality of the `generate` command, ensuring that it correctly produces all expected artifacts (shims, shell initialization files, symlinks, manifest) based on a set of sample tool configurations.
- **Improved Structure:**
  - **Setup in `beforeAll()`:** All test setup and CLI execution is now performed in a `beforeAll()` hook, making the test more maintainable and efficient.
  - **Granular Test Cases:** The test is broken down into multiple, focused `it()` blocks that each verify a specific aspect of the generated artifacts.
  - **Controlled Debug Output:** The test explicitly sets `DEBUG: ''` in the environment variables to control debug output during test execution.
- **Isolation:** Each E2E test runs in a unique, isolated temporary directory.
  - A custom `.env` file is created within this temporary directory to configure all `AppConfig` paths (e.g., `DOTFILES_DIR`, `GENERATED_DIR`, `TOOL_CONFIGS_DIR`) to point to subdirectories within the temporary setup. This ensures the CLI operates entirely within the test's isolated environment.
  - Sample `*.tool.ts` files are copied into the temporary `toolConfigsDir`.
  - Dummy source files (e.g., for symlink targets) are created as needed within the temporary `dotfilesDir`.
- **Execution:** The `generate` command is executed using `Bun.spawnSync`, with the `cwd` set to the `` directory and the environment variables configured to use the paths within the temporary directory.
- **Verification:** Tests assert that:
  - The CLI command exits successfully.
  - All expected artifacts (shims, shell init files, symlinks, manifest file) are created in the correct locations within the temporary directory.
  - The content of these artifacts is as expected (e.g., shims are executable and contain correct logic, shell init files include tool-specific configurations, symlinks point to correct targets, manifest accurately reflects generated items).
  - Shims can be executed and function correctly (verified by running a mock tool).
- **Cleanup:** The temporary directory and all its contents are recursively deleted after each test run.

### E2E Testing for GitHub Downloads (`cli install`)

- **Mock GitHub API Server:**
    - A helper function `setupMockGitHubServer` is available in [`src/__tests__/helpers.ts`](src/__tests__/helpers.ts:1). This function uses `express` to create a lightweight HTTP server that can mock GitHub API endpoints.
    - **Usage:**
        ```typescript
        import { setupMockGitHubServer } from './helpers'; // Or appropriate path

        let mockServer: ReturnType<typeof setupMockGitHubServer>['server'];
        let mockApiUrl: string;

        beforeAll(async () => {
          const serverSetup = await setupMockGitHubServer((app) => {
            // Define mock routes, e.g., for latest release
            app.get('/repos/:owner/:repo/releases/latest', (req, res) => {
              res.json({ tag_name: 'v1.0.0', assets: [{ name: 'tool.zip', browser_download_url: `${mockApiUrl}/download/tool.zip` }] });
            });
            // Mock download route
            app.get('/download/:filename', (req, res) => {
              res.send('mock file content');
            });
          });
          mockServer = serverSetup.server;
          mockApiUrl = serverSetup.apiUrl;
        });

        afterAll(() => {
          mockServer.close();
        });

        // In tests, set GITHUB_HOST to mockApiUrl
        // process.env.GITHUB_HOST = mockApiUrl;
        ```
    - **Benefits:** Allows for testing GitHub download and installation logic without actual network requests to GitHub, avoiding rate limits and ensuring test reliability and speed.

- **`GITHUB_HOST` Configuration:**
    - The `GitHubApiClient` and `Installer` modules now respect the `GITHUB_HOST` environment variable.
    - If `GITHUB_HOST` is set (e.g., `http://localhost:PORT`), API requests that would normally go to `api.github.com` will be directed to this custom host. Asset download URLs are also constructed based on this host.
    - This is primarily used in E2E tests ([`cli-install.e2e.test.ts`](src/__tests__/cli-install.e2e.test.ts:1)) to point the `GitHubApiClient` to the `setupMockGitHubServer` instance.
    - This allows for complete end-to-end testing of the installation process involving GitHub releases in a controlled environment.

## CLI Logging and Verbosity with `clientLogger`

The `src` codebase has standardized on using the `clientLogger` (from `src/modules/logger/clientLogger.ts`, which is based on the `consola` library) for all user-facing CLI output. This replaces direct `console.*` calls (e.g., `console.log`, `console.warn`) throughout the application, with specific, justified exceptions.

**Key Aspects:**

-   **Standardization:** All direct `console.*` calls in `src` (e.g., `console.log`, `console.warn`) have been refactored to use the `clientLogger`.
    -   A notable instance includes the replacement of `console.warn` in `toolConfigBuilder.ts` with `clientLogger.warn`.
-   **Consistent Verbosity Control:** This change ensures that all CLI output consistently respects:
    -   `--verbose` flag (formerly `--details`): Enables detailed debug messages, typically using `logger.debug()`.
    -   `--quiet` flag: Suppresses all informational (`logger.info()`) and debug (`logger.debug()`) output. Errors are still displayed.
    -   `NODE_ENV=test`: The logger is automatically silenced when this environment variable is set to `test`, ensuring cleaner test runs.
-   **Output Methods:**
    -   Standard informational messages: `logger.info()`
    -   Detailed debug messages: `logger.debug()`
    -   Warnings: `logger.warn()`
    -   Errors: `logger.error()` (though critical bootstrap errors might still use `console.error` before logger initialization).
-   **Exception - Bootstrap `console.error` in `cli.ts`:**
    -   A direct `console.error` call is intentionally retained in `src/cli.ts` for critical errors that may occur during the initial bootstrap phase, *before* the `clientLogger` itself is initialized. This ensures that fundamental startup failures can still be reported to the user.
-   **Internal `debug` Module:** This standardization does *not* affect the internal, namespaced logging provided by the `debug` module (e.g., `const log = createLogger('MyModule')`). The `clientLogger` is for user-facing output, while `debug` is for internal development diagnostics.
-   **Benefits:**
    -   **Improved User Experience:** Provides predictable, consistent, and controllable CLI output. Users can tailor the verbosity to their needs.
    -   **Enhanced Maintainability:** Centralizes user-facing logging logic, making it easier to manage and modify output behavior globally.
    -   **Testability:** Consistent logger behavior simplifies testing of CLI commands and their outputs.

This standardized logging approach ensures a professional and user-friendly CLI experience.

## Tool Usage Patterns

- Tool configurations are defined in structured TypeScript files (default: `configs/tools/*.tool.ts`, configurable via `TOOL_CONFIG_DIR` in `.env`). These declarative configuration files, along with [`src/types.ts`](src/types.ts:1), do not require dedicated unit tests; their correctness is verified by the TypeScript compiler and through tests of the config loading and generator systems. Refer to the "Porting Tool Configurations to `*.tool.ts`" section for detailed guidelines.
- The `bun run generate` command (or similar) is used to build the management tool and generate shims, the Zsh init file, and link configs.
- The generated Zsh init file is sourced in the main Zsh profile.
- Tools are executed via the generated Bash shims, which handle delayed installation.
- Management commands (`cleanup`, `detect-conflicts`, `guess-lost-shims`, `check-updates`, `update`) are run manually via the TypeScript/Bun tool.

## Zinit Functionality Discovery Process

To fully understand and port the `zinit load` functionality to our TypeScript/Bun management tool, we'll follow a systematic approach:

### 1. Analysis of Existing Usage Patterns

We'll examine all `install.zsh` files in the `02-configs` directory to identify:

- Common patterns of `zinit ice` modifiers and their frequency
- Different repository sources (GitHub releases, regular repositories)
- Post-installation steps and hooks
- Platform-specific modifications
- Dependencies between tools

For example, from `02-configs/navi/install.zsh`:
```zsh
zinit ice lucid from=gh-r as=program
zinit load denisidoro/navi
```

### 2. Zinit Documentation Study

We'll review the official Zinit documentation to understand:

- The full range of `ice` modifiers and their meanings
- How Zinit handles different types of repositories
- The lifecycle of plugin installation and loading
- Default behaviors when certain options are omitted

### 3. Mapping Zinit Concepts to TypeScript Model (Including Asset Selection)

We'll create a comprehensive mapping between Zinit concepts and our TypeScript model. This includes not only `ice` modifiers but critically, **understanding and replicating Zinit's sophisticated heuristics for selecting the correct GitHub release asset**. Asset names vary widely (e.g., "darwin" vs "macos", "amd64" vs "x86_64", inclusion of "gnu" or "musl"), and simple `uname -s` / `uname -m` mappings are often insufficient. The analysis must cover how Zinit handles these variations, potentially through pattern matching, internal knowledge bases, or specific overrides.

The mapping will cover:

| Zinit Concept | TypeScript Model Equivalent |
|---------------|----------------------------|
| `zinit load repo` | `c.install('github-release', { repo: 'repo' })` |
| `from=gh-r` | `method: 'github-release'` |
| `bpick` | `assetPattern` parameter |
| `pick` | `binaryPath` parameter |
| `mv` | `moveBinaryTo` parameter |
| `atclone` | `hooks.afterDownload` function |
| `atpull` | `hooks.afterUpdate` function |
| `id-as` | Tool name in configuration |
| `as=program` | Handled by our shim generation logic |
| `lucid` | Not applicable (Zinit-specific loading option) |

### 4. Edge Case Identification

We'll identify edge cases in the current usage:

- Tools with complex post-installation steps
- Tools with platform-specific modifications
- Tools with dependencies on other tools
- Custom error handling in installation scripts
- Conditional logic based on environment variables

### 5. Implementation Strategy

Based on our analysis, we'll implement:

- A systematic approach to translate each `install.zsh` file, paying close attention to asset selection logic.
- A validation process to ensure all functionality, especially robust asset identification, is captured.
- Unit tests to verify the translation logic for various asset naming conventions.
- Documentation of any Zinit features or asset selection strategies that don't have direct equivalents or require complex replication.

This deep discovery process is crucial for faithfully reproducing Zinit's `from=gh-r` capabilities, particularly its platform and architecture-aware asset selection, in our new TypeScript/Bun management tool. Our `GithubReleaseInstallParams` will need to be flexible enough (e.g., supporting advanced glob/regex patterns, OS/arch mapping, or even custom selection functions in tool configs) to handle the diversity of release asset naming.
## Zinit Functionality Discovery Process

To fully understand and port the `zinit load` functionality to our TypeScript/Bun management tool, we'll follow a systematic approach:

### 1. Analysis of Existing Usage Patterns

We'll examine all `install.zsh` files in the `02-configs` directory to identify:

- Common patterns of `zinit ice` modifiers and their frequency
- Different repository sources (GitHub releases, regular repositories)
- Post-installation steps and hooks
- Platform-specific modifications
- Dependencies between tools

For example, from `02-configs/navi/install.zsh`:
```zsh
zinit ice lucid from=gh-r as=program
zinit load denisidoro/navi
```

### 2. Zinit Documentation Study

We'll review the official Zinit documentation to understand:

- The full range of `ice` modifiers and their meanings
- How Zinit handles different types of repositories
- The lifecycle of plugin installation and loading
- Default behaviors when certain options are omitted

### 3. Mapping Zinit Concepts to TypeScript Model (Including Asset Selection)

We'll create a comprehensive mapping between Zinit concepts and our TypeScript model. This includes not only `ice` modifiers but critically, **understanding and replicating Zinit's sophisticated heuristics for selecting the correct GitHub release asset**. Asset names vary widely (e.g., "darwin" vs "macos", "amd64" vs "x86_64", inclusion of "gnu" or "musl"), and simple `uname -s` / `uname -m` mappings are often insufficient. The analysis must cover how Zinit handles these variations, potentially through pattern matching, internal knowledge bases, or specific overrides.

The mapping will cover:

| Zinit Concept | TypeScript Model Equivalent |
|---------------|----------------------------|
| `zinit load repo` | `c.install('github-release', { repo: 'repo' })` |
| `from=gh-r` | `method: 'github-release'` |
| `bpick` | `assetPattern` parameter |
| `pick` | `binaryPath` parameter |
| `mv` | `moveBinaryTo` parameter |
| `atclone` | `hooks.afterDownload` function |
| `atpull` | `hooks.afterUpdate` function |
| `id-as` | Tool name in configuration |
| `as=program` | Handled by our shim generation logic |
| `lucid` | Not applicable (Zinit-specific loading option) |

### 4. Edge Case Identification

We'll identify edge cases in the current usage:

- Tools with complex post-installation steps
- Tools with platform-specific modifications
- Tools with dependencies on other tools
- Custom error handling in installation scripts
- Conditional logic based on environment variables

### 5. Implementation Strategy

Based on our analysis, we'll implement:

- A systematic approach to translate each `install.zsh` file, paying close attention to asset selection logic.
- A validation process to ensure all functionality, especially robust asset identification, is captured.
- Unit tests to verify the translation logic for various asset naming conventions.
- Documentation of any Zinit features or asset selection strategies that don't have direct equivalents or require complex replication.

This deep discovery process is crucial for faithfully reproducing Zinit's `from=gh-r` capabilities, particularly its platform and architecture-aware asset selection, in our new TypeScript/Bun management tool. Our `GithubReleaseInstallParams` will need to be flexible enough (e.g., supporting advanced glob/regex patterns, OS/arch mapping, or even custom selection functions in tool configs) to handle the diversity of release asset naming.

## Updated Download Mechanism (Swappable Design)

Based on analysis of Zinit's download capabilities, we'll implement a swappable download mechanism using the strategy pattern. The `Downloader` class manages a collection of `DownloadStrategy` instances and selects the first available one to perform the download.

## Archive Extraction (`ArchiveExtractor`)

The `ArchiveExtractor` module ([`src/modules/extractor/ArchiveExtractor.ts`](src/modules/extractor/ArchiveExtractor.ts:0)) is responsible for extracting various archive file formats. It uses system commands like `tar` and `unzip` to handle archives and can detect formats based on file extensions or the `file` command.

## Completion File Management

To support shell completion files as first-class citizens:

```typescript
interface CompletionConfig {
  zsh?: {
    source: string;      // Path within the extracted archive
    name?: string;       // Defaults to _${toolName}
    targetDir?: string;  // Defaults to .generated/completions/zsh
  };
  bash?: {
    source: string;
    name?: string;
    targetDir?: string;  // Defaults to .generated/completions/bash
  };
}

// Extended ToolConfig
interface ToolConfig {
  // ... existing fields ...
  completions?: CompletionConfig;
}

// Completion installer
class CompletionInstaller {
  async installCompletions(
    toolName: string,
    extractedDir: string,
    config: CompletionConfig
  ): Promise<void> {
    if (config.zsh) {
      const source = path.join(extractedDir, config.zsh.source);
      const name = config.zsh.name || `_${toolName}`;
      const target = path.join(
        config.zsh.targetDir || '.generated/completions/zsh',
        name
      );
      await fs.copyFile(source, target);
    }
    
    // Similar for bash...
  }
}
```

## GitHub API Integration (Zinit-Compatible) with Caching

The `GitHubApiClient` module handles all interactions with the GitHub API. It supports fetching release information, handling rate limits, and caching responses to improve performance and avoid hitting rate limits.

## Update Checking Mechanism

The `VersionChecker` module (`src/modules/versionChecker/`) handles version tracking and update notifications. It provides functionalities for semantic version comparison, version constraint checking, and determining if updates are available for installed tools.

Key aspects of the `VersionChecker` module:
- **`IVersionChecker.ts`**: Defines the interface for version checking operations.
- **`VersionChecker.ts`**: Implements the `IVersionChecker` interface, utilizing the `semver` library for version comparisons and constraint evaluations.
- **Update Information**: The module can determine if a newer version of a tool is available by comparing the currently installed version (tracked in a manifest file) against the latest available version (e.g., from GitHub releases).
- **Integration**: It integrates with the `GitHubApiClient` to fetch the latest release information for tools installed from GitHub.

```typescript
// (Conceptual example from IVersionChecker.ts and VersionChecker.ts)

import semver from 'semver'; // Assuming 'semver' is a project dependency

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes?: string;
  downloadUrl?: string; // Potentially derived by other services
}

export interface IVersionChecker {
  isNewerVersion(currentVersion: string, latestVersion: string): boolean;
  satisfiesConstraint(version: string, constraint: string): boolean;
  // Potentially a method to check for updates for a specific tool,
  // which would internally use IGitHubApiClient and manifest data.
  // async checkForUpdate(toolName: string, currentVersion: string, source: ToolSource): Promise<UpdateInfo | null>;
}

export class VersionChecker implements IVersionChecker {
  // constructor(private githubClient: IGitHubApiClient, private manifestReader: IManifestReader) {}

  isNewerVersion(currentVersion: string, latestVersion: string): boolean {
    try {
      // Ensure versions are clean (e.g., remove 'v' prefix)
      const cleanCurrent = currentVersion.replace(/^v/, '');
      const cleanLatest = latestVersion.replace(/^v/, '');
      return semver.gt(cleanLatest, cleanCurrent);
    } catch (error) {
      // Handle invalid version strings if necessary
      console.error(`Error comparing versions: ${currentVersion}, ${latestVersion}`, error);
      return false;
    }
  }

  satisfiesConstraint(version: string, constraint: string): boolean {
    try {
      const cleanVersion = version.replace(/^v/, '');
      return semver.satisfies(cleanVersion, constraint);
    } catch (error) {
      console.error(`Error checking constraint: ${version}, ${constraint}`, error);
      return false;
    }
  }

  // Example of how checkForUpdate might be structured:
  /*
  async checkForUpdate(toolName: string, currentVersion: string, toolConfig: ToolConfig): Promise<UpdateInfo | null> {
    if (toolConfig.installationMethod === 'github-release') {
      const params = toolConfig.installParams as GithubReleaseInstallParams;
      const [owner, repo] = params.repo.split('/');
      
      // This would use the IGitHubApiClient
      const latestRelease = await this.githubClient.getLatestRelease(owner, repo);
      if (!latestRelease) return null;

      const latestVersion = latestRelease.tag_name.replace(/^v/, '');

      return {
        currentVersion,
        latestVersion,
        updateAvailable: this.isNewerVersion(currentVersion, latestVersion),
        releaseNotes: latestRelease.body,
        // downloadUrl might be determined by an asset selection logic here or elsewhere
      };
    }
    // Handle other installation methods...
    return null;
  }
  */
}
```

## Planned Technical Structure

- **Project Directory:** The TypeScript/Bun tool will reside in the `` directory.
- **Main CLI Entry Point:** `src/index.ts` or `src/cli.ts` (imports from modules).
- **Shared Types:** Project-wide shared type definitions have been refactored from a single [`src/types.ts`](src/types.ts:1) file into a dedicated `src/types/` directory. Individual type files (e.g., [`appConfig.types.ts`](src/types/appConfig.types.ts:0), [`archive.types.ts`](src/types/archive.types.ts:0)) now house specific groups of types and are re-exported via a barrel file, [`src/types/index.ts`](src/types/index.ts:1). This modular structure improves organization and maintainability.
    - The `InstallResult` interface (now likely within a file like [`src/types/common.types.ts`](src/types/common.types.ts:0) or similar) has been updated to include:
        - `symlinkPath?: string`: Stores the absolute path to the created symlink in the main binary directory (e.g., `~/.dotfiles/.generated/bin/tool`). This is populated by the `Installer` module.
        - `otherChanges?: string[]`: An array to log other filesystem changes or important messages during installation, also populated by the `Installer`. This array captures detailed steps like download progress, extraction activities, permission modifications, and binary placement, offering a comprehensive log of the installation process.
- **Tool Configurations:** Individual tool configurations will be TypeScript files within `src/tools/` (configurable via `TOOL_CONFIG_DIR`). Each file will export an `AsyncConfigureTool` function.
- **Shim Template:** A single generic Bash shim template will be stored in `src/templates/shim.sh`.
- **Core Modules (within `src/modules/` using dash-case names, each with `index.ts` and `__tests__/`):**
    - `logger/`: Contains `createLogger.ts` (exports `createLogger` function) ✅ (to be refactored)
    - `architecture-utils/`: Contains `getArchitectureRegex.ts` (exports architecture detection utilities) ✅ (to be refactored)
    - `config/`: Contains `config.ts` (handles loading `.env`, defaults, CLI overrides) ✅ (to be refactored)
    - `tool-config-builder/`: Contains `toolConfigBuilder.ts` (defines `ToolConfigBuilder`) ✅ (to be refactored)
    - `file-system/`: For core file system abstraction utilities ❌ (new)
    - `downloader/`: Contains download strategy implementation (`IDownloader.ts`, `Downloader.ts`, `strategies/`) ❌ (new)
    - `extractor/`: Contains archive extraction utilities (`IArchiveExtractor.ts`, `ArchiveExtractor.ts`) ❌ (new)
    - `github-client/`: Contains GitHub API client (`IGitHubApiClient.ts`, `GitHubApiClient.ts`) ❌ (new)
    - `completion-installer/`: Contains completion file management (`ICompletionInstaller.ts`, `CompletionInstaller.ts`) ❌ (new)
    - `version-checker/`: Contains version checking utilities (`IVersionChecker.ts`, `VersionChecker.ts`) ✅ (implemented)
    - `config-loader/`: Logic for loading tool configurations from `src/tools/` ❌ (new)
    - `installation-orchestrator/`: (Tentative name) Manages the overall installation process for a tool, calling other services like downloader, extractor, etc. This might replace the monolithic `installTool.ts`. ❌ (new)
- **Generated Files (all within `.generated/`):**
    - **Shims:** Generic Bash scripts generated in the configurable target directory (default: `/usr/bin`).
    - **Manifest File:** A JSON file (`.generated/manifest.json`) representing the `GeneratedArtifactsManifest` type (defined in `src/types.ts`). This manifest tracks:
        - `shims: string[]`: Paths to all generated shim files.
        - `shellInit: { path: string | null }`: Path to the generated shell initialization file, or null.
        - `symlinks: SymlinkOperationResult[]`: Detailed results for each symlink operation.
        - `lastGenerated: string`: ISO timestamp of the last generation.
    - **Cached Downloads:** In `.generated/cache/<tool_name>/`.
    - **Installed Binaries:** In `.generated/binaries/<tool_name>/bin/`.
    - **Binary Symlinks:** In `.generated/bin/`.
    - **Zsh Init File:** A single Zsh script (`.generated/zsh/init.zsh`).
    - **Completions:** Shell completion files in `.generated/completions/zsh/` and `.generated/completions/bash/`.

## Bash Shim Template Details

The `ShimGenerator` module creates generic Bash shims. These shims are written to the directory specified by `appConfig.targetDir` (configurable via the `TARGET_DIR` environment variable, see lines [618-620](memory-bank/techContext.md:618-620)).

### Path Resolution in ShimGenerator

The `ShimGenerator` uses ES modules' `import.meta.url` feature to determine the absolute path to the installation script:

```typescript
// Create absolute path to the install-tool.sh script based on the generator's own location
const currentModulePath = fileURLToPath(import.meta.url);
const currentModuleDir = path.dirname(currentModulePath);
// Navigate from current module directory to scripts directory
const installToolScriptPath = path.join(
  currentModuleDir, // src/modules/generator-shim
  '..', // src/modules
  '..', // src
  'scripts',
  'install-tool.sh'
);
```

This approach makes the generator location-independent, not relying on `appConfig.dotfilesDir`. It ensures the generator works correctly regardless of its installation location.

Each shim will start with `#!/usr/bin/env bash` and include logic to:
1. Define the tool name and expected binary path (e.g., `.dotfiles/.generated/bin/<binary_name>`).
2. Define the absolute path to the installation script (`INSTALL_TOOL="${installToolScriptPath}"`).
3. Check if the tool binary exists.
4. If not found, call the installation script with the tool name and CLI command (`"$INSTALL_TOOL" "${toolName}" "${cliToolPath}"`).
5. Execute the actual tool binary using `exec "$TOOL_EXECUTABLE" "$@"`.

## Installation Script Details

The installation script (`install-tool.sh`) is a Bash wrapper script that:
1. Takes a tool name as the first argument and an optional CLI command as the second argument.
2. Uses the CLI command (defaulting to "mydotfiles" if not provided) to install the tool.
3. Checks the exit status and reports success or failure.

```bash
#!/usr/bin/env bash
# install-tool.sh
# Script to handle tool installation based on the tool's configuration

set -e

# Parse arguments
TOOL_NAME="$1"
if [ -z "$TOOL_NAME" ]; then
  echo "Error: Tool name is required"
  echo "Usage: $0 <tool-name>"
  exit 1
fi

# The main CLI command will be passed as the second argument
CLI_COMMAND="$2"
if [ -z "$CLI_COMMAND" ]; then
  CLI_COMMAND="mydotfiles" # Default if not provided
fi

echo "Installing tool: $TOOL_NAME using $CLI_COMMAND..."

# Execute the installation command
"$CLI_COMMAND" install "$TOOL_NAME"

# Check the exit status
if [ $? -ne 0 ]; then
  echo "Failed to install $TOOL_NAME"
  exit 1
fi

echo "Installation of $TOOL_NAME completed successfully"
exit 0
```

This script serves as a bridge between the generated shims and the main CLI tool, allowing for flexible installation of tools.

## TypeScript Installation Script Details

The main CLI's installation command will:
1. Import the tool configuration from the configured tool directory (e.g., `src/tools/<tool_name>.ts` or `${TOOL_CONFIG_DIR}/<tool_name>.ts`).
2. Create a tool config builder and configure the tool.
3. Determine the current OS and architecture.
4. Apply architecture-specific overrides.
5. Create the necessary directories (cache, binaries, bin).
6. Check if the tool is already cached and reuse if possible.
7. Download the tool asset using the `downloader` service.
8. Extract the downloaded asset using the `extractor` service.
9. Run any defined hooks.
10. Locate the binary within the extracted files (using `binaryPath` or `moveBinaryTo` logic).
11. Move the binary to the final location in `.generated/binaries/<tool_name>/bin/`.
12. Create a symlink in `.generated/bin/` pointing to the installed binary.
13. Handle completions if specified using the `completions` service.
14. Update the manifest with version information.

## Configuration System (`config.yaml` and `.env`)

The project is migrating from a `.env` file to a structured `config.yaml` file as the primary source of configuration. The `.env` file may still be used for environment-specific overrides (e.g., secrets, local paths) that are not suitable for checking into version control. The new `config.yaml` provides a more robust and flexible way to manage settings, especially platform-specific configurations. See `systemPatterns.md` for details on the new YAML-based loading pattern.

An example/template `.env` file is available at `.env`. This file lists all available environment variables, their JSDoc descriptions, and default values, serving as a comprehensive guide for users to understand and customize their setup. By default, variables with non-empty default values are uncommented in this template. The general structure for defining variables in the `.env` file (and as reflected in the template) is:
```bash
# Dotfiles Generator Configuration

# Directory where shims will be generated
# Default: /usr/bin
TARGET_DIR=/usr/bin

# Path to dotfiles directory (auto-detected if not specified)
# DOTFILES_DIR=/Users/username/.dotfiles

# Path to generated files directory
# Default: ${DOTFILES_DIR}/.generated
# GENERATED_DIR=/Users/username/.dotfiles/.generated

# Path to tool configuration files directory
# Default: ${DOTFILES_DIR}/configs/tools
# TOOL_CONFIG_DIR=/Users/username/.dotfiles/configs/tools

# Debug configuration
# Examples:
#   DEBUG=dot:*                 # Enable all debug logs
#   DEBUG=dot:installTool       # Enable specific component logs
#   DEBUG=dot:*,-dot:fileUtils  # Enable all except specific components
DEBUG=

# Enable download caching
# Default: true
CACHE_ENABLED=true

# Custom sudo prompt message (optional)
# SUDO_PROMPT=Password for dotfiles generator:

# GitHub API Configuration
# Optional: GitHub token for increased rate limits
# GITHUB_TOKEN=

# Completion directories
# COMPLETIONS_DIR=${GENERATED_DIR}/completions

# Version checking
# CHECK_UPDATES_ON_RUN=true
# UPDATE_CHECK_INTERVAL=86400  # 24 hours in seconds

# Download configuration
# DOWNLOAD_TIMEOUT=300000      # 5 minutes in milliseconds
# DOWNLOAD_RETRY_COUNT=3
# DOWNLOAD_RETRY_DELAY=1000    # 1 second
```

A centralized configuration module (`src/config.ts`) will:
- Load the `.env` file using the `dotenv` package
- Provide sensible defaults for all configuration options
- Allow overriding via command-line arguments
- Expose derived paths (cache directory, binaries directory, etc.)

### AppConfig Path Resolution (Tilde Expansion)

A key feature of the configuration loading process within [`src/modules/config/config.ts`](src/modules/config/config.ts:1) is the automatic expansion of tilde (`~`) characters in path-like configuration values. This applies to all relevant paths loaded from environment variables or their defaults, including but not limited to:
   - `DOTFILES_DIR`
   - `TOOL_CONFIGS_DIR`
   - `GENERATED_DIR`
   - `TARGET_DIR`
   - `COMPLETIONS_DIR`

The expansion is performed using `systemInfo.homedir` (obtained from `os.homedir()`). As a result, all path properties stored within the `AppConfig` object are guaranteed to be absolute and fully resolved, ensuring consistency and reliability when these paths are used throughout the application.

### Home Directory Resolution in SymlinkGenerator

The `SymlinkGenerator` module has been updated to correctly use `appConfig.homeDir` directly for path resolution:

```typescript
// In SymlinkGenerator.generate()
const homeDir = this.appConfig.homeDir;
const projectRoot = this.appConfig.dotfilesDir;

// Later, when resolving target paths
let targetAbsPath = targetRelPath.startsWith('~')
  ? path.join(homeDir, targetRelPath.substring(1))
  : path.join(homeDir, targetRelPath);
```

This ensures that symlinks work correctly in isolated environments like E2E tests, where the home directory might be set to a temporary location. Previously, the module was incorrectly deriving the home directory from `appConfig.dotfilesDir`, which could lead to incorrect path resolution in certain scenarios.

## Tool Configuration Loading (`loadToolConfigs`)

The system employs a dynamic mechanism for loading and validating tool configurations, primarily through the `loadToolConfigs()` function.

-   **Location:** The core logic for this is located in [`src/modules/config-loader/toolConfigLoader.ts`](src/modules/config-loader/toolConfigLoader.ts:1).
-   **Process:**
    -   The function scans the directory specified by `AppConfig.toolConfigsDir` (derived from `TOOL_CONFIGS_DIR` env var, defaulting to `configs/tools/`).
    -   It searches for files matching the `*.tool.ts` pattern.
    -   Each found file is dynamically imported.
    -   The default export of each `*.tool.ts` file is then processed:
        -   **If the export is a function (`AsyncConfigureTool` pattern):**
            1.  A new `ToolConfigBuilder` instance is created.
            2.  The exported function is called with this `ToolConfigBuilder` instance and the `appConfig`. The function is expected to utilize the builder and return a `ToolConfig` object, potentially wrapped in a `Promise`.
            3.  The loader then `await`s the result. If the function returns a `Promise<ToolConfig>`, this step ensures the promise is resolved to the actual `ToolConfig` object.
            4.  This resolved `ToolConfig` object is subsequently passed to the Zod schema for validation. This critical step ensures that the actual configuration data, not the promise or the builder itself, is validated.
        -   **If the export is an object:**
            1.  The exported object is assumed to be a `ToolConfig` directly.
            2.  This `ToolConfig` object is then validated.
-   **Validation Schema:** The [`ToolConfigSchema`](src/modules/config/toolConfigSchema.ts:1) (defined in [`src/modules/config/toolConfigSchema.ts`](src/modules/config/toolConfigSchema.ts:1)) plays a crucial role in ensuring the integrity and correctness of each tool's configuration before it's used by the system. It uses Zod for robust validation.
-   **Configuration:**
    -   The `toolConfigsDir` property in `AppConfig` (defined in [`src/types.ts`](src/types.ts:1)) specifies the directory to search for `*.tool.ts` files.
    -   This is typically set via the `TOOL_CONFIGS_DIR` environment variable, as managed by the configuration system in [`src/modules/config/config.ts`](src/modules/config/config.ts:1).

This enhanced loading mechanism allows `*.tool.ts` files to either export a `ToolConfig` object directly or an `AsyncConfigureTool` function. This provides flexibility, particularly for more complex configurations that benefit from the `ToolConfigBuilder` and access to `appConfig` during their setup. The `AsyncConfigureTool` pattern is the standard way `toolConfigLoader.ts` consumes function-based tool configurations.

## TypeScript Configuration Structure (Detailed Requirements)

### `ToolConfig` Discriminated Union Refactor

The `ToolConfig` type, along with its Zod schema (`ToolConfigSchema`) and the `ToolConfigBuilder`, has been refactored to use a discriminated union pattern based on the `installationMethod` property.

-   **Discriminated Union:** `ToolConfig` is now a discriminated union. The `installationMethod` field acts as the discriminant.
-   **Specific `installParams`:** The `installParams` object within `ToolConfig` is now specific to the chosen `installationMethod`. This means that `installParams` will only contain properties that are relevant and valid for that particular installation method. For example, if `installationMethod` is `'github-release'`, `installParams` will conform to `GithubReleaseInstallParams`.
-   **`installationMethod: 'none'`:** For tools that do not have a direct installation process managed by the installer (e.g., built-in shell commands, tools managed by other systems, or tools that are already expected to be present), the `installationMethod: 'none'` variant is used. In this case, `installParams` is typically an empty object or can be omitted if the schema allows.
-   **`ToolConfigSchema` Update:** The Zod schema, `ToolConfigSchema` (defined in [`src/modules/config/toolConfigSchema.ts`](src/modules/config/toolConfigSchema.ts:1)), has been updated to reflect this discriminated union. It now correctly validates that `installParams` aligns with the specified `installationMethod`.
-   **Impact on `ToolConfigBuilder`:** The `ToolConfigBuilder`'s `install()` method signatures and internal logic have been updated to support this new structure, ensuring that it constructs valid `ToolConfig` objects according to the discriminated union.
-   **Benefits:** This refactoring significantly enhances type safety and the robustness of configuration validation. It prevents invalid combinations of `installationMethod` and `installParams` at both compile-time (due to TypeScript's discriminated union support) and runtime (due to Zod validation), leading to more reliable tool configurations.
```typescript
// Define context passed to TypeScript hooks
interface InstallHookContext {
  toolName: string;
  installDir: string; // The directory where the tool's binary will be installed
  downloadPath?: string; // Path to the downloaded file/archive (available after download hook)
  extractDir?: string; // Path to the extracted contents (available after extract hook)
  extractResult?: ExtractResult; // Result of extraction with executables list
  systemInfo?: SystemInfo; // System information for hooks
  // Use google/zx for running commands and file system operations within hooks
}

// Define the type for asynchronous TypeScript hook functions
type AsyncInstallHook = (context: InstallHookContext) => Promise<void>;

// Base interface for installation parameters, includes common hook properties
interface BaseInstallParams {
  /**
   * Environment variables to set specifically for the installation process.
   * These are set by the generator's install-tool command before running
   * the installation command and hooks.
   */
  env?: { [key: string]: string };

  hooks?: {
    beforeInstall?: AsyncInstallHook; // Runs before any installation steps
    afterDownload?: AsyncInstallHook; // Runs after the tool's archive/script is downloaded
    afterExtract?: AsyncInstallHook; // Runs after the archive is extracted (for archive-based methods)
    afterInstall?: AsyncInstallHook; // Runs after the main installation command completes
  };
}

// Specific interfaces for installParams for each method, extending BaseInstallParams
interface GithubReleaseInstallParams extends BaseInstallParams {
  repo: string; // GitHub repository in "owner/repo" format
  assetPattern?: string; // Pattern to match the release asset filename (corresponds to Zinit's bpick)
  binaryPath?: string; // Path to the executable within the extracted archive (corresponds to Zinit's pick)
  moveBinaryTo?: string; // Path/name to move the extracted binary to (corresponds to Zinit's mv)
  version?: string; // Specific version or constraint
  includePrerelease?: boolean; // Whether to include pre-releases
  assetSelector?: (assets: GitHubReleaseAsset[], systemInfo: SystemInfo) => GitHubReleaseAsset | undefined; // Custom asset selection function
  // atclone is replaced by hooks.afterDownload or hooks.afterExtract
}

// ... other install param interfaces ...

// Define the ToolConfigBuilder interface with camelCase methods
interface ToolConfigBuilder {
  /**
   * Specifies the names of the binaries that should have shims generated.
   * @param names A single binary name or an array of names.
   */
  bin(names: string | string[]): this;

  /**
   * Specifies the desired version of the tool. Defaults to 'latest'.
   * @param version The version string (e.g., '1.0.0') or 'latest'.
   */
  version(version: string): this;

  /**
   * Configures how the tool is installed.
   * @param method The installation method.
   * @param params Parameters specific to the installation method, including optional hooks.
   */
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  // Add overloads for other methods if needed

  /**
   * Defines asynchronous TypeScript hook functions to run during the installation lifecycle.
   * @param hooks An object containing optional hook functions for different stages.
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;

  /**
   * Adds raw Zsh code to the generated 02-config-generated/init.zsh file.
   * Use this for aliases, functions, env vars, path additions, sourcing, etc.
   * @param code A string containing valid Zsh script.
   */
  zsh(code: string): this;

  /**
   * Configures a symbolic link from a source path in the dotfiles repo to a target path in the home directory.
   * @param source The path relative to the dotfiles repository.
   * @param target The target path relative to the user's home directory.
   */
  symlink(source: string, target: string): this;

  /**
   * Defines configuration overrides for specific operating system and architecture combinations.
   * @param osArch The OS-architecture string (e.g., 'darwin-aarch64', 'linux-x86_64'). Use $(uname -s)-$(uname -m) format.
   * @param configureOverrides A callback function that receives a new ToolConfigBuilder to define the overrides.
   */
  arch(osArch: string, configureOverrides: (c: ToolConfigBuilder) => void): this;
  
  /**
   * Configures shell completions for the tool.
   * @param config An object containing completion configuration for different shells.
   */
  completions(config: CompletionConfig): this;
}

/**
 * The main function exported by each tool configuration file.
 * It receives a ToolConfigBuilder and defines the tool's configuration.
 * @param c The ToolConfigBuilder instance.
 */
type AsyncConfigureTool = (c: ToolConfigBuilder) => Promise<void>;
```

## Porting Tool Configurations to `*.tool.ts`

A standard pattern is emerging for defining `*.tool.ts` files, which involves exporting an `AsyncConfigureTool` function that utilizes the `ToolConfigBuilder`. This approach promotes a clean, builder-based pattern for defining tool configurations. Examples of this best practice can be seen in [`configs/tools/lazygit.tool.ts`](configs/tools/lazygit.tool.ts:1) and [`configs/tools/fzf.tool.ts`](configs/tools/fzf.tool.ts:1).

These are strict guidelines for creating
