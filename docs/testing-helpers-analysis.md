# Testing Helpers Analysis

This document provides an overview of the testing helpers available in the `src/testing-helpers` directory. These helpers are designed to streamline the process of writing unit, integration, and end-to-end (E2E) tests for the generator CLI.

## Core Concepts

The testing strategy relies on a combination of mocking and E2E testing in isolated environments.

-   **Mocking**: For unit and integration tests, helpers are provided to mock dependencies like the file system (`IFileSystem`), application configuration (`AppConfig`), the client logger (`ConsolaInstance`), and `fetch` requests. This allows for testing individual modules in isolation.
-   **E2E Testing**: For end-to-end tests, helpers are provided to create fully isolated temporary directory structures, set up environment variables, and execute the CLI tool as a subprocess. This allows for testing the entire application flow from command execution to artifact generation.

## Helper Categories

### Test Environment & Execution

-   **`bun-preload.ts`**: A script that runs before tests to enforce the use of `bun run test` and set `NODE_ENV=test`.
-   **`bun-test-runner.ts`**: A custom test runner that filters and formats the output of `bun test` to be more concise and focused on failures and coverage.
-   **`executeCliCommand.ts`**: A crucial helper for E2E tests. It executes the CLI tool in a subprocess using `Bun.spawnSync` and returns the `stdout`, `stderr`, and `exitCode`.
-   **`setupEnvironmentVariables.ts`**: Sets up a standard set of environment variables required for E2E tests, pointing all necessary paths to a temporary test directory.

### Mocking Helpers

-   **`createMockAppConfig.ts`**: Creates a mock `AppConfig` object, which is essential for testing modules that depend on application configuration.
-   **`createMockClientLogger.ts`**: Creates a mock `ConsolaInstance` to test CLI output without printing to the console.
-   **`createMockFileSystem.ts`**: Creates a highly configurable mock of the `IFileSystem` interface, allowing individual file system methods to be spied on or replaced with custom implementations.
-   **`createMemFileSystem.ts`**: Creates an in-memory file system using `memfs`. This is useful for tests that need a fully functional but temporary file system.
-   **`FetchMockHelper.ts`**: A class to mock `globalThis.fetch`, which is critical for testing any code that makes HTTP requests, such as the `GitHubApiClient`.
-   **`createMockGitHubServer.ts`**: Sets up an `express` server to mock the GitHub API. This is used in E2E tests to simulate responses from GitHub without making real network requests, avoiding rate limits and ensuring test reliability.

### Test Setup & Fixtures

-   **`createTempDir.ts`**: A simple utility to create a clean temporary directory for a test run.
-   **`createTestDirectories.ts`**: A comprehensive helper for E2E tests that creates a complete, isolated directory structure, including a mock dotfiles repository, generated files directory, and binary directories.
-   **`createToolConfig.ts`**: A helper to create `*.tool.ts` files within a test's temporary directory, making it easy to test the `config-loader` and generator modules with various tool configurations.
-   **`createBinFile.ts`**: Creates an executable file, useful for simulating the presence of a binary that the generator might need to interact with or check for.

### Barrel File

-   **`index.ts`**: Exports all the helpers from the module, providing a single entry point for imports in test files.

## How They Work Together (E2E Example)

A typical E2E test (like [`cli-install.e2e.test.ts`](src/__tests__/cli-install.e2e.test.ts:1)) would use these helpers in the following sequence:

1.  **`createTestDirectories`**: Create the entire isolated file system structure for the test.
2.  **`createToolConfig`**: Populate the `toolConfigsDir` with one or more `*.tool.ts` files.
3.  **`createBinFile`**: If needed, create mock binaries or other source files.
4.  **`createMockGitHubServer`**: If the test involves a `github-release` installation, start a mock server to provide predictable API and download responses.
5.  **`setupEnvironmentVariables`**: Prepare the `process.env` object, pointing all paths to the directories created in step 1 and setting the `GITHUB_HOST` to the mock server's URL from step 4.
6.  **`executeCliCommand`**: Run the CLI command (e.g., `install my-tool`) with the environment variables from step 5.
7.  **Assertions**: Assert that the `stdout`, `stderr`, and `exitCode` from the command are correct, and check the temporary file system to ensure the expected files (shims, symlinks, binaries) were created with the correct content.
8.  **Cleanup**: The mock server is closed, and the temporary directory is removed.

This suite of helpers provides a robust framework for testing all aspects of the generator CLI, from individual components to the full end-to-end user experience.