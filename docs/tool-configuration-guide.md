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
└── tool-name/
    ├── tool-name.tool.ts   # Main configuration
    └── config.toml         # Tool's config files
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
      stripComponents: 1,
    })
    
    // Add shell completions
    .completions({
      zsh: { source: 'completions/_tool.zsh' },
      bash: { source: 'completions/tool.bash' },
    })
    
    // Configure symbolic links
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    
    // Add shell configuration
    .zsh({
      // Use declarative configuration for environment variables and aliases
      environment: {
        'TOOL_CONFIG_DIR': `${ctx.homeDir}/.tool`
      },
      
      aliases: {
        't': 'tool'
      },
      
      completions: { source: 'completions/_tool.zsh' },
      shellInit: [
        always/* zsh */`
          # Functions
          function tool-helper() {
            tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
          }
        `
      ]
    });
};
```

## ToolConfigContext Interface

The `ToolConfigContext` provides access to configuration paths and directories for tool configuration. This context is automatically passed to your tool configuration function and provides type-safe access to all configuration paths from the YAML config.

### Context Properties

```typescript
interface ToolConfigContext {
  /** Current tool's installation directory (should contain version subdirectories) */
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
  c.zsh({
    // Use declarative configuration for environment variables
    environment: {
      'TOOL_CONFIG_DIR': `${ctx.toolDir}`
    },
    
    shellInit: [
      always/* zsh */`
        # Source tool-specific files
        if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
          source "${ctx.toolDir}/shell/key-bindings.zsh"
        fi
      `
    ]
  });
};
```

**Accessing Other Tool Directories:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh({
    shellInit: [
      always/* zsh */`
        # Reference another tool's directory
        FZF_DIR="${ctx.getToolDir('fzf')}"
        if [[ -d "$FZF_DIR" ]]; then
          export FZF_BASE="$FZF_DIR"
        fi
      `
    ]
  });
};
```

**Using Generated Directories:**
```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.zsh({
    shellInit: [
      once/* zsh */`
        # Generate completions to the proper directory
        tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
      `
    ]
  });
};
```

**Path Resolution Benefits:**
- **Type Safety**: All paths are validated at compile time
- **Configuration Source**: Paths come from YAML config as single source of truth
- **No Hard-coding**: Eliminates hardcoded `$DOTFILES` or similar references
- **Flexibility**: Easy access to any configured directory
- **Consistency**: Same path resolution across all tools

## Path Resolution Summary

Understanding how paths are resolved is crucial for correctly configuring your tools. Different methods have different path resolution rules:

### Tool Configuration Directory
- **Location**: The directory containing your `.tool.ts` file
- **Example**: If your configuration is at `configs-migrated/fzf/fzf.tool.ts`, then the tool directory is `configs-migrated/fzf/`

### Path Resolution Rules by Method

| Method | Path Type | Resolution Rule | Example |
|--------|-----------|-----------------|---------|
| **symlink()** | `source` starting with `./` | Relative to tool configuration directory | `'./config.toml'` → `configs-migrated/fzf/config.toml` |
| **symlink()** | `source` absolute path | Used as-is | `'/etc/global.conf'` → `/etc/global.conf` |
| **symlink()** | `target` | Must be absolute (use context) | `\`${ctx.homeDir}/.config/tool/config.toml\`` |
| **completions()** | `source` | Relative to extracted archive root | `'shell/completion.zsh'` → inside downloaded archive |
| **completions()** | `targetDir` | Must be absolute (optional) | `\`${ctx.homeDir}/.zsh/completions\`` |
| **install('github-release')** | `binaryPath` | Relative to extracted archive root | `'bin/tool'` → locates binary inside downloaded archive |
| **install('manual')** | `binaryPath` | Must be absolute path | `'/usr/local/bin/tool'` or `\`${ctx.homeDir}/bin/tool\`` |

### Context Variables for Paths

Always use ToolConfigContext variables for dynamic paths:
- `${ctx.homeDir}` → User's home directory  
- `${ctx.toolDir}` → Tool's base installation directory (contains version subdirectories)
- `${ctx.dotfilesDir}` → Root dotfiles directory
- `${ctx.generatedDir}` → Generated files directory
- `${ctx.binDir}` → Generated shims directory (where tool shims are created)
- `${ctx.shellScriptsDir}` → Generated shell scripts directory

### Common Path Patterns

```typescript
// ✅ Correct symlink usage
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)

// ✅ Correct completion usage  
c.completions({ zsh: { source: 'shell/completion.zsh' } })

// ✅ Correct install usage  
c.install('github-release', {
  repo: 'owner/tool',
  binaryPath: 'bin/tool',           // Binary location inside archive (used for shim generation)
})

// ❌ Incorrect - using hardcoded paths
c.symlink('./config.toml', '~/.config/tool/config.toml')
c.symlink('./config.toml', '/home/user/.config/tool/config.toml')
```

### Recommended Directory Structure

For optimal tool management, the system should use a versioned directory structure that preserves archive integrity:

```
${ctx.generatedDir}/binaries/
├── tool-name/
│   └── version/                 # e.g., "1.2.3" or "latest"  
│       ├── bin/                 # Extracted archive contents (preserved)
│       │   └── tool-binary
│       ├── lib/                 # Shared libraries (if any)
│       ├── share/               # Assets, docs, etc.
│       └── config/              # Default configs
```

**Benefits of this approach:**
- **Archive Integrity**: Tools can access their dependencies (shared libs, configs, assets)
- **Version Management**: Easy to switch between versions or rollback
- **Immutable Installs**: Once extracted, archives remain untouched
- **Shim-Based Execution**: Shims in `${ctx.binDir}` point to actual binaries

**How it works:**
1. Archives are extracted to `${ctx.toolDir}/version/` 
2. Archive structure is preserved completely
3. `binaryPath` identifies which file is the main executable
4. Shims are generated in `${ctx.binDir}/` that execute the binary from its original location
5. No files are moved or copied from the extraction location


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
- **`binaryPath`**: Path to executable **relative to extracted archive root**
  ```typescript
  binaryPath: 'bin/tool'           // Binary located at bin/tool inside extracted archive
  binaryPath: 'tool'               // Binary located at archive root
  binaryPath: 'dist/linux/tool'   // Binary located at dist/linux/tool inside archive
  ```
  This path is used to generate shims that point to the binary at its original location within the extracted archive.
  
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
  stripComponents?: 1,                     // Optional
})
```

**Examples:**

```typescript
c.install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
  extractPath: 'bin/tool',
})
```

### 5. Manual (`'manual'`)

For tools installed by other means or already present on the system.

```typescript
c.install('manual', {
  binaryPath: '/path/to/binary',  // Required: absolute path to existing binary
})
```

**Parameters:**
- **`binaryPath`**: **Absolute path** to the existing binary on the system
  - Must be absolute path (e.g., `/usr/local/bin/tool`, `${ctx.homeDir}/bin/custom-tool`)
  - The binary must already exist at this location

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

### Modern Shell Configuration API

The shell integration system now groups all shell-specific configuration by shell type, providing better organization and extensibility. Each shell method (`.zsh()`, `.bash()`, `.powershell()`) accepts a configuration object that can include completions, shell initialization scripts, and future shell-specific features.

### Shell Script Execution Timing

The shell integration system supports two types of scripts with different execution timing:

- **Always Scripts**: Run every time the shell starts (traditional behavior)  
- **Once Scripts**: Run only once after tool installation or updates (for expensive operations)

This distinction helps optimize shell startup performance by preventing expensive operations like completion generation from running on every shell startup.

### Declarative Configuration vs Script-Based Configuration

The shell integration system provides two approaches for configuring environment variables and aliases:

1. **Declarative Configuration**: Use structured objects for common configurations
2. **Script-Based Configuration**: Write shell scripts for complex logic and custom functions

#### Declarative Configuration Benefits

**Environment Variables:**
- Clean, structured definition in configuration objects
- Automatic shell-specific syntax generation (`export` for zsh/bash, `$env:` for PowerShell)
- Type safety and validation
- Cross-shell compatibility with single definition

**Aliases:**
- Simple key-value pairs for alias definitions
- Automatic shell-specific syntax generation
- Performance optimized (generated once, not evaluated on each shell startup)
- Clear separation from complex shell functions

#### When to Use Each Approach

**Use Declarative Configuration for:**
- Simple environment variable assignments
- Basic command aliases
- Cross-shell compatibility requirements
- Clean, maintainable configurations

**Use Script-Based Configuration for:**
- Complex shell functions
- Conditional logic and environment detection  
- Advanced shell features (ZLE widgets, key bindings)
- Shell-specific optimizations
- Integration with external tools and completion systems

### `.zsh(config: ShellConfig)`

Configures Zsh-specific properties including shell scripts, completions, and future shell-specific features.

**Configuration Object:**
```typescript
interface ShellConfig {
  completions?: ShellCompletionConfig;  // Shell completions
  shellInit?: ShellScript[];           // Shell initialization scripts
  aliases?: Record<string, string>;    // Shell aliases (alias name -> command)
  environment?: Record<string, string>; // Environment variables (var name -> value)
  // Future extensions:
  // functions?: ShellFunction[];
  // keybindings?: KeyBinding[];
}
```

**Branded Script Types:**
- `always(script)`: For scripts that should run on every shell startup
- `once(script)`: For scripts that should run only once after installation/updates

**Usage:**
```typescript
import { once, always } from '@types';

c.zsh({
  // Define environment variables - automatically converted to export statements
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.toolDir}`,
    'TOOL_DEBUG': 'true',
    'TOOL_MODE': 'production'
  },
  
  // Define aliases - automatically converted to shell alias commands
  aliases: {
    't': 'tool',
    'tl': 'tool list',
    'ts': 'tool status',
    'tc': 'tool config'
  },
  
  completions: {
    source: 'shell/completion.zsh',
    name: '_my-tool'
  },
  shellInit: [
    once/* zsh */`
      # Generate completions (runs only once)
      tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
    `,
    always/* zsh */`
      # Fast runtime setup (runs every shell startup)
      
      # Custom functions
      function tool-helper() {
        tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
      }
    `
  ]
})
```

**Comprehensive Configuration Example:**
```typescript
c.zsh({
  // Declarative environment variables - clean and cross-shell compatible
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.homeDir}/.config/tool`,
    'TOOL_DATA_DIR': `${ctx.homeDir}/.local/share/tool`,
    'TOOL_DEBUG': 'false',
    'TOOL_LOG_LEVEL': 'info'
  },
  
  // Declarative aliases - simple and performant
  aliases: {
    't': 'tool',
    'tl': 'tool list',
    'ts': 'tool status', 
    'tc': 'tool config',
    'td': 'tool --debug'
  },
  
  completions: {
    source: 'shell/completion.zsh',
    name: '_my-tool'
  },
  
  // Script-based configuration for complex logic
  shellInit: [
    once/* zsh */`
      # One-time expensive operations
      tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
      tool cache-warm > /dev/null 2>&1 || true
    `,
    always/* zsh */`
      # Fast runtime setup and complex functions
      add-to-path "${ctx.toolDir}/bin"
      
      # Complex function with error handling
      function tool-project() {
        local project_dir="$1"
        if [[ -z "$project_dir" ]]; then
          echo "Usage: tool-project <directory>" >&2
          return 1
        fi
        
        if [[ ! -d "$project_dir" ]]; then
          echo "Directory not found: $project_dir" >&2
          return 1
        fi
        
        cd "$project_dir" && tool init
      }
      
      # ZLE widget for interactive selection
      function tool-picker() {
        local selection=$(tool list --format=name | fzf --preview 'tool info {}')
        if [[ -n "$selection" ]]; then
          zle kill-whole-line
          BUFFER="tool run $selection"
          zle accept-line
        fi
        zle redisplay
      }
      zle -N tool-picker
      
      # Key binding with vi-mode support
      if (( \${+zvm_after_init_commands} )); then
        zvm_after_init_commands+=("bindkey '^T' tool-picker")
      else
        bindkey '^T' tool-picker
      fi
      
      # Conditional integration
      if command -v tool >/dev/null 2>&1; then
        eval "$(tool init zsh 2>/dev/null || echo '# tool init failed')"
      fi
    `
  ]
})
```

**Aliases Advantages:**
- **Clean Configuration**: Aliases are defined declaratively in the configuration object
- **Automatic Generation**: Shell-specific alias syntax is generated automatically
- **Cross-Shell Support**: Same alias definitions work for zsh, bash, and powershell
- **Performance**: Aliases are generated once and executed efficiently
- **Maintainability**: Easy to see all aliases at a glance in the configuration

**Performance Benefits:**
- Expensive operations (completion generation, cache building) run only once
- Shell startup remains fast with lightweight always scripts
- Once scripts automatically self-delete after execution to prevent re-running

**Common Patterns:**

```typescript
c.zsh({
  // Use declarative configuration for environment variables
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.homeDir}/.config/tool`,
    'TOOL_DATA_DIR': `${ctx.homeDir}/.local/share/tool`
  },
  
  // Use declarative configuration for simple aliases
  aliases: {
    't': 'tool',
    'tl': 'tool list',
    'ts': 'tool status'
  },
  
  shellInit: [
    always/* zsh */`
      # PATH modifications
      add-to-path "${ctx.homeDir}/.tool/bin"
      
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
    `
  ]
})
```

### `.bash(config: ShellConfig)`

Configures Bash-specific properties using the same configuration object structure as Zsh.

**Example:**
```typescript
c.bash({
  // Environment variables work the same way in bash
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.homeDir}/.config/tool`,
    'TOOL_DEBUG': 'true'
  },
  
  // Aliases work the same way in bash  
  aliases: {
    't': 'tool',
    'tl': 'tool list',
    'ts': 'tool status'
  },
  
  completions: {
    source: 'shell/completion.bash'
  },
  
  shellInit: [
    always/* bash */`
      # Source key bindings for bash
      if [[ -f "${ctx.toolDir}/shell/key-bindings.bash" ]]; then
        source "${ctx.toolDir}/shell/key-bindings.bash"
      fi
    `
  ]
})
```

### `.powershell(config: ShellConfig)`

Configures PowerShell-specific properties for Windows support.

**Example:**
```typescript
c.powershell({
  // Environment variables automatically converted to $env: assignments
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.homeDir}\\.tool`,
    'TOOL_DEBUG': 'true'
  },
  
  // Aliases automatically converted to Set-Alias commands
  aliases: {
    't': 'tool',
    'tl': 'tool list',
    'ts': 'tool status'
  },
  
  completions: {
    source: 'shell/completion.ps1'
  },
  
  shellInit: [
    always/* powershell */`
      function tool-helper {
        tool --config "$env:TOOL_CONFIG_DIR\\config.toml" @args
      }
    `
  ]
})
```

### Path Usage in Shell Scripts

When writing shell scripts within `.zsh()`, `.bash()`, or `.powershell()` methods, use ToolConfigContext variables for all paths:

**✅ Correct Path Usage:**
```typescript
import { once, always } from '@types';

c.zsh({
  // Use declarative configuration for environment variables
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.toolDir}`,
    'TOOL_DATA_DIR': `${ctx.homeDir}/.local/share/tool`
  },
  
  shellInit: [
    once/* zsh */`
      # Generate completions to proper directory (expensive operation, run only once)
      if command -v tool >/dev/null 2>&1; then
        tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
      fi
    `,
    always/* zsh */`
      # Source files from tool directory
      if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
        source "${ctx.toolDir}/shell/key-bindings.zsh"
      fi
      
      # Reference other tools
      FZF_DIR="${ctx.getToolDir('fzf')}"
      [[ -d "$FZF_DIR" ]] && export FZF_BASE="$FZF_DIR"
    `
  ]
});
```

**❌ Incorrect Path Usage:**
```typescript
// Don't use hardcoded paths or inline exports for simple environment variables
c.zsh({
  shellInit: [
    always/* zsh */`
      export TOOL_CONFIG_DIR="$HOME/.config/tool"     // ❌ Use declarative environment config instead
      export TOOL_DATA_DIR="$HOME/.local/share/tool"  // ❌ Use declarative environment config instead
      source "$DOTFILES/.generated/tools/tool/init"   // ❌ Use ${ctx.toolDir} instead
      tool complete > ~/.zsh/completions/_tool        // ❌ Use ${ctx.generatedDir} instead
      alias t="tool"                                   // ❌ Use declarative aliases config instead
    `
  ]
});
```

**Path Context Variables Reference:**
- `${ctx.toolDir}` → Tool's base installation directory (contains version subdirectories)  
- `${ctx.homeDir}` → User's home directory
- `${ctx.dotfilesDir}` → Root dotfiles directory  
- `${ctx.generatedDir}` → Generated files directory
- `${ctx.getToolDir('other-tool')}` → Another tool's base directory

**Note:** For referencing files within the current tool version, you'll typically need to construct paths like:
- `${ctx.toolDir}/latest/share/` for tool assets
- `${ctx.toolDir}/latest/config/` for tool configs

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
    .zsh({
      // Use declarative configuration for environment variables
      environment: {
        'TOOL_USE_COREAUDIO': '1'
      }
    });
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
    .zsh({
      // Use declarative configuration for environment variables
      environment: {
        'TOOL_USE_UNIX_SOCKETS': '1'
      }
    });
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
      .zsh({
        // Use declarative aliases instead of inline shell scripts
        aliases: {
          't': 'tool --macos-mode'
        }
      });
  });
  
  // Linux-specific
  c.platform(Platform.Linux, (c) => {
    c
      .install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      })
      .zsh({
        // Use declarative aliases instead of inline shell scripts
        aliases: {
          't': 'tool --linux-mode'
        }
      });
  });
  
  // Windows-specific
  c.platform(Platform.Windows, (c) => {
    c
      .install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows*.zip',
      })
      .powershell({
        // Use declarative aliases instead of inline shell scripts
        aliases: {
          't': 'tool --windows-mode'
        }
      });
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

- **`source`**: Path to completion file **relative to the extracted tool archive root**
  - Example: `'completions/_tool.zsh'` looks for `completions/_tool.zsh` inside the extracted archive
  - Example: `'shell/completion.zsh'` looks for `shell/completion.zsh` inside the extracted archive
- **`name`**: Optional custom name for the installed completion file (defaults to source filename)
- **`targetDir`**: Optional custom installation directory **absolute path** (defaults to shell-specific completion directory)

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
- **`source`**: Path to source file or directory to be symlinked
  - **Relative paths** (starting with `./`): Relative to the **tool configuration directory** (where the `.tool.ts` file is located)
  - **Absolute paths**: Used as-is
  - Example: `'./config.toml'` looks for `config.toml` next to your `.tool.ts` file
  - Example: `'./themes/'` looks for `themes/` directory next to your `.tool.ts` file
- **`target`**: **Absolute path** where symlink should be created
  - Must be absolute path (use `${ctx.homeDir}/...`, `${ctx.dotfilesDir}/...`, etc.)
  - Example: `${ctx.homeDir}/.config/tool/config.toml`

**Path Resolution Rules:**
- **Source paths** starting with `./` → Relative to tool configuration directory (same directory as `.tool.ts` file)
- **Source paths** without `./` but not absolute → Also relative to tool configuration directory  
- **Source paths** starting with `/` → Absolute paths used as-is
- **Target paths** → Must always be absolute paths using context variables

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
    .zsh({
      // Use declarative aliases instead of inline shell scripts
      aliases: {
        'rg': 'ripgrep'
      }
    });
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
    .zsh({
      // Use declarative configuration for environment variables
      environment: {
        'FZF_DEFAULT_OPTS': '--color=fg+:cyan,bg+:black,hl+:yellow'
      },
      
      completions: { source: 'shell/completion.zsh' },
      shellInit: [
        always/* zsh */`
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
        `
      ]
    });
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
        .zsh({
          // Use declarative aliases instead of inline shell scripts
          aliases: {
            'ar': 'aerospace reload-config',
            'al': 'aerospace list-windows'
          }
        });
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
    .zsh({
      // Use declarative configuration for environment variables and aliases
      environment: {
        'BUN_INSTALL': `${ctx.homeDir}/.bun`
      },
      
      aliases: {
        'br': 'bun run',
        'bt': 'bun test',
        'btw': 'bun test --watch'
      },
      
      shellInit: [
        always/* zsh */`
          add-to-path "$BUN_INSTALL/bin"
          
          # Load completions
          [[ -s "$BUN_INSTALL/_bun" ]] && source "$BUN_INSTALL/_bun"
          
          # Helper functions
          function brf() {
            local file
            file=$(find . -name "*.ts" -o -name "*.tsx" | fzf)
            [[ -n "$file" ]] && bun run "$file"
          }
        `
      ]
    });
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
    .zsh({
      // Use declarative aliases instead of inline shell scripts
      aliases: {
        'lg': 'lazygit',
        'g': 'lazygit'
      }
    });
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
    .zsh({
      // Use declarative configuration for simple values
      environment: {
        'CUSTOM_TOOL_DATA': `${ctx.homeDir}/.local/share/custom-tool`
      },
      aliases: {
        'ct': 'custom-tool'
      }
    });
};
```

### 7. Modern Tool with Declarative Configuration

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { always, once } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin(['modern-tool', 'mt', 'mt-admin'])
    .version('latest')
    .install('github-release', {
      repo: 'owner/modern-tool',
    })
    .completions({
      zsh: { source: 'completions/_modern-tool' },
      bash: { source: 'completions/modern-tool.bash' },
      powershell: { source: 'completions/modern-tool.ps1' }
    })
    
    // Cross-shell compatible declarative configuration
    .zsh({
      // Environment variables with context paths
      environment: {
        'MT_CONFIG_DIR': `${ctx.homeDir}/.config/modern-tool`,
        'MT_DATA_DIR': `${ctx.homeDir}/.local/share/modern-tool`,
        'MT_CACHE_DIR': `${ctx.homeDir}/.cache/modern-tool`,
        'MT_LOG_LEVEL': 'info',
        'MT_THEME': 'auto'
      },
      
      // Clean alias definitions
      aliases: {
        'mt': 'modern-tool',
        'mts': 'modern-tool status',
        'mtl': 'modern-tool list',
        'mtc': 'modern-tool config',
        'mtr': 'modern-tool run',
        'mtd': 'modern-tool --debug'
      },
      
      shellInit: [
        once/* zsh */`
          # One-time setup operations
          modern-tool completions zsh > "${ctx.generatedDir}/completions/_mt"
          modern-tool cache --warm >/dev/null 2>&1 || true
        `,
        always/* zsh */`
          # Runtime functions and integrations
          function mt-project() {
            local project=$(modern-tool projects list | fzf --preview 'modern-tool project info {}')
            [[ -n "$project" ]] && modern-tool project switch "$project"
          }
          
          # Auto-completion for custom commands
          if command -v modern-tool >/dev/null 2>&1; then
            eval "$(modern-tool init zsh)"
          fi
        `
      ]
    })
    
    // Same aliases work automatically for bash  
    .bash({
      environment: {
        'MT_CONFIG_DIR': `${ctx.homeDir}/.config/modern-tool`,
        'MT_DATA_DIR': `${ctx.homeDir}/.local/share/modern-tool`,
        'MT_CACHE_DIR': `${ctx.homeDir}/.cache/modern-tool`,
        'MT_LOG_LEVEL': 'info',
        'MT_THEME': 'auto'
      },
      
      aliases: {
        'mt': 'modern-tool',
        'mts': 'modern-tool status',
        'mtl': 'modern-tool list',
        'mtc': 'modern-tool config',
        'mtr': 'modern-tool run',
        'mtd': 'modern-tool --debug'
      },
      
      shellInit: [
        always/* bash */`
          # Bash-specific integration
          if command -v modern-tool >/dev/null 2>&1; then
            eval "$(modern-tool init bash)"
          fi
        `
      ]
    })
    
    // PowerShell configuration with automatic syntax conversion
    .powershell({
      environment: {
        'MT_CONFIG_DIR': `${ctx.homeDir}\\.config\\modern-tool`,
        'MT_DATA_DIR': `${ctx.homeDir}\\.local\\share\\modern-tool`,
        'MT_CACHE_DIR': `${ctx.homeDir}\\.cache\\modern-tool`,
        'MT_LOG_LEVEL': 'info',
        'MT_THEME': 'auto'
      },
      
      aliases: {
        'mt': 'modern-tool',
        'mts': 'modern-tool status',
        'mtl': 'modern-tool list',
        'mtc': 'modern-tool config',
        'mtr': 'modern-tool run',
        'mtd': 'modern-tool --debug'
      },
      
      shellInit: [
        always/* powershell */`
          # PowerShell-specific functions
          function mt-project {
            $project = modern-tool projects list | fzf --preview 'modern-tool project info {}'
            if ($project) {
              modern-tool project switch $project
            }
          }
          
          if (Get-Command modern-tool -ErrorAction SilentlyContinue) {
            Invoke-Expression (modern-tool init powershell)
          }
        `
      ]
    });
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
| `mv="*/binary -> binary"` | Not needed - binary stays in extracted location |
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
7. **Extract declarative configurations**: Identify environment variables and aliases for declarative configuration
8. **Replace hardcoded paths**: Use context properties instead of `$DOTFILES`, `$HOME`, etc.
   - Use `${ctx.homeDir}` instead of `$HOME` or `~/`
   - Use `${ctx.toolDir}` for tool-specific directories
   - Use `${ctx.dotfilesDir}` instead of `$DOTFILES`
   - Use `${ctx.generatedDir}` for generated content
9. **Test thoroughly**: Ensure tool works as expected

### Converting Shell Scripts to Declarative Configuration

**Before (Shell-based):**
```bash
# In old init.zsh file
export TOOL_CONFIG_DIR="$HOME/.config/tool"
export TOOL_DEBUG="true"
export TOOL_MODE="production"

alias t="tool"
alias tl="tool list"
alias ts="tool status --verbose"
alias tc="tool config edit"

# Complex function
function tool-helper() {
  tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
}
```

**After (Declarative + Script hybrid):**
```typescript
c.zsh({
  // Extract simple environment variables to declarative config
  environment: {
    'TOOL_CONFIG_DIR': `${ctx.homeDir}/.config/tool`,
    'TOOL_DEBUG': 'true',
    'TOOL_MODE': 'production'
  },
  
  // Extract simple aliases to declarative config  
  aliases: {
    't': 'tool',
    'tl': 'tool list', 
    'ts': 'tool status --verbose',
    'tc': 'tool config edit'
  },
  
  shellInit: [
    always/* zsh */`
      # Keep complex functions in scripts
      function tool-helper() {
        tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
      }
    `
  ]
})
```

**Benefits of Migration:**
- **Cleaner code**: Environment variables and aliases are clearly separated from complex logic
- **Cross-shell support**: Same declarations work for zsh, bash, and powershell
- **Performance**: Declarative configs generate optimal shell syntax
- **Maintainability**: Easy to see all environment variables and aliases at a glance
- **Type safety**: Environment variable names and values are validated

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
    c.zsh({
      // Use declarative configuration for environment variables
      environment: {
        'TOOL_FEATURE_ENABLED': '1'
      }
    });
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