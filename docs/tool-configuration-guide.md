# Complete Guide to Creating .tool.ts Files

This comprehensive guide covers everything you need to know about creating `.tool.ts` configuration files for the Dotfiles Generator project. These files define how CLI tools are installed, configured, and integrated into your development environment.

## Table of Contents

1. [Overview](#overview)
2. [File Structure and Location](#file-structure-and-location)
3. [Basic Configuration Anatomy](#basic-configuration-anatomy)
4. [Core Methods Reference](#core-methods-reference)
5. [Installation Methods](#installation-methods)
6. [Shell Integration](#shell-integration)
7. [Platform-Specific Configuration](#platform-specific-configuration)
8. [Completions](#completions)
9. [Symbolic Links](#symbolic-links)
10. [Hooks and Advanced Features](#hooks-and-advanced-features)
11. [TypeScript Requirements](#typescript-requirements)
12. [Common Patterns and Examples](#common-patterns-and-examples)
13. [Testing and Validation](#testing-and-validation)
14. [Migration from Shell-Based Configs](#migration-from-shell-based-configs)
15. [Troubleshooting Shell Executor (`$`) Issues](#troubleshooting-shell-executor--issues)

## Overview

The `.tool.ts` configuration files replace traditional shell-based tool management (like those using zinit) with a strongly-typed, programmatic approach using TypeScript. Each tool gets its own configuration file that defines:

- How to install the tool (from GitHub releases, Homebrew, scripts, etc.)
- Which binaries to make available system-wide
- Shell integration (aliases, functions, environment variables)
- Configuration files to symlink
- Command completions to install
- Platform-specific overrides

### Benefits Over Shell-Based Approaches

- **Type Safety**: TypeScript ensures configuration correctness at build time
- **Consistency**: Standardized API across all tools
- **Platform Support**: Built-in support for different OS/architecture combinations
- **Performance**: Faster tool access without shell startup overhead
- **Maintainability**: Clear structure and validation

## File Structure and Location

### Directory Organization

```
configs/tools/              # New tool configurations
├── tool-name.tool.ts       # Main configuration file
└── config-files/           # Optional: tool-specific config files

configs-migrated/           # Migrated configurations
├── tool-name/
│   ├── tool-name.tool.ts   # Main configuration
│   └── config.toml         # Tool's config files
```

### File Naming Convention

- **File name**: `{tool-name}.tool.ts` (kebab-case)
- **Location**: `configs/tools/` for new tools, `configs-migrated/{tool-name}/` for migrated tools
- **Export**: Must use `export default` with an async function

## Basic Configuration Anatomy

### Minimal Configuration

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('tool-name')
    .version('latest')
    .install('github-release', {
      repo: 'owner/repository',
    });
};
```

### Complete Configuration Template

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    // Define the binary names this tool provides
    .bin(['primary-binary', 'secondary-binary'])
    
    // Specify version (latest, specific version, or SemVer constraint)
    .version('latest')
    
    // Configure installation method
    .install('github-release', {
      repo: 'owner/repository',
      assetPattern: '*linux_amd64.tar.gz',
      binaryPath: 'bin/tool',
      moveBinaryTo: 'tool',
      stripComponents: 1,
    })
    
    // Add shell completions
    .completions({
      zsh: { source: 'completions/_tool.zsh' },
      bash: { source: 'completions/tool.bash' },
    })
    
    // Configure symbolic links
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    
    // Add shell initialization code
    .zsh(/* zsh */ `
      # Environment variables
      export TOOL_CONFIG_DIR="${ctx.homeDir}/.tool"
      
      # Aliases
      alias t="tool"
      
      # Functions
      function tool-helper() {
        tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
      }
    `);
};
```

## ToolConfigContext Interface

The `ToolConfigContext` provides access to configuration paths and directories for tool configuration. This context is automatically passed to your tool configuration function and provides type-safe access to all configuration paths from the YAML config.

### Context Properties

```typescript
interface ToolConfigContext {
  /** Current tool's installation directory */
  toolDir: string;
  
  /** Get the installation directory for any tool */
  getToolDir(toolName: string): string;
  
  /** User's home directory (from yamlConfig.paths.homeDir) */
  homeDir: string;
  
  /** Generated binaries directory (from yamlConfig.paths.binariesDir) */
  binDir: string;
  
  /** Generated shell scripts directory (from yamlConfig.paths.shellScriptsDir) */
  shellScriptsDir: string;
  
  /** Root dotfiles directory (from yamlConfig.paths.dotfilesDir) */
  dotfilesDir: string;
  
  /** Generated files directory (from yamlConfig.paths.generatedDir) */
  generatedDir: string;
}
```

### Usage Examples

**Accessing Current Tool Directory:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh(/* zsh */ `
    # Reference the current tool's installation directory
    export TOOL_CONFIG_DIR="${ctx.toolDir}"
    
    # Source tool-specific files
    if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
      source "${ctx.toolDir}/shell/key-bindings.zsh"
    fi
  `);
};
```

**Accessing Other Tool Directories:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh(/* zsh */ `
    # Reference another tool's directory
    FZF_DIR="${ctx.getToolDir('fzf')}"
    if [[ -d "$FZF_DIR" ]]; then
      export FZF_BASE="$FZF_DIR"
    fi
  `);
};
```

**Using Generated Directories:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh(once/* zsh */ `
    # Generate completions to the proper directory
    tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
  `);
};
```

**Path Resolution Benefits:**
- **Type Safety**: All paths are validated at compile time
- **Configuration Source**: Paths come from YAML config as single source of truth
- **No Hard-coding**: Eliminates hardcoded `$DOTFILES` or similar references
- **Flexibility**: Easy access to any configured directory
- **Consistency**: Same path resolution across all tools

## Core Methods Reference

### `.bin(names: string | string[])`

Defines the executable binaries this tool provides. Shims are generated for each binary name.

**Parameters:**
- `names`: Single binary name or array of binary names

**Examples:**
```typescript
// Single binary
c.bin('fzf')

// Multiple binaries
c.bin(['git', 'git-lfs', 'git-credential-manager'])

// Tool that provides many binaries
c.bin(['kubectl', 'kubeadm', 'kubelet'])
```

**Important Notes:**
- Each binary name gets a shim in the generated bin directory
- Shims point to the actual installed binary location
- Binary names should match the actual executable names

### `.version(version: string)`

Specifies the desired tool version.

**Parameters:**
- `version`: Version string, SemVer constraint, or 'latest'

**Examples:**
```typescript
// Always get the latest release
c.version('latest')

// Specific version
c.version('2.5.1')
c.version('v1.4.0')

// SemVer constraints
c.version('^3.0.0')    // Compatible with 3.x.x
c.version('~2.3.x')    // Compatible with 2.3.x
c.version('>=1.5.0')   // At least 1.5.0
```

**Default:** `'latest'` if not specified

### `.install(method, params)`

Configures how the tool should be installed. The method determines available parameters.

## Installation Methods

### 1. GitHub Release (`'github-release'`)

Downloads and installs tools from GitHub releases.

```typescript
c.install('github-release', {
  repo: 'owner/repository',                    // Required
  assetPattern?: 'pattern',                    // Optional
  binaryPath?: 'path/within/archive',          // Optional  
  moveBinaryTo?: 'final-binary-name',          // Optional
  version?: 'v1.2.3',                         // Optional
  includePrerelease?: false,                   // Optional
  stripComponents?: 1,                         // Optional
  assetSelector?: (assets, sysInfo) => asset, // Optional
})
```

**Parameters:**

- **`repo`** (required): GitHub repository in "owner/repo" format
- **`assetPattern`**: Glob pattern or regex to match release assets
  ```typescript
  assetPattern: '*linux_amd64.tar.gz'
  assetPattern: 'tool-*-darwin-arm64.tar.gz'
  ```
- **`binaryPath`**: Path to executable within extracted archive
  ```typescript
  binaryPath: 'bin/tool'           // Archive has bin/tool
  binaryPath: 'tool'               // Binary at archive root
  ```
- **`moveBinaryTo`**: Final name/location for the binary
  ```typescript
  moveBinaryTo: 'tool'             // Rename to 'tool'
  moveBinaryTo: 'bin/custom-name'  // Move to subdirectory
  ```
- **`stripComponents`**: Number of directory levels to strip during extraction (like tar --strip-components)
- **`assetSelector`**: Custom function to select the correct asset

**Examples:**

```typescript
// Simple GitHub release
c.install('github-release', {
  repo: 'junegunn/fzf',
})

// Complex GitHub release with pattern matching
c.install('github-release', {
  repo: 'sharkdp/bat',
  assetPattern: '*linux_amd64.tar.gz',
  moveBinaryTo: 'bat',
})

// Using custom asset selector
c.install('github-release', {
  repo: 'example/tool',
  assetSelector: (assets, sysInfo) => {
    const platformKey = sysInfo.platform === 'darwin' ? 'macos' : sysInfo.platform;
    const archKey = sysInfo.arch === 'arm64' ? 'aarch64' : sysInfo.arch;
    return assets.find(asset => 
      asset.name.includes(platformKey) && asset.name.includes(archKey)
    );
  }
})
```

### 2. Homebrew (`'brew'`)

Installs tools using Homebrew (macOS and Linux).

```typescript
c.install('brew', {
  formula?: 'package-name',     // Optional
  cask?: boolean,              // Optional
  tap?: 'tap-name' | string[], // Optional
})
```

**Parameters:**

- **`formula`**: Homebrew formula or cask name
- **`cask`**: Set to `true` to install as a cask
- **`tap`**: Required tap(s) to add before installing

**Examples:**

```typescript
// Simple brew formula
c.install('brew', {
  formula: 'ripgrep',
})

// Homebrew cask
c.install('brew', {
  formula: 'visual-studio-code',
  cask: true,
})

// With custom tap
c.install('brew', {
  formula: 'aerospace',
  cask: true,
  tap: 'nikitabobko/tap',
})

// Multiple taps
c.install('brew', {
  formula: 'custom-tool',
  tap: ['custom/tap', 'another/tap'],
})
```

### 3. Curl Script (`'curl-script'`)

Downloads and executes installation scripts.

```typescript
c.install('curl-script', {
  url: 'https://example.com/install.sh',  // Required
  shell: 'bash' | 'sh',                   // Required
  env?: { [key: string]: string },        // Optional
})
```

**Parameters:**

- **`url`**: URL of the installation script
- **`shell`**: Shell to use for execution (`'bash'` or `'sh'`)
- **`env`**: Environment variables to set during installation

**Examples:**

```typescript
// Simple script installation
c.install('curl-script', {
  url: 'https://bun.sh/install',
  shell: 'bash',
})

// With environment variables
c.install('curl-script', {
  url: 'https://fnm.vercel.app/install',
  shell: 'bash',
  env: {
    INSTALL_ARGS: '--skip-shell --install-dir $LOCAL_BIN',
  },
})
```

### 4. Curl Tar (`'curl-tar'`)

Downloads and extracts tarballs directly.

```typescript
c.install('curl-tar', {
  url: 'https://example.com/tool.tar.gz',  // Required
  extractPath?: 'path/to/binary',          // Optional
  moveBinaryTo?: 'final-name',             // Optional
  stripComponents?: 1,                     // Optional
})
```

**Examples:**

```typescript
c.install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  extractPath: 'bin/tool',
  moveBinaryTo: 'tool',
})
```

### 5. Manual (`'manual'`)

For tools installed by other means or already present on the system.

```typescript
c.install('manual', {
  binaryPath: '/path/to/binary',  // Required
})
```

**Examples:**

```typescript
// System-installed tool
c.install('manual', {
  binaryPath: '/usr/bin/git',
})

// User-installed binary
c.install('manual', {
  binaryPath: `${ctx.homeDir}/bin/custom-tool`,
})
```

## Shell Integration

### Shell Script Execution Timing

The shell integration system supports two types of scripts with different execution timing:

- **Always Scripts**: Run every time the shell starts (traditional behavior)
- **Once Scripts**: Run only once after tool installation or updates (for expensive operations)

This distinction helps optimize shell startup performance by preventing expensive operations like completion generation from running on every shell startup.

### `.zsh(scripts: ShellScript[])`

Adds Zsh shell initialization code using branded script types.

**Branded Script Types:**
- `always(script)`: For scripts that should run on every shell startup
- `once(script)`: For scripts that should run only once after installation/updates

**Guidelines:**
- Use template literals (backticks) for multi-line code
- Include the `/* zsh */` comment for syntax highlighting
- Use `once()` for expensive operations like completion generation
- Use `always()` for aliases, functions, and lightweight setup
- Multiple calls append to the initialization

**Basic Usage:**
```typescript
import { once, always } from '@types';

c.zsh(
  once/* zsh */`
    # Generate completions (runs only once)
    tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
  `,
  always/* zsh */`
    # Fast runtime setup (runs every shell startup)
    export TOOL_CONFIG_DIR="${ctx.toolDir}"
    alias t="tool"
  `
)
```

**Performance Benefits:**
- Expensive operations (completion generation, cache building) run only once
- Shell startup remains fast with lightweight always scripts
- Once scripts automatically self-delete after execution to prevent re-running

**Common Patterns:**

```typescript
c.zsh(/* zsh */ `
  # Environment variables
  export TOOL_CONFIG_DIR="${ctx.homeDir}/.config/tool"
  export TOOL_DATA_DIR="${ctx.homeDir}/.local/share/tool"
  
  # PATH modifications
  add-to-path "${ctx.homeDir}/.tool/bin"
  
  # Aliases
  alias t="tool"
  alias tl="tool list"
  alias ts="tool status"
  
  # Simple functions
  function tool-cd() {
    local dir=$(tool list-dirs | fzf)
    [[ -n "$dir" ]] && cd "$dir"
  }
  
  # Complex functions with error handling
  function tool-install() {
    local package="$1"
    if [[ -z "$package" ]]; then
      echo "Usage: tool-install <package>" >&2
      return 1
    fi
    
    echo "Installing $package..."
    tool install "$package" || {
      echo "Failed to install $package" >&2
      return 1
    }
  }
  
  # ZLE (Zsh Line Editor) widgets
  function tool-picker() {
    local selection=$(tool list | fzf)
    if [[ -n "$selection" ]]; then
      zle kill-whole-line
      BUFFER="tool run $selection"
      zle accept-line
    fi
    zle redisplay
  }
  zle -N tool-picker
  
  # Key bindings (with vi-mode support)
  if (( \${+zvm_after_init_commands} )); then
    zvm_after_init_commands+=("bindkey '^T' tool-picker")
  else
    bindkey '^T' tool-picker
  fi
  
  # Conditional initialization
  if command -v tool >/dev/null 2>&1; then
    eval "$(tool init zsh)"
  fi
  
  # Source additional files
  local tool_extras="${ctx.toolDir}/extras.zsh"
  [[ -f "$tool_extras" ]] && source "$tool_extras"
`)
```

### `.bash(code: string)`

Adds Bash shell initialization code (similar patterns to Zsh).

### `.powershell(code: string)`

Adds PowerShell initialization code for Windows support.

**Example:**
```typescript
c.powershell(/* powershell */ `
  $env:TOOL_CONFIG_DIR = "${ctx.homeDir}\\.tool"
  
  function tool-helper {
    tool --config "$env:TOOL_CONFIG_DIR\\config.toml" @args
  }
  
  Set-Alias t tool
`)
```

## Platform-Specific Configuration

Use the `.platform()` method to define different configurations for different operating systems and architectures.

### Platform Enumeration

```typescript
import { Platform, Architecture } from '@types';

// Available platforms (bitwise flags)
Platform.Linux    // 1
Platform.MacOS    // 2  
Platform.Windows  // 4
Platform.Unix     // Platform.Linux | Platform.MacOS (3)
Platform.All      // Platform.Linux | Platform.MacOS | Platform.Windows (7)

// Available architectures (bitwise flags)
Architecture.X86_64  // 1
Architecture.Arm64   // 2
Architecture.All     // Architecture.X86_64 | Architecture.Arm64 (3)
```

### Method Signatures

```typescript
// Platform-only configuration
c.platform(platforms: Platform, configure: (builder) => void)

// Platform and architecture-specific configuration  
c.platform(
  platforms: Platform, 
  architectures: Architecture, 
  configure: (builder) => void
)
```

### Examples

**Single Platform:**
```typescript
c.platform(Platform.MacOS, (c) => {
  c
    .install('brew', {
      formula: 'tool',
      cask: true,
    })
    .zsh(/* zsh */ `
      # macOS-specific setup
      export TOOL_USE_COREAUDIO=1
    `);
});
```

**Multiple Platforms:**
```typescript
c.platform(Platform.Linux | Platform.MacOS, (c) => {
  c
    .install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*unix*.tar.gz',
    })
    .zsh(/* zsh */ `
      # Unix-like systems
      export TOOL_USE_UNIX_SOCKETS=1
    `);
});
```

**Platform and Architecture Specific:**
```typescript
c.platform(Platform.Windows, Architecture.Arm64, (c) => {
  c
    .install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*windows-arm64.zip',
    })
    .powershell(/* powershell */ `
      $env:TOOL_ARCH = "arm64"
    `);
});
```

**Complete Multi-Platform Example:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Common configuration for all platforms
  c
    .bin('tool')
    .version('latest');
    
  // macOS-specific
  c.platform(Platform.MacOS, (c) => {
    c
      .install('brew', { formula: 'tool' })
      .zsh(/* zsh */ `alias t="tool --macos-mode"`);
  });
  
  // Linux-specific
  c.platform(Platform.Linux, (c) => {
    c
      .install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      })
      .zsh(/* zsh */ `alias t="tool --linux-mode"`);
  });
  
  // Windows-specific
  c.platform(Platform.Windows, (c) => {
    c
      .install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows*.zip',
      })
      .powershell(/* powershell */ `Set-Alias t "tool --windows-mode"`);
  });
};
```

## Completions

### Configuration Object

The `.completions()` method takes a `CompletionConfig` object:

```typescript
c.completions({
  zsh?: { source: string, name?: string, targetDir?: string },
  bash?: { source: string, name?: string, targetDir?: string },
  powershell?: { source: string, name?: string, targetDir?: string },
})
```

### Parameters

- **`source`**: Path to completion file within the extracted tool archive
- **`name`**: Optional custom name for the installed completion file
- **`targetDir`**: Optional custom installation directory

### Examples

**Basic Completions:**
```typescript
c.completions({
  zsh: { source: 'completions/_tool.zsh' },
  bash: { source: 'completions/tool.bash' },
})
```

**Custom Completion Names:**
```typescript
c.completions({
  zsh: { 
    source: 'autocomplete/complete.zsh',
    name: '_my-tool',
  },
})
```

**Custom Installation Directory:**
```typescript
c.completions({
  zsh: {
    source: 'completions/tool.zsh',
    targetDir: `${ctx.homeDir}/.zsh/completions`,
  },
})
```

**Multiple Shell Support:**
```typescript
c.completions({
  zsh: { source: 'completions/tool.zsh' },
  bash: { source: 'completions/tool.bash' },
  powershell: { source: 'completions/tool.ps1' },
})
```

### Generated Completions

Some tools can generate their own completions:

```typescript
// Note: This pattern is used in practice but may not be officially supported yet
c.completions({
  zsh: { generate: 'tool completion zsh' },
  bash: { generate: 'tool completion bash' },
})
```

## Symbolic Links

### `.symlink(source: string, target: string)`

Creates symbolic links for configuration files.

**Parameters:**
- **`source`**: Path to source file, relative to tool directory or absolute
- **`target`**: Target path where symlink should be created

**Path Conventions:**
- Use `./` prefix for files relative to the tool's directory
- Use `${ctx.homeDir}/` for home directory paths instead of `~/`
- Absolute paths are supported

### Examples

**Basic Configuration File:**
```typescript
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
```

**Multiple Configuration Files:**
```typescript
c
  .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
  .symlink('./themes/', `${ctx.homeDir}/.config/tool/themes`)
  .symlink('./scripts/helper.sh', `${ctx.homeDir}/bin/tool-helper`)
```

**Absolute Paths:**
```typescript
c.symlink('/etc/tool/global.conf', `${ctx.homeDir}/.config/tool/global.conf`)
```

**Directory Structure Example:**
```
configs-migrated/my-tool/
├── my-tool.tool.ts         # Configuration file
├── config.toml             # Tool's config file
├── themes/                 # Theme directory
│   ├── dark.toml
│   └── light.toml
└── scripts/
    └── helper.sh
```

```typescript
// In my-tool.tool.ts
c
  .symlink('./config.toml', `${ctx.homeDir}/.config/my-tool/config.toml`)
  .symlink('./themes/', `${ctx.homeDir}/.config/my-tool/themes`)
  .symlink('./scripts/helper.sh', `${ctx.homeDir}/bin/my-tool-helper`)
```

## Hooks and Advanced Features

### Installation Hooks

Hooks allow custom logic at different stages of the installation process.

```typescript
c.hooks({
  beforeInstall?: async (context) => { /* setup */ },
  afterDownload?: async (context) => { /* post-download */ },
  afterExtract?: async (context) => { /* post-extract */ },
  afterInstall?: async (context) => { /* finalization */ },
})
```

### Hook Context

Each hook receives an enhanced context object with the following properties:

```typescript
interface HookContext {
  // Basic installation info
  toolName: string;           // Name of the tool
  installDir: string;         // Installation directory
  downloadPath?: string;      // Path to downloaded file (afterDownload+)
  extractDir?: string;        // Extract directory (afterExtract+)
  extractResult?: ExtractResult; // Extraction results (afterExtract+)
  systemInfo: SystemInfo;     // Platform/architecture info (platform, arch, homeDir)
  
  // Enhanced capabilities
  fileSystem: IFileSystem;    // File system operations (mkdir, writeFile, etc.)
  logger: TsLogger;          // Structured logging
  appConfig: YamlConfig;     // User's application configuration
  toolConfig: ToolConfig;    // Full tool configuration
  $: ReturnType<typeof $>;   // ZX shell executor with cwd set to tool directory
  
  // Available in afterInstall hook only
  binaryPath?: string;       // Path to installed binary
  version?: string;          // Version of installed tool
}
```

**Available File System Methods:**
- `fileSystem.mkdir(path, { recursive: true })`
- `fileSystem.writeFile(path, content)`
- `fileSystem.readFile(path)`
- `fileSystem.exists(path)`
- `fileSystem.rm(path, { recursive: true })`
- `fileSystem.stat(path)`

**Available Shell Executor (`$`):**

The `$` property provides a ZX shell executor that automatically has its working directory (`cwd`) set to the directory containing the `.tool.ts` file. This allows hooks to easily access files and execute commands relative to the tool's configuration directory.

**Key Features:**
- **Automatic Working Directory**: `$` commands execute in the same directory as your `.tool.ts` file
- **Relative Path Support**: Use `./` to reference files next to your tool config
- **Template Literals**: Use tagged template literals for shell commands: `` $`command` ``
- **Promise-Based**: All `$` commands return promises with stdout, stderr, and exitCode
- **Cross-Platform**: Works consistently across Linux, macOS, and Windows

**Basic Usage:**
```typescript
c.hooks({
  afterInstall: async ({ $ }) => {
    // Commands run in the .tool.ts file's directory
    await $`ls -la ./`;                    // List tool config directory
    await $`cat ./config.toml`;            // Read config file next to .tool.ts
    await $`mkdir -p ./generated/`;        // Create subdirectory
  }
})
```

**Common Patterns:**
```typescript
// Check if files exist
const configExists = await $`test -f ./config.toml && echo "yes" || echo "no"`;
if (configExists.stdout.includes('yes')) {
  // Config file exists
}

// Copy files from tool directory to user's home
await $`cp ./dotfiles/.vimrc ${ctx.homeDir}/.vimrc`;

// Run tool-specific setup scripts
await $`chmod +x ./setup.sh && ./setup.sh`;

// Process configuration templates
await $`envsubst < ./config.template > ./config.generated`;
```

**Error Handling:**
```typescript
c.hooks({
  afterInstall: async ({ $, logger }) => {
    try {
      // Command that might fail
      const result = await $`./configure --enable-feature`;
      logger.info(`Configure output: ${result.stdout}`);
    } catch (error) {
      // ZX throws ProcessOutput on non-zero exit codes
      logger.error(`Configure failed: ${error.stderr}`);
      throw error; // Re-throw to fail the hook
    }
  }
})
```

**Working with Command Output:**
```typescript
c.hooks({
  afterInstall: async ({ $, logger }) => {
    // Capture and process command output
    const versionResult = await $`./tool --version`;
    const version = versionResult.stdout.trim();
    logger.info(`Installed version: ${version}`);
    
    // Use output in subsequent commands
    if (version.includes('2.')) {
      await $`./tool migrate-config`;
    }
    
    // Check exit codes
    const testResult = await $`./tool self-test`.exitCode;
    if (testResult !== 0) {
      throw new Error('Self-test failed');
    }
  }
})
```

**Best Practices:**
- Use `$` for shell operations that need to work with files relative to your tool config
- Use `fileSystem` methods for cross-platform file operations that don't require shell features
- Always handle errors appropriately in hooks to provide clear feedback
- Use `logger` to provide helpful debugging information
- Test your hooks on different platforms to ensure compatibility

### Hook Examples

**Custom Binary Movement:**
```typescript
import path from 'path';

c.hooks({
  afterExtract: async ({ extractDir, installDir, logger, $ }) => {
    // Move a deeply nested binary
    if (extractDir) {
      const sourcePath = path.join(extractDir, 'dist/bin/tool');
      const targetPath = path.join(installDir, 'tool');
      
      // Use shell commands for binary file operations
      await $`mv ${sourcePath} ${targetPath}`;
      await $`chmod +x ${targetPath}`;
      
      logger.info(`Moved binary from ${sourcePath} to ${targetPath}`);
    }
  }
})
```

**Build from Source:**
```typescript
import path from 'path';

c.hooks({
  afterExtract: async ({ extractDir, installDir, logger, $ }) => {
    if (extractDir) {
      logger.info('Building tool from source...');
      
      // Build the tool ($ is already configured with the tool's directory as cwd)
      await $`cd ${extractDir} && make build`;
      
      // Move built binary
      const builtBinary = path.join(extractDir, 'target/release/tool');
      const targetPath = path.join(installDir, 'tool');
      await $`mv ${builtBinary} ${targetPath}`;
      
      logger.info('Build completed successfully');
    }
  }
})
```

**Post-Installation Configuration:**
```typescript
import path from 'path';

c.hooks({
  afterInstall: async ({ toolName, systemInfo, fileSystem, logger }) => {
    // Create configuration directory using file system API
    const configDir = path.join(systemInfo.homeDir, '.config', toolName);
    await fileSystem.mkdir(configDir, { recursive: true });
    
    // Generate initial config
    const configPath = path.join(configDir, 'config.json');
    const configContent = JSON.stringify({
      version: "1.0",
      enabled: true
    }, null, 2);
    
    await fileSystem.writeFile(configPath, configContent);
    
    logger.info(`Created initial config at ${configPath}`);
  }
})
```

### Environment Variables

Set environment variables during installation:

```typescript
c.install('curl-script', {
  url: 'https://example.com/install.sh',
  shell: 'bash',
  env: {
    INSTALL_DIR: `${ctx.homeDir}/.local/bin`,
    ENABLE_FEATURE: 'true',
    API_KEY: process.env.TOOL_API_KEY || 'default',
  },
})
```

## TypeScript Requirements

### Import Statements

Always import required types at the top:

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { Platform, Architecture } from '@types';
```

### Function Signature

The default export must be an async function with this exact signature:

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Configuration goes here
};
```

### Type Safety

- All method calls are type-checked
- Invalid installation parameters will cause compilation errors
- Platform and Architecture values are validated
- Completion configurations are validated

### Common Type Errors

**Incorrect installation parameters:**
```typescript
// ❌ Wrong - 'formula' is required for brew
c.install('brew', {})

// ✅ Correct
c.install('brew', { formula: 'tool-name' })
```

**Invalid platform values:**
```typescript
// ❌ Wrong - Platform is an enum
c.platform('macos', (c) => {})

// ✅ Correct
c.platform(Platform.MacOS, (c) => {})
```

## Common Patterns and Examples

### 1. Simple GitHub Tool

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('ripgrep')
    .version('latest')
    .install('github-release', {
      repo: 'BurntSushi/ripgrep',
    })
    .completions({
      zsh: { source: 'complete/_rg' },
      bash: { source: 'complete/rg.bash' },
    })
    .zsh(/* zsh */ `
      alias rg="ripgrep"
    `);
};
```

### 2. Complex Tool with Multiple Features

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('fzf')
    .version('latest')
    .install('github-release', {
      repo: 'junegunn/fzf',
    })
    .completions({
      zsh: { source: 'shell/completion.zsh' },
    })
    .zsh(/* zsh */ `
      # Environment setup
      export FZF_DEFAULT_OPTS="--color=fg+:cyan,bg+:black,hl+:yellow"
      
      # Source key bindings
      _fzf_install_dir="${ctx.toolDir}"
      if [[ -f "$_fzf_install_dir/shell/key-bindings.zsh" ]]; then
        source "$_fzf_install_dir/shell/key-bindings.zsh"
      fi
      
      # Custom function
      function fzf-jump-to-dir() {
        local dir
        dir=$(find . -type d | fzf)
        [[ -n "$dir" ]] && cd "$dir"
      }
      
      # Create ZLE widget
      zle -N fzf-jump-to-dir
      
      # Bind key with vi-mode support
      if (( \${+zvm_after_init_commands} )); then
        zvm_after_init_commands+=("bindkey '^]' fzf-jump-to-dir")
      else
        bindkey '^]' fzf-jump-to-dir
      fi
    `);
};
```

### 3. Platform-Specific Tool

```typescript
import { Platform, type ToolConfigBuilder, type ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('aerospace')
    .version('latest')
    .platform(Platform.MacOS, (c) => {
      c
        .install('brew', {
          formula: 'nikitabobko/tap/aerospace',
          cask: true,
        })
        .symlink('./aerospace.toml', `${ctx.homeDir}/.config/aerospace/aerospace.toml`)
        .zsh(/* zsh */ `
          # macOS-specific aerospace shortcuts
          alias ar="aerospace reload-config"
          alias al="aerospace list-windows"
        `);
    });
};
```

### 4. Script-Based Installation

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('bun')
    .version('latest')
    .install('curl-script', {
      url: 'https://bun.sh/install',
      shell: 'bash',
    })
    .zsh(/* zsh */ `
      export BUN_INSTALL="${ctx.homeDir}/.bun"
      add-to-path "$BUN_INSTALL/bin"
      
      # Load completions
      [[ -s "$BUN_INSTALL/_bun" ]] && source "$BUN_INSTALL/_bun"
      
      # Aliases
      alias br="bun run"
      alias bt="bun test"
      alias btw="bun test --watch"
      
      # Helper functions
      function brf() {
        local file
        file=$(find . -name "*.ts" -o -name "*.tsx" | fzf)
        [[ -n "$file" ]] && bun run "$file"
      }
    `);
};
```

### 5. Tool with Configuration Files

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('lazygit')
    .version('latest')
    .install('github-release', {
      repo: 'jesseduffield/lazygit',
    })
    .symlink('./config.yml', `${ctx.homeDir}/.config/lazygit/config.yml`)
    .zsh(/* zsh */ `
      alias lg="lazygit"
      alias g="lazygit"
    `);
};
```

### 6. Tool with Hooks

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import path from 'path';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('custom-tool')
    .version('latest')
    .install('github-release', {
      repo: 'owner/custom-tool',
    })
    .hooks({
      afterInstall: async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
        // Create required directories using file system API
        const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
        await fileSystem.mkdir(dataDir, { recursive: true });
        
        // Initialize database using $ shell executor
        await $`${path.join(installDir, toolName)} init --data-dir ${dataDir}`;
        
        logger.info(`Initialized ${toolName} with data directory: ${dataDir}`);
      }
    })
    .zsh(/* zsh */ `
      export CUSTOM_TOOL_DATA="${ctx.homeDir}/.local/share/custom-tool"
      alias ct="custom-tool"
    `);
};
```

## Testing and Validation

### Compile-Time Validation

Run TypeScript compiler to check for errors:

```bash
bun lint
```

### Runtime Testing

Test tool installation:

```bash
# Install a specific tool
bun run cli.ts install tool-name

# Generate all configurations
bun run cli.ts generate

# Check for updates
bun run cli.ts check-updates tool-name
```

### Common Validation Steps

1. **TypeScript Compilation**: Ensure no type errors
2. **Installation Test**: Verify the tool installs correctly
3. **Binary Access**: Check that shims work and binaries are accessible
4. **Shell Integration**: Test aliases, functions, and environment variables
5. **Platform Compatibility**: Test on target platforms if using platform-specific configs

## Migration from Shell-Based Configs

### Converting from Zinit

| Zinit Pattern | ToolConfigBuilder Equivalent |
|---------------|------------------------------|
| `zinit ice from"gh-r"` | `.install('github-release', { repo: 'owner/repo' })` |
| `zinit load owner/repo` | `repo: 'owner/repo'` in install params |
| `mv="*/binary -> binary"` | `moveBinaryTo: 'binary'` |
| `pick"path/to/binary"` | `binaryPath: 'path/to/binary'` |
| `completions="path.zsh"` | `.completions({ zsh: { source: 'path.zsh' }})` |
| `atclone"make install"` | Use `hooks.afterExtract` or `hooks.afterInstall` |

### Migration Process

1. **Create tool directory**: `mkdir configs-migrated/tool-name/`
2. **Copy config files**: Copy non-script files from old config
3. **Create .tool.ts file**: Convert shell logic to TypeScript
4. **Update function signature**: Use `(c: ToolConfigBuilder, ctx: ToolConfigContext) => Promise<void>`
5. **Map installation method**: Convert zinit installation to appropriate method
6. **Convert shell initialization**: Move init.zsh content to `.zsh()` method
7. **Replace hardcoded paths**: Use context properties instead of `$DOTFILES`, `$HOME`, etc.
   - Use `${ctx.homeDir}` instead of `$HOME` or `~/`
   - Use `${ctx.toolDir}` for tool-specific directories
   - Use `${ctx.dotfilesDir}` instead of `$DOTFILES`
   - Use `${ctx.generatedDir}` for generated content
8. **Test thoroughly**: Ensure tool works as expected

## Troubleshooting

### Common Issues

**1. Tool not found after installation**
- Check that `.bin()` is called with correct binary names
- Verify shims are generated in the bin directory
- Ensure PATH includes the generated bin directory

**2. Installation fails**
- Check asset patterns for GitHub releases
- Verify repository names and URLs
- Review installation logs for specific errors

**3. Shell integration not working**
- Ensure shell scripts are properly sourced
- Check for syntax errors in shell code
- Verify environment variables are set correctly

**4. Platform-specific issues**
- Check platform detection logic
- Verify asset patterns work for all target platforms
- Test on actual target platforms when possible

**5. Completion issues**
- Verify completion file paths in extracted archives
- Check that completion directories exist
- Ensure shell completion loading is properly configured

### Debugging Tools

**Check generated files:**
```bash
# View generated shell scripts
cat ${ctx.generatedDir}/shell-scripts/main.zsh

# Check shim contents  
cat ${ctx.generatedDir}/bin/tool-name

# View tool installation directory
ls -la ${ctx.toolDir}/
```

**Enable debug logging:**
```bash
# Set debug environment variable
export DEBUG=1
bun run cli.ts install tool-name
```

**Validate configuration:**
```bash
# Check configuration syntax
bun run cli.ts files tool-name

# Test specific operations
bun run cli.ts generate --tool tool-name
```

### Performance Considerations

- Keep shell initialization code efficient
- Avoid heavy operations in shell init scripts
- Use lazy loading for expensive setup
- Cache frequently-used computations

### Security Best Practices

- Never include secrets or API keys in configuration files
- Validate all external inputs in hooks
- Use secure methods for downloading and executing scripts
- Be cautious with file permissions in hooks

## Advanced Topics

### Custom Asset Selection

For complex release patterns, implement custom asset selectors:

```typescript
c.install('github-release', {
  repo: 'owner/tool',
  assetSelector: (assets, systemInfo) => {
    // Custom logic to select the right asset
    const osMap = {
      'darwin': 'macos',
      'linux': 'linux',
      'win32': 'windows'
    };
    
    const archMap = {
      'x64': 'amd64',
      'arm64': 'arm64'
    };
    
    const osKey = osMap[systemInfo.platform];
    const archKey = archMap[systemInfo.arch];
    
    return assets.find(asset => 
      asset.name.toLowerCase().includes(osKey) &&
      asset.name.toLowerCase().includes(archKey) &&
      asset.name.endsWith('.tar.gz')
    );
  }
})
```

### Dynamic Configuration

Use environment variables or system detection:

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  const version = process.env.TOOL_VERSION || 'latest';
  const enableFeature = process.env.ENABLE_FEATURE === 'true';
  
  c
    .bin('tool')
    .version(version)
    .install('github-release', { repo: 'owner/tool' });
    
  if (enableFeature) {
    c.zsh(/* zsh */ `
      export TOOL_FEATURE_ENABLED=1
    `);
  }
};
```

### Real-World Shell Executor Examples

**Configuration File Processing with Templates:**
```typescript
import path from 'path';

c.hooks({
  afterInstall: async ({ toolName, systemInfo, $, logger }) => {
    // Process configuration template using shell tools
    await $`envsubst < ./config/template.conf > ./config/generated.conf`;
    
    // Use tool-specific configuration processors
    await $`./scripts/configure.sh "${systemInfo.homeDir}" "${toolName}"`;
    
    // Copy processed configs to user directory
    const userConfigDir = path.join(systemInfo.homeDir, '.config', toolName);
    await $`mkdir -p "${userConfigDir}"`;
    await $`cp ./config/generated.conf "${userConfigDir}/config.conf"`;
    
    logger.info(`Configured ${toolName} with processed templates`);
  }
})
```

**Building Tools from Source:**
```typescript
c.hooks({
  afterExtract: async ({ extractDir, installDir, $, logger }) => {
    if (extractDir) {
      // Navigate to source directory and build
      await $`cd ${extractDir} && make clean`;
      await $`cd ${extractDir} && ./configure --prefix="${installDir}"`;
      await $`cd ${extractDir} && make -j$(nproc)`;
      
      // Install to our managed location
      await $`cd ${extractDir} && make install`;
      
      // Clean up build artifacts
      await $`cd ${extractDir} && make clean`;
      
      logger.info('Built tool from source successfully');
    }
  }
})
```

**Setting Up Development Environment:**
```typescript
c.hooks({
  afterInstall: async ({ toolName, binaryPath, systemInfo, $, logger }) => {
    // Initialize tool's working directory structure
    const toolWorkspace = path.join(systemInfo.homeDir, `.${toolName}`);
    await $`mkdir -p "${toolWorkspace}"/{bin,config,data,logs}`;
    
    // Copy tool-specific scripts and configs
    await $`cp -r ./scripts/* "${toolWorkspace}/bin/"`;
    await $`cp -r ./config/* "${toolWorkspace}/config/"`;
    await $`chmod +x "${toolWorkspace}"/bin/*`;
    
    // Set up initial data files
    await $`./setup/init-data.sh "${toolWorkspace}/data"`;
    
    // Create symlinks for easy access
    await $`ln -sf "${binaryPath}" "${toolWorkspace}/bin/${toolName}"`;
    
    logger.info(`Development environment set up at ${toolWorkspace}`);
  }
})
```

**Platform-Specific Setup Scripts:**
```typescript
c.hooks({
  afterInstall: async ({ systemInfo, $, logger }) => {
    // Run platform-specific setup
    const setupScript = systemInfo.platform === 'darwin' 
      ? './setup/macos-setup.sh'
      : systemInfo.platform === 'win32'
      ? './setup/windows-setup.bat'
      : './setup/linux-setup.sh';
    
    if (await $`test -f ${setupScript}`.exitCode === 0) {
      await $`chmod +x ${setupScript}`;
      await $`${setupScript}`;
      logger.info(`Ran platform-specific setup: ${setupScript}`);
    } else {
      logger.warn(`Setup script not found: ${setupScript}`);
    }
  }
})
```

**Dependency Management:**
```typescript
c.hooks({
  beforeInstall: async ({ $, logger }) => {
    // Check for required dependencies
    const dependencies = ['git', 'curl', 'jq'];
    
    for (const dep of dependencies) {
      try {
        await $`command -v ${dep}`;
        logger.info(`Dependency satisfied: ${dep}`);
      } catch (error) {
        throw new Error(`Missing required dependency: ${dep}`);
      }
    }
    
    // Download and install additional tools if needed
    if (await $`test -f ./deps/install-deps.sh`.exitCode === 0) {
      await $`chmod +x ./deps/install-deps.sh && ./deps/install-deps.sh`;
    }
  }
})
```

### Complex Hooks with External Dependencies

```typescript
import path from 'path';
import { createHash } from 'crypto';

c.hooks({
  afterInstall: async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
    // Generate unique identifier
    const hash = createHash('sha256')
      .update(toolName + installDir)
      .digest('hex')
      .substring(0, 8);
    
    // Create tool-specific data directory
    const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName, hash);
    await fileSystem.mkdir(dataDir, { recursive: true });
    
    // Download additional resources using $ shell executor
    const resourceUrl = 'https://example.com/resources.json';
    const resourcePath = path.join(dataDir, 'resources.json');
    await $`curl -fsSL ${resourceUrl} -o ${resourcePath}`;
    
    // Set up environment file
    const envFile = path.join(dataDir, 'env.sh');
    await fileSystem.writeFile(envFile, `export TOOL_DATA_DIR="${dataDir}"\n`);
    
    logger.info(`Setup complete: ${dataDir}`);
  }
})
```

## Troubleshooting Shell Executor (`$`) Issues

### Common `$` Problems and Solutions

**Problem: Commands not finding files relative to tool config**
```
Error: ./config.toml: No such file or directory
```
**Solution:** Ensure you're using `$` (not `fileSystem` methods) for shell commands that need to access files relative to your `.tool.ts` file:
```typescript
// ❌ Wrong - fileSystem doesn't use tool directory as cwd
await fileSystem.readFile('./config.toml');

// ✅ Correct - $ automatically uses tool directory as cwd
const result = await $`cat ./config.toml`;
```

**Problem: Working directory not what you expected**
```
Error: Commands running in wrong directory
```
**Solution:** Remember that `$` automatically sets `cwd` to your `.tool.ts` file's directory:
```typescript
// Check current working directory
const pwd = await $`pwd`;
console.log('Working directory:', pwd.stdout.trim());

// Use absolute paths if you need to work elsewhere
await $`cd ${installDir} && ./binary --version`;
```

**Problem: Shell commands failing on Windows**
```
Error: 'ls' is not recognized as an internal or external command
```
**Solution:** Use cross-platform commands or detect platform:
```typescript
// ❌ Unix-specific command
await $`ls -la ./`;

// ✅ Cross-platform approach
if (systemInfo.platform === 'win32') {
  await $`dir .`;
} else {
  await $`ls -la ./`;
}
```

**Problem: Command output not captured correctly**
```
Error: Cannot read property 'stdout' of undefined
```
**Solution:** Always await `$` commands and handle errors:
```typescript
// ❌ Missing await
const result = $`tool --version`;

// ✅ Proper async/await with error handling
try {
  const result = await $`tool --version`;
  const version = result.stdout.trim();
} catch (error) {
  logger.error(`Command failed: ${error.stderr}`);
}
```

**Problem: Environment variables not available in `$` commands**
```
Error: Environment variable not found
```
**Solution:** Pass environment variables explicitly or use systemInfo:
```typescript
// Using systemInfo for common paths
await $`cp ./config ${ctx.homeDir}/.config/tool/`;

// Setting environment variables for the command
await $`CUSTOM_VAR=value ./script.sh`;
```

### Best Practices Summary

- ✅ Use `$` for shell operations that need tool-relative paths
- ✅ Use `fileSystem` for cross-platform file operations
- ✅ Always handle errors with try/catch blocks
- ✅ Test hooks on multiple platforms
- ✅ Use `logger` to provide debugging information
- ✅ Prefer absolute paths when working outside tool directory

---

This comprehensive guide covers all aspects of creating `.tool.ts` files. Each tool configuration should be tailored to its specific needs while following these established patterns and best practices.