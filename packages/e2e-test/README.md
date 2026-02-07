# E2E Test Package

End-to-end tests for the dotfiles tool installer system.

## Parallel Test Execution

**Key isolation mechanisms:**

- Each e2e test file runs in its own dedicated worker process
- Generated directories use `tmp/e2e-test/worker-{id}/{fixture-name}/` for isolation
- The `BUN_TEST_WORKER_ID` environment variable provides unique worker identification
- Mock server port can vary per worker via `MOCK_SERVER_PORT` environment variable

**Why e2e tests need isolation:**

- Tests share fixture directories within a test file
- Multiple test files running concurrently would conflict on generated artifact paths
- Each e2e test file gets its own worker to prevent such conflicts

## Test Harness

The `TestHarness` class provides utilities for:

- Running CLI commands with specific platform/architecture overrides
- Verifying generated files (shims, shell scripts, completions)
- Checking file permissions and executability
- Reading and validating file contents
- Cleaning test directories between runs

## Mock Server

Tests use a mock HTTP server (via `withMockServer`) to simulate:

- GitHub releases API
- Cargo registry
- Tool binary downloads
- Version updates

The mock server is configured in fixture `config.ts` files.
