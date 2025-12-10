# Dotfiles Generator: Declarative, Versioned, and Automated

A modern command-line tool for automated management of developer dotfiles, tool installations, and shell configurations across different systems.

## Why? The Problem It Solves

Traditional dotfiles are often a collection of scattered shell scripts and manual installation steps, leading to:

- **Inconsistent Environments**: Your setup on your work machine drifts from your personal machine.
- **Tedious Manual Setup**: Setting up a new machine takes hours of manual `brew install`, `git clone`, and `cp` commands.
- **Shell-Only Tools**: Tools installed via shell scripts are often not available to GUI applications like VS Code or Raycast.
- **Fragile Scripts**: Shell scripts break easily and are hard to maintain and test.

This project replaces that fragile, manual system with a declarative, programmatic, and automated solution.

## Core Features

- **Declarative Tool Management**: Define every tool, from installation to shell integration, in a typed TypeScript file (`.tool.ts`).
- **Typed Global Configuration**: Author your `dotfiles.config.ts` using a synchronous or asynchronous factory wrapped with `defineConfig` for end-to-end type safety.
- **Automated On-Demand Installation**: Tools are installed automatically the first time you try to run them. No need to pre-install everything.
- **Zero-Overhead Shell Startup**: Your shell's startup time is unaffected. All tool loading is deferred until the moment you actually run a command, adding no latency to your shell's initialization.
- **Global Tool Access**: Automatically generates executable shims, making every tool available system-wide to all applications, not just your interactive shell.
- **Atomic, Versioned Installs**: Each installation is timestamped, and updates are atomic. Rollbacks are as simple as changing a symlink.
- **Powerful Shell Integration**: Centrally manage aliases, environment variables, shell functions, and completions for Zsh, Bash, and PowerShell.
- **Cross-Platform by Design**: Define platform-specific configurations for macOS, Linux, and Windows within the same file.

## How It Works

1.  **Define**: You describe a tool's installation and configuration in a `.tool.ts` file.
2.  **Generate**: You run `bun run cli.ts generate`. This creates lightweight executable **shims** for all your defined tools and generates a single shell file to source.
3.  **Run & Auto-Install**: The first time you execute a tool's command (e.g., `rg --version`), the shim intercepts the call, triggers the generator to download and install the tool, and then seamlessly executes your command. All subsequent calls are instantaneous.
4.  **Source**: Your `.zshrc` or `.bash_profile` sources one line, and all your tools, aliases, and functions become available everywhere.

## Quick Start

```bash
# Initialize configuration for the first time
bun run cli.ts init

# Install a tool defined in a .tool.ts file
bun run cli.ts install fzf

# Generate shims and shell configuration files
bun run cli.ts generate

# Update all tools to their latest versions
bun run cli.ts update

# View logs of file operations
bun run cli.ts log

# Display tree of installed tool files
bun run cli.ts files <toolName>

# Create docs symlink in a directory
bun run cli.ts docs <path>
```

### Configure with TypeScript

Create `dotfiles.config.ts` alongside your YAML config to take advantage of TypeScript tooling:

```typescript
// dotfiles.config.ts
import { defineConfig } from '@gitea/dotfiles';

export default defineConfig(async () => ({
  paths: {
    dotfilesDir: '~/.dotfiles',
    targetDir: '~/.local/bin',
  },
  github: {
    token: process.env.GITHUB_TOKEN,
  },
}));

export const syncExample = defineConfig(() => ({
  paths: {
    generatedDir: '${configFileDir}/.generated',
  },
}));
```

## Example: A Complete Tool Configuration

Define everything about a tool—installation, binary path, config file symlinks, and shell environment—in one place.

```typescript
// configs/tools/ripgrep.tool.ts
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  })
    // 1. Define the binary name
    .bin('rg')
    // 2. Declare required binaries that must exist before this tool runs
    .dependsOn('pcre2')
    // 3. Create symlinks for configuration files
    .symlink('./ripgreprc', `${ctx.homeDir}/.ripgreprc`)
    // 4. Configure shell-specific integration (aliases, functions, env vars)
    .zsh((shell) =>
      shell
        .environment({
          RIPGREP_CONFIG_PATH: `${ctx.homeDir}/.ripgreprc`,
        })
        .aliases({
          rgi: 'rg -i', // Case-insensitive search alias
        })
    )
);
```

### Dependency Ordering

Tools can depend on binaries provided by other tools (or existing system binaries). Use `.dependsOn('binary-name')` to declare these relationships. The generator validates dependencies before running installs, ensuring:

- Providers are present for every required binary
- No cycles exist between dependent tools
- Dependencies are available for the active platform/architecture

If any dependency checks fail, the CLI exits with detailed diagnostics so you can fix missing or ambiguous providers before continuing.

**Type-safe autocomplete:** When you run `generate`, a `tool-types.d.ts` file is automatically created in your `generatedDir` (defaults to `.generated/`) containing all available binary names from your tool configurations. Add this file to your `tsconfig.json` to get autocomplete for dependency names in your `.tool.ts` files:

```json
{
  "include": [
    "tools/**/*.tool.ts",
    ".generated/tool-types.d.ts"
  ]
}
```

This enables IDE autocomplete for the `dependsOn()` method with all known binary names. The file is regenerated each time you run `generate` to stay in sync with your current tool configurations.

## Documentation

### Getting Started
- **[Tool Configuration Guide](docs/README.md)** - The complete guide to creating `.tool.ts` files
- **[Migration Guide](docs/migration-guide.md)** - How to move from shell scripts to the new system
- **[Common Patterns](docs/common-patterns.md)** - Real-world configuration examples

### Shell Integration
- **[Shell Configuration](docs/shell-integration.md)** - Aliases, environment variables, and shell functions
- **[Command Completions](docs/completions.md)** - Setting up tab completions for your tools
- **[Symbolic Links](docs/symlinks.md)** - Managing configuration file symlinks

### Installation Methods
- **[GitHub Releases](docs/installation/github-release.md)** - Install from GitHub release archives
- **[Cargo/Crates.io](docs/installation/cargo.md)** - Install Rust tools via Cargo
- **[Homebrew](docs/installation/homebrew.md)** - Install via Homebrew package manager
- **[Curl Scripts](docs/installation/curl-script.md)** - Install via shell scripts
- **[Manual Installation](docs/installation/manual.md)** - Manually managed tools

## Global Configuration (`config.yaml`)

The generator can be customized via a `config.yaml` file located in your dotfiles directory (e.g., `~/.dotfiles/generator/config.yaml`). The following is a reference for all available options.

```yaml
# Path to the user's config file.
# (string, default: ~/.dotfiles/generator/config.yaml)
userConfigPath: "~/.dotfiles/generator/config.yaml"

# -----------------------------------------------------------------------------
# File System Paths
# -----------------------------------------------------------------------------
paths:
  # Root directory of the dotfiles repository. You SHOULD set this value.
  # (string, default: ~/.dotfiles)
  dotfilesDir: "~/.dotfiles"
  # Target directory for executable shims. This directory MUST be in your shell's $PATH.
  # (string, default: /usr/local/bin)
  targetDir: "/usr/local/bin"
  # The user's home directory.
  # (string, default: value of $HOME)
  homeDir: "~"
  # Directory where all generated files will be stored.
  # (string, default: ~/.dotfiles/.generated)
  generatedDir: "~/.dotfiles/.generated"
  # Directory containing *.tool.ts tool configuration files.
  # (string, default: ~/.dotfiles/tools)
  toolConfigsDir: "~/.dotfiles/tools"
  # Directory where generated shell scripts are stored.
  # (string, default: ~/.dotfiles/.generated/shell-scripts)
  shellScriptsDir: "~/.dotfiles/.generated/shell-scripts"
  # Directory where downloaded tool binaries are stored.
  # (string, default: ~/.dotfiles/.generated/binaries)
  binariesDir: "~/.dotfiles/.generated/binaries"

# -----------------------------------------------------------------------------
# System Settings
# -----------------------------------------------------------------------------
system:
  # Custom prompt message to display when sudo is required.
  # (string, default: "Please enter your password to continue:")
  sudoPrompt: "Please enter your password to continue:"

# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
logging:
  # Controls debug logging output. Set to "*" to enable all debug logs.
  # (string, default: "")
  debug: ""

# -----------------------------------------------------------------------------
# Automatic Updates
# -----------------------------------------------------------------------------
updates:
  # If true, automatically check for tool updates on certain runs.
  # (boolean, default: true)
  checkOnRun: true
  # Interval in seconds between automatic update checks.
  # (number, default: 86400, i.e., 24 hours)
  checkInterval: 86400

# -----------------------------------------------------------------------------
# Features Configuration
# -----------------------------------------------------------------------------
features:
  # Configuration for the tool catalog generation.
  catalog:
    # If true, generate a markdown catalog of all tools.
    # (boolean, default: true)
    generate: true
    # Path where the catalog file will be generated.
    # (string, default: ${paths.dotfilesDir}/CATALOG.md)
    filePath: "${paths.dotfilesDir}/CATALOG.md"

  # Configuration for shell initialization.
  # Controls where the shell initialization scripts are sourced.
  shellInstall:
    # Path to zsh configuration file (e.g., ~/.zshrc).
    # If not provided, zsh initialization will be skipped.
    zsh: "~/.zshrc"
    # Path to bash configuration file (e.g., ~/.bashrc).
    # If not provided, bash initialization will be skipped.
    bash: "~/.bashrc"
    # Path to powershell configuration file (e.g., ~/.config/powershell/profile.ps1).
    # If not provided, powershell initialization will be skipped.
    powershell: "~/.config/powershell/profile.ps1"

# -----------------------------------------------------------------------------
# API and Service Configurations
# -----------------------------------------------------------------------------
github:
  # GitHub API host.
  # (string, default: "https://api.github.com")
  host: "https://api.github.com"
  # GitHub API token. Can be set via GITHUB_TOKEN environment variable.
  # (string, optional)
  token: ""
  # User-Agent for GitHub API requests.
  # (string, default: "dotfiles-generator")
  userAgent: "dotfiles-generator"
  # Caching for GitHub API requests.
  cache:
    enabled: true
    ttl: 86400000 # 24 hours in ms

cargo:
  # User-Agent for Cargo-related requests.
  userAgent: "dotfiles-generator"
  # Configuration for the crates.io API.
  cratesIo:
    host: "https://crates.io"
    cache:
      enabled: true
      ttl: 86400000
  # Configuration for accessing raw files on GitHub (e.g., Cargo.toml).
  githubRaw:
    host: "https://raw.githubusercontent.com"
    cache:
      enabled: true
      ttl: 86400000
  # Configuration for accessing GitHub releases.
  githubRelease:
    host: "https://github.com"
    cache:
      enabled: true
      ttl: 86400000

# -----------------------------------------------------------------------------
# Downloader Settings
# -----------------------------------------------------------------------------
downloader:
  # Timeout in milliseconds for download operations.
  # (number, default: 300000, i.e., 5 minutes)
  timeout: 300000
  # Number of retry attempts for failed downloads.
  # (number, default: 3)
  retryCount: 3
  # Delay in milliseconds between download retry attempts.
  # (number, default: 1000)
  retryDelay: 1000
  # Caching for downloaded files.
  cache:
    enabled: true
    ttl: 86400000 # 24 hours in ms

# -----------------------------------------------------------------------------
# Platform-Specific Overrides
# -----------------------------------------------------------------------------
platform:
  - # An array of platform/architecture matchers.
    match:
      - os: "macos"
        arch: "arm64"
    # The configuration overrides for this platform/architecture combination.
    # You can override any of the settings defined above.
    config:
      paths:
        dotfilesDir: "~/macos-dotfiles"
```

## Development

```bash
# Run all tests
bun test

# Lint the codebase
bun lint

# Fix formatting issues
bun fix
```
