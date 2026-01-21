# @dotfiles/cli

Command-line interface for the dotfiles generator system. Provides commands for installing tools, generating configuration files, managing updates, and maintaining the dotfiles environment.

## Overview

The CLI package serves as the main entry point for all dotfiles operations. It orchestrates the installation of CLI tools, generation of shell initialization scripts, shim creation, and symbolic link management.

## Features

- **Tool Installation**: Install individual tools or all configured tools
- **Configuration Generation**: Generate shell init scripts, shims, and symlinks
- **Shell Completions**: Auto-generated zsh completions for CLI commands
- **Update Management**: Check for and install tool updates
- **Conflict Detection**: Identify conflicts between installed tools and system binaries
- **File Tracking**: Track and manage all generated files
- **Cleanup Operations**: Remove generated files and reset state

## Commands

### `install [toolOrBinary]`

Install a specific tool or all configured tools. You can specify either the tool name or any binary name that the tool provides.

```bash
# Install all tools
dotfiles install

# Install specific tool by name
dotfiles install fzf

# Install tool by binary name (finds tool that provides 'bat' binary)
dotfiles install bat

# Force reinstall
dotfiles install --force

# Skip tool installation, only generate configs
dotfiles install --skip-tools
```

When installing by binary name:

- The CLI first tries to find a tool with a matching name
- If not found, it searches all tool configurations for one that provides the specified binary
- If multiple tools provide the same binary, an error is shown listing all matching tools

**Options:**

- `--force` - Force reinstall even if tool is already installed
- `--skip-tools` - Skip tool installation, only generate configurations
- `--verbose` - Enable verbose logging

### `generate`

Generate all configuration files (shell init, shims, symlinks).

```bash
# Generate all configurations
dotfiles generate

# Generate only shell init files
dotfiles generate --shell-only

# Generate only shims
dotfiles generate --shims-only

# Generate only symlinks
dotfiles generate --symlinks-only
```

**Options:**

- `--shell-only` - Generate only shell initialization files
- `--shims-only` - Generate only executable shims
- `--symlinks-only` - Generate only symbolic links
- `--verbose` - Enable verbose logging

### `init`

Initialize shell environment with generated configuration.

```bash
# Output shell init commands
eval "$(dotfiles init)"

# For zsh
eval "$(dotfiles init zsh)"

# For bash
eval "$(dotfiles init bash)"
```

**Usage:**
Add to your shell configuration file:

```bash
# ~/.zshrc
eval "$(dotfiles init zsh)"
```

### `check-updates`

Check for available updates to installed tools.

```bash
# Check all tools
dotfiles check-updates

# Check specific tool
dotfiles check-updates fzf

# Show detailed version information
dotfiles check-updates --verbose
```

**Output:**

```
Checking for updates...

Updates available:
  fzf: 0.42.0 → 0.43.0
  ripgrep: 13.0.0 → 14.0.0

Up to date:
  jq: 1.6
  bat: 0.23.0
```

### `update [tool]`

Update tools to their latest versions.

```bash
# Update all tools
dotfiles update

# Update specific tool
dotfiles update fzf

# Force update even if same version
dotfiles update --force
```

### `detect-conflicts`

Detect conflicts between installed tool shims and system binaries.

```bash
# Detect all conflicts
dotfiles detect-conflicts

# Fix conflicts automatically
dotfiles detect-conflicts --fix
```

**Output:**

```
Checking for conflicts...

Conflicts found:
  fzf:
    - System: /usr/local/bin/fzf
    - Shim: ~/.dotfiles/bin/fzf

  ripgrep:
    - System: /usr/bin/rg
    - Shim: ~/.dotfiles/bin/rg
```

### `docs <path>`

Create a symlink called `dotfiles` in the specified directory pointing to the project's docs folder.

```bash
# Create docs symlink in current directory
dotfiles docs .

# Create docs symlink in specific directory
dotfiles docs ~/notes

# Preview without creating (dry run)
dotfiles docs ~/notes --dry-run
```

**Output:**

```
Created symlink: ~/notes/dotfiles -> /path/to/dotfiles-tool-installer/docs
```

If the symlink already exists:

```
Symlink already exists: ~/notes/dotfiles
```

### `log`

Manage tracked generated files.

```bash
# List all generated files
dotfiles log

# List files for specific tool
dotfiles log fzf

# List by file type
dotfiles log --type shim
dotfiles log --type shell-init
dotfiles log --type symlink

# Check file status
dotfiles log --status

# List files created since a date
dotfiles log --since 2025-08-01
```

### `cleanup`

Remove all generated files and reset state.

```bash
# Dry run (show what would be deleted)
dotfiles cleanup --dry-run

# Remove all generated files
dotfiles cleanup

# Remove only specific category
dotfiles cleanup --category shims

# Force cleanup without confirmation
dotfiles cleanup --force
```

**Options:**

- `--dry-run` - Show what would be deleted without actually deleting
- `--force` - Skip confirmation prompt
- `--category` - Only clean specific category (shims, shell-init, symlinks)

## Installation

The CLI is the main entry point for the dotfiles system:

```bash
# Install globally
bun link

# Run directly
bun run cli.ts <command>
```

## Configuration

The CLI reads configuration from `config.yaml` in the project root:

```yaml
# Directory structure
directories:
  tools: ~/.dotfiles/tools
  bin: ~/.dotfiles/bin
  cache: ~/.dotfiles/.cache
  configs: ~/.dotfiles/configs

# Installation options
installOptions:
  parallel: true
  maxConcurrency: 4
  continueOnError: false

# Update checking
updateCheck:
  enabled: true
  frequency: daily
```

## Usage Examples

### Complete Setup Workflow

```bash
# 1. Install all tools
dotfiles install

# 2. Generate configurations
dotfiles generate

# 3. Initialize shell
echo 'eval "$(dotfiles init)"' >> ~/.zshrc

# 4. Restart shell or source config
source ~/.zshrc
```

### Install Specific Tools

```bash
# Install multiple specific tools
dotfiles install fzf ripgrep bat

# Install with force flag
dotfiles install --force jq
```

### Update Workflow

```bash
# Check for updates
dotfiles check-updates

# Update all tools with updates available
dotfiles update

# Update specific tool
dotfiles update fzf
```

### Maintenance Workflow

```bash
# Detect any conflicts
dotfiles detect-conflicts

# View all generated files
dotfiles log

# View files for specific tool
dotfiles log fzf

# Clean up old files
dotfiles cleanup --dry-run
dotfiles cleanup
```

## Shell Completions

The CLI automatically generates zsh completions for all commands and options when you run `dotfiles generate`.

### Setup

Completions are generated to `<generatedDir>/shell-scripts/zsh/completions/_dotfiles` and are automatically loaded if your shell is configured to use the generated shell scripts.

To manually reload completions:

```bash
# Reload zsh completions
autoload -U compinit && compinit
```

### Usage

After setup, you can use tab completion with the `dotfiles` command:

```bash
dotfiles <TAB>           # Shows available commands
dotfiles install <TAB>   # Shows install command options
dotfiles --<TAB>         # Shows global options

# Tool names are suggested for commands like install, update, files, log, and check-updates
dotfiles install <TAB>   # Shows configured tool names
```

### Supported Features

- All CLI commands (install, generate, cleanup, etc.)
- Command-specific options (--force, --overwrite, etc.)
- Global options (--config, --dry-run, --log, --verbose, --trace, etc.)
- Subcommands (features catalog)
- Positional arguments with descriptions
- Tool name suggestions sourced from the current configuration

## API

### `createProgram(dependencies: CLIDependencies): Command`

Creates the Commander.js program with all commands configured.

```typescript
import { createProgram } from '@dotfiles/cli';

const program = createProgram({
  logger,
  fileSystem,
  installer,
  generatorOrchestrator,
  // ... other dependencies
});

await program.parseAsync(process.argv);
```

### Command Implementations

Each command is implemented as a separate module:

- `installCommand` - Tool installation logic
- `generateCommand` - Configuration generation logic
- `initCommand` - Shell initialization logic
- `checkUpdatesCommand` - Update checking logic
- `updateCommand` - Update installation logic
- `detectConflictsCommand` - Conflict detection logic
- `logCommand` - File tracking logic
- `cleanupCommand` - Cleanup logic

## Dependencies

### Internal Dependencies

- `@dotfiles/config` - Configuration loading and management
- `@dotfiles/downloader` - File downloading capabilities
- `@dotfiles/file-system` - Filesystem operations
- `@dotfiles/generator-orchestrator` - Configuration generation orchestration
- `@dotfiles/installer` - Tool installation
- `@dotfiles/logger` - Structured logging
- `@dotfiles/registry` - Tool registry management
- `@dotfiles/registry-database` - Installation tracking database
- `@dotfiles/schemas` - Type definitions
- `@dotfiles/utils` - Shared utilities
- `@dotfiles/version-checker` - Version checking and comparison

### External Dependencies

- `commander` - CLI framework
- `@commander-js/extra-typings` - TypeScript support for Commander

## Logging

The CLI uses structured logging with log levels:

```typescript
// Log levels can be controlled via flags
--verbose  // Debug level
--quiet    // Error level only
(default)  // Info level
```

Example log output:

```
[INFO] Installing tool: fzf
[DEBUG] Downloading from: https://github.com/junegunn/fzf/releases/...
[INFO] Installation complete: fzf v0.43.0
```

## Error Handling

The CLI provides user-friendly error messages:

```typescript
// Configuration errors
Error: config.yaml not found. Run 'dotfiles init' first.

// Installation errors
Error: Failed to install fzf: network timeout
Try: dotfiles install fzf --verbose

// Permission errors
Error: Insufficient permissions to write to ~/.dotfiles/bin
Try: Check directory permissions
```

## Exit Codes

The CLI uses standard exit codes:

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Configuration error
- `4` - Installation error
- `5` - Network error

## Testing

Run tests with:

```bash
bun test packages/cli
```

The package includes tests for:

- All command implementations
- Argument parsing
- Error handling
- Integration scenarios

## Command Testing

```typescript
import { createProgram } from '@dotfiles/cli';
import { createTestDirectories } from '@dotfiles/testing-helpers';

const { workingDir, homeDir } = await createTestDirectories('cli-test');

const program = createProgram({
  // Mock dependencies
});

// Test command
await program.parseAsync(['node', 'cli', 'install', 'fzf']);
```

## Design Decisions

### Why Commander.js?

Commander.js provides:

- Intuitive API for defining commands
- Automatic help generation
- TypeScript support via extra-typings
- Mature, well-maintained library

### Why Separate Command Modules?

Separating commands into modules:

- Improves maintainability
- Enables focused testing
- Reduces cognitive load
- Allows parallel development

### Why Dependency Injection?

Injecting dependencies makes:

- Testing easier
- Components reusable
- Dependencies explicit
- Coupling loose

## Best Practices

### Use Structured Logging

```typescript
logger.info('Installing tool', { toolName, version });
logger.error('Installation failed', { toolName, error });
```

### Validate Arguments

```typescript
if (!toolName) {
  logger.error('Tool name is required');
  process.exit(1);
}
```

### Provide Progress Feedback

```typescript
console.log('Installing tools...');
// Show progress
console.log('Installation complete!');
```

### Handle Interrupts

```typescript
process.on('SIGINT', async () => {
  logger.info('Interrupted, cleaning up...');
  await cleanup();
  process.exit(130);
});
```

## Future Enhancements

Potential improvements:

- Interactive mode for tool selection
- Plugin system for custom commands
- Configuration wizard
- Backup and restore functionality
- Tool group management
- Remote configuration sync
