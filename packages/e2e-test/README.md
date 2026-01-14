# E2E Test Package

End-to-end tests for the dotfiles tool installer system.

## Structure

```
src/
  __tests__/
    e2e.test.ts              # Main test entry point with platform loop
    scenarios/               # Scenario functions (not separate test files)
      completion.ts          # Completion generation tests
      conflict.ts            # Conflict detection tests
      dependency.ts          # Dependency resolution tests
      generate.ts            # Generate command tests
      install.ts             # Install command tests
      typeSafety.ts          # Type safety compile tests
      update.ts              # Update command tests
    fixtures/
      config-tools.yaml      # Main configuration for standard tools
      tools/                 # Main tool fixtures
        github-release-tool/
          github-release-tool.tool.ts
          github-release-tool.completion.sh
          github-release-tool-*.tar.gz    # Binary fixtures
          github-release-tool-binary
        cargo-quickinstall-tool/
          cargo-quickinstall-tool.tool.ts
          cargo-quickinstall-tool-*.tar.gz
        curl-script--cmd-completion-test/
          curl-script--cmd-completion-test.tool.ts
          mock-install-for-cmd-completion-test.sh
      tools-dependencies/    # Dependency test fixtures by scenario
        success/
          config.yaml
          dependency-provider.tool.ts
          dependency-consumer.tool.ts
        missing-provider/
          config.yaml
          dependency-consumer-missing.tool.ts
        ambiguous/
          config.yaml
          dependency-consumer-ambiguous.tool.ts
          dependency-provider-a.tool.ts
          dependency-provider-b.tool.ts
        circular/
          config.yaml
          dependency-cycle-a.tool.ts
          dependency-cycle-b.tool.ts
        platform-mismatch/
          config.yaml
          dependency-platform-consumer.tool.ts
          dependency-platform-provider.tool.ts
  helpers/
    index.ts                 # Re-exports all scenarios from __tests__/scenarios/
  TestHarness.ts             # Test harness for running CLI commands
  withMockServer.ts          # Mock server setup for testing
```

## Test Scenarios

All scenarios are functions that create `describe` blocks and are called from the main `e2e.test.ts` file within a platform loop.

### Generate, Install, Update

Tests core CLI functionality including:

- Generate command (shims, shell scripts, environment variables, aliases)
- Install command (binary downloads, symlinks, execution)
- Update command (version detection, upgrades)

### Conflict Detection

Tests handling of existing files and conflict resolution.

### Completion Generation

Tests shell completion file generation for tools that provide dynamic completions.

### Dependency Resolution

Tests tool dependency resolution and validation:

- Successful dependency resolution
- Missing dependency provider errors
- Ambiguous dependency (multiple providers) errors
- Circular dependency detection
- Platform-specific dependency validation

Each dependency scenario uses its own config file located next to its tool files.

### Type Safety

Compile-time tests verifying TypeScript type checking for the `defineTool` API.

## Running Tests

```bash
# Run all e2e tests
bun test packages/e2e-test

# Run specific test file
bun test packages/e2e-test/src/__tests__/e2e.test.ts

# Run with specific test name filter
bun test packages/e2e-test/src/__tests__/e2e.test.ts -t "completion"
```

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

The mock server runs on `localhost:8765` and is configured in fixture `config.yaml` files.

## Fixtures

Fixtures are organized to keep related files together:

- **Main tools**: Located in `fixtures/tools/` - each tool has its own directory containing:
  - `.tool.ts` file
  - Any associated binaries, scripts, or completion files
  - For example: `github-release-tool/` contains the tool definition, completion script, and all tar.gz binaries

- **Dependency tests**: Located in `fixtures/tools-dependencies/` with separate subdirectories for each scenario:
  - Each scenario directory contains its own `config.yaml` and all `.tool.ts` files for that test
  - Scenarios: `success/`, `missing-provider/`, `ambiguous/`, `circular/`, `platform-mismatch/`
  - Tool files are flat within each scenario directory (no additional nesting)

All binary files and scripts are co-located with their tool definitions for easier maintenance.
