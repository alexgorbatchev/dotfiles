# E2E Testing for CLI Commands

This document outlines the established pattern for writing end-to-end (E2E) tests for the generator's CLI commands, as demonstrated in `src/__tests__/cli-generate.e2e.test.ts`.

## Core Strategy

The core strategy is to test each CLI command in a completely isolated environment. This is achieved by creating a temporary directory for each test run and using a suite of testing helpers to manage the environment, execute the command, and verify the results.

## Key Testing Helpers Used

The E2E testing pattern relies heavily on the helpers found in `src/testing-helpers`:

-   **`createTestDirectories`**: Creates the entire isolated file system structure for the test, including mock dotfiles, generated, and binary directories.
-   **`createToolConfig`**: Populates the test's `toolConfigsDir` with `*.tool.ts` files.
-   **`setupEnvironmentVariables`**: Prepares a `process.env`-like object, pointing all necessary paths to the temporary directories.
-   **`executeCliCommand`**: Runs the CLI command as a subprocess using `Bun.spawnSync` and captures its `stdout`, `stderr`, and `exitCode`.
-   **`createBinFile`**: Creates mock executable files to simulate the presence of binaries.
-   **`createMockGitHubServer`**: (Used in `cli-install.e2e.test.ts`) Creates a mock HTTP server to simulate GitHub API responses.

## E2E Test Structure (`cli-generate.e2e.test.ts` Example)

A typical E2E test for a CLI command follows this structure:

1.  **`describe` block**: A top-level `describe` block for the command being tested (e.g., `describe('E2E: bun run cli generate', ...)`).

2.  **`beforeAll` hook**: A `beforeAll` hook is used to set up the entire test environment once. This is more efficient than setting up for each individual `it` block. The setup includes:
    *   Calling `createTestDirectories` to build the isolated directory structure.
    *   Calling `createToolConfig` to place mock tool configurations in the temporary `toolConfigsDir`.
    *   Creating any other necessary mock files (e.g., a source file for a symlink).
    *   Calling `setupEnvironmentVariables` to create the environment object for the CLI process.
    *   Calling `executeCliCommand` to run the actual CLI command. The results (`stdout`, `stderr`, `exitCode`) are stored in variables accessible to the `it` blocks.

3.  **`it` blocks**: Multiple, granular `it` blocks are used to test specific outcomes of the command execution. This makes tests easier to read and debug. Examples include:
    *   `it('should execute the CLI successfully')`: Checks that the `exitCode` is 0.
    *   `it('should generate the correct shim files...')`: Checks for the existence and content of generated shims.
    *   `it('should generate the correct shell initialization file content')`: Checks the content of the generated `init.zsh` file.
    *   `it('should create the expected symlinks...')`: Checks that symlinks are created correctly and point to the right source.
    *   `it('should generate a manifest file with correct entries')`: Parses the generated manifest and verifies its contents.

4.  **Shim Execution Test**: A dedicated `it` block tests that a generated shim can be executed and that it behaves as expected. This is a critical step to ensure the generated artifacts are functional. This test:
    *   Uses `createBinFile` to create a mock version of the tool's binary.
    *   Places this mock binary in the location the shim expects to find it (`.generated/binaries/...`).
    *   Uses `executeCliCommand` with the `customCmd` option to execute the *shim itself* as a command.
    *   Asserts that the shim's execution produces the expected output (which, in this case, comes from the mock binary).

## Benefits of this Pattern

-   **Isolation**: Tests do not interfere with each other or the user's actual file system.
-   **Realism**: The CLI is executed as a separate process, closely mimicking how a user would run it.
-   **Comprehensiveness**: The pattern allows for testing not just the CLI's output, but also the side effects on the file system (artifact generation).
-   **Clarity**: Breaking down assertions into multiple `it` blocks makes the test's intent clear and pinpoints failures more accurately.
-   **Maintainability**: Using helpers for setup and execution reduces boilerplate code in the test files.