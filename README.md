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
```

## Example: A Complete Tool Configuration

Define everything about a tool—installation, binary path, config file symlinks, and shell environment—in one place.

```typescript
// configs/tools/ripgrep.tool.ts
import { defineTool } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  c
    // 1. Define the binary name and its location pattern within the archive
    .bin('rg', 'ripgrep-*/rg')
    // 2. Specify the installation method
    .install('github-release', {
      repo: 'BurntSushi/ripgrep',
    })
    // 3. Create symlinks for configuration files
    .symlink('./ripgreprc', '~/.ripgreprc')
    // 4. Configure shell-specific integration (aliases, functions, env vars)
    .zsh({
      aliases: {
        rgi: 'rg -i', // Case-insensitive search alias
      },
      environment: {
        RIPGREP_CONFIG_PATH: '~/.ripgreprc',
      },
    })
);
```

## Complete Configuration Reference

The following is a comprehensive reference of all available configuration options, presented in a commented YAML format.

```yaml
# The unique name of the tool.
# (string, required)
name: my-tool

# The desired version of the tool. Can be a specific version string (e.g., "v1.2.3")
# or a SemVer constraint (e.g., "^1.0.0"). Defaults to "latest".
# (string, optional)
version: latest

# Defines the primary installation method for the tool.
# (enum, required)
# Possible values: "github-release", "brew", "curl-script", "curl-tar", "cargo", "manual", "none"
installationMethod: github-release

# An array of binary names or configurations that should have shims generated.
# (array of strings or objects, optional)
binaries:
  # Simple binary name. The generator will search for a file with this name.
  - my-tool-cli
  # Advanced configuration to specify a pattern for locating the binary within an archive.
  - name: my-other-tool
    pattern: "bin/my-other-tool-v*"

# Parameters specific to the chosen installation method.
# The structure of this object depends on the `installationMethod`.
installParams:
  # --- "github-release" installParams ---
  # The GitHub repository in "owner/repo" format. (required)
  repo: "owner/my-tool"
  # A glob pattern or regex to match the desired asset filename. (optional)
  assetPattern: "*linux_amd64.tar.gz"
  # If true, include pre-releases when searching. (boolean, optional, default: false)
  includePrerelease: false
  # Custom GitHub host URL for GitHub Enterprise. (string, optional)
  githubHost: "https://github.my-company.com"

  # --- "brew" installParams ---
  # formula: "my-tool" # The name of the Homebrew formula. (string, optional)
  # cask: true # If true, treat as a Homebrew Cask. (boolean, optional, default: false)
  # tap: "homebrew/core" # A tap or array of taps to add. (string or array, optional)

  # --- "curl-script" installParams ---
  # url: "https://install.my-tool.com/script.sh" # URL of the installation script. (string, required)
  # shell: "bash" # Shell to use for execution ("bash" or "sh"). (enum, required)

  # --- "curl-tar" installParams ---
  # url: "https://my-tool.com/download/v1.0.0/my-tool.tar.gz" # URL of the tarball. (string, required)

  # --- "cargo" installParams ---
  # crateName: "my-tool" # The name of the crate. (string, required)
  # binarySource: "github-releases" # "cargo-quickinstall" or "github-releases". (enum, optional)
  # githubRepo: "owner/my-tool" # Required if binarySource is "github-releases". (string, optional)

  # --- "manual" installParams ---
  # binaryPath: "/usr/local/bin/my-tool" # Expected absolute path to the binary. (string, required)

  # --- Common installParams properties for all methods ---
  # Environment variables to set during installation. (record, optional)
  env:
    CUSTOM_FLAG: "true"
  # Hooks to run at different stages of the installation lifecycle. (object, optional)
  hooks:
    beforeInstall: (ctx) => { console.log('Starting install...'); }
    afterDownload: (ctx) => { console.log('Download complete.'); }
    afterExtract: (ctx) => { console.log('Extraction complete.'); }
    afterInstall: (ctx) => { console.log('Installation finished.'); }

# An array of symlink configurations.
# (array of objects, optional)
symlinks:
  - source: "./config.json" # The source path (real file), relative to the .tool.ts file.
    target: "~/.config/my-tool/config.json" # The target path where the symlink is created.

# Shell configurations, organized by shell type.
# (object, optional)
shellConfigs:
  zsh:
    # Shell initialization scripts.
    scripts:
      - 'export MY_TOOL_ENABLE_FEATURE=true'
    # Shell aliases (alias name -> command).
    aliases:
      mt: "my-tool"
    # Environment variables to define.
    environment:
      MY_TOOL_HOME: "~/.my-tool"
    # Shell completion configuration.
    completions:
      # A command to generate completion content dynamically.
      cmd: "my-tool completion zsh"
      # OR: The path to the completion script within the extracted archive.
      # source: "completions/my-tool.zsh"

# Platform-specific overrides.
# (array of objects, optional)
platformConfigs:
  - # A bitmask of target platforms (e.g., "darwin", "linux", "win32").
    platforms: ["darwin", "linux"]
    # An optional bitmask of target architectures (e.g., "x64", "arm64").
    architectures: ["arm64"]
    # The configuration overrides for this platform/architecture combination.
    # Can contain any of the top-level properties except "name" and "platformConfigs".
    config:
      installationMethod: "brew"
      installParams:
        formula: "my-tool-arm"

# Configuration for automatic update checking.
# (object, optional)
updateCheck:
  # The method to use for checking for updates.
  # (enum, required, values: "github-release")
  method: "github-release"
  # Parameters for the update check method.
  # (object, required)
  params:
    repo: "owner/my-tool"
```

## Documentation

- **[Tool Configuration Guide](docs/README.md)** - The complete guide to creating `.tool.ts` files.
- **[Migration Guide](docs/migration-guide.md)** - How to move from shell scripts to the new system.
- **[Common Patterns](docs/common-patterns.md)** - Real-world configuration examples.

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
