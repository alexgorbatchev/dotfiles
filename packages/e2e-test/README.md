# E2E Test Package

End-to-end tests for the dotfiles tool installer system.

## Structure

```
src/
  __tests__/
    autoInstall.test.ts      # Auto-install during generate tests
    completion.test.ts       # Completion generation tests
    conflict.test.ts         # Conflict detection tests
    dependency.test.ts       # Dependency resolution tests
    files.test.ts            # Files command tests
    generate.test.ts         # Generate command tests
    hook.test.ts             # After-install hook tests
    install.test.ts          # Install command tests
    trace.test.ts            # Trace flag tests
    typeSafety.test.ts       # Type safety compile tests
    update.test.ts           # Update command tests
    versionDetection.test.ts # Version detection tests
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
  TestHarness.ts             # Test harness for running CLI commands
  withMockServer.ts          # Mock server setup for testing
```

## Test Files

Each test file is a standalone test suite that covers a specific feature area. Tests run for both macOS ARM64 and Linux x86_64 platforms.

### generate.test.ts

Tests the generate command including:

- Shim creation and executability
- Shell script generation (zsh, bash, powershell)
- Environment variables, aliases, always/once scripts
- Binary download on first shim execution

### install.test.ts

Tests the install command including:

- Binary download and symlink creation
- Install by tool name
- Install by binary name (when tool provides a different binary name)

### update.test.ts

Tests version updates from mock server API.

### completion.test.ts

Tests shell completion file generation for tools with dynamic completions.

### conflict.test.ts

Tests handling of existing files and conflict resolution with --overwrite flag.

### dependency.test.ts

Tests tool dependency resolution and validation including:

- Successful dependency resolution
- Missing dependency provider errors
- Ambiguous dependency (multiple providers) errors
- Circular dependency detection
- Platform-specific dependency validation

### autoInstall.test.ts

Tests tools with `auto: true` in their install params that are automatically installed during generate.

### files.test.ts

Tests the files command that displays installed tool file trees.

### hook.test.ts

Tests after-install hook execution and output logging.

### trace.test.ts

Tests --trace flag for source location logging.

### versionDetection.test.ts

Tests version detection from binary output after installation.

### typeSafety.test.ts

Compile-time tests verifying TypeScript type checking for the `defineTool` API.

## Running Tests

```bash
# Run all e2e tests
bun test packages/e2e-test

# Run specific test file
bun test packages/e2e-test/src/__tests__/generate.test.ts

# Run with specific test name filter
bun test packages/e2e-test/src/__tests__/install.test.ts -t "binary name"
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
