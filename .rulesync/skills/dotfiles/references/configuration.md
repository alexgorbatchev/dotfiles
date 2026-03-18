# Configuration

## Table of Contents

- [Getting Started](#getting-started)
  - [File Structure](#file-structure)
  - [Minimal Configuration](#minimal-configuration)
  - [Complete Example](#complete-example)
  - [Available Methods](#available-methods)
  - [TypeScript Setup](#typescript-setup)
- [Project Configuration](#project-configuration)
  - [Basic Configuration](#basic-configuration)
  - [defineConfig Options](#defineconfig-options)
  - [Configuration Reference](#configuration-reference)
  - [Platform Overrides](#platform-overrides)
  - [CLI Usage](#cli-usage)
  - [Directory Structure](#directory-structure)
- [Platform-Specific Configuration](#platform-specific-configuration)
  - [Platform and Architecture Enums](#platform-and-architecture-enums)
  - [Basic Usage](#basic-usage-1)
  - [With Architecture](#with-architecture)
  - [Platform Groups](#platform-groups)
  - [Platform-Specific Shell Config](#platform-specific-shell-config)
  - [Platform Detection in Hooks](#platform-detection-in-hooks)
  - [Common Asset Patterns](#common-asset-patterns)
- [Virtual Environments](#virtual-environments)
  - [Overview](#overview)
  - [Creating an Environment](#creating-an-environment)
  - [Activating an Environment](#activating-an-environment)
  - [Using an Activated Environment](#using-an-activated-environment)
  - [Adding Tools](#adding-tools)
  - [Deactivating](#deactivating)
  - [Deleting an Environment](#deleting-an-environment)
  - [Use Cases](#use-cases)
  - [XDG Configuration Isolation](#xdg-configuration-isolation)
  - [Generated Files](#generated-files)
- [Common Patterns](#common-patterns)
  - [GitHub Tool with Shell Integration](#github-tool-with-shell-integration)
  - [Tool Dependencies](#tool-dependencies)
  - [Complex Shell Integration](#complex-shell-integration)
  - [Cross-Shell Configuration](#cross-shell-configuration)
  - [With Hooks](#with-hooks)
  - [Platform-Specific Installation](#platform-specific-installation)
  - [Cargo (Rust) Tool](#cargo-rust-tool)
  - [Manual Script](#manual-script)
  - [Configuration-Only (No Binary)](#configuration-only-no-binary)
  - [Custom Asset Selection](#custom-asset-selection)
  - [Installation Method Quick Reference](#installation-method-quick-reference)
- [Advanced Topics](#advanced-topics)
  - [Custom Asset Selection](#custom-asset-selection-1)
  - [Dynamic Configuration](#dynamic-configuration)
  - [Conditional Installation](#conditional-installation)
  - [Build from Source](#build-from-source)
  - [Dependency Verification](#dependency-verification)
  - [Lazy Loading](#lazy-loading)
  - [Dynamic Completions](#dynamic-completions)
  - [Parallel Setup Tasks](#parallel-setup-tasks)
- [Troubleshooting](#troubleshooting)
  - [Enable Debug Logging](#enable-debug-logging)
  - [Common Issues](#common-issues)
  - [Testing and Verification](#testing-and-verification)

---

# Getting Started

This guide covers how to create `.tool.ts` configuration files for your CLI tools.

## Prerequisites

Set up your project configuration first. See Project Configuration for instructions.

## File Structure

Tool configurations are placed in your `toolConfigsDir` (default: `~/.dotfiles/tools`):

```
tools/
├── fzf.tool.ts
├── ripgrep.tool.ts
└── dev/
    ├── node.tool.ts
    └── rust.tool.ts
```

Files must be named `{tool-name}.tool.ts` and export a default using `defineTool`.

## Minimal Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  }).bin('fzf')
);
```

## Complete Example

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  })
    .bin('rg')
    .dependsOn('pcre2')
    .symlink('./ripgreprc', '~/.ripgreprc')
    .zsh((shell) => shell.env({ RIPGREP_CONFIG_PATH: '~/.ripgreprc' }).aliases({ rgi: 'rg -i' }))
);
```

## Available Methods

After calling `install()`, these methods are available:

| Method                   | Purpose                               |
| ------------------------ | ------------------------------------- |
| `.bin(name)`             | Define binary name(s) to expose       |
| `.version(v)`            | Set version (`'latest'` or specific)  |
| `.dependsOn(bin)`        | Declare binary dependencies           |
| `.symlink(src, dest)`    | Create config file symlinks           |
| `.hook(event, fn)`       | Lifecycle hooks                       |
| `.zsh(fn)` / `.bash(fn)` | Shell-specific configuration          |
| `.platform(p, fn)`       | Platform-specific overrides           |
| `.disable()`             | Skip tool during generation           |
| `.hostname(pattern)`     | Restrict tool to specific hostname(s) |

## TypeScript Setup

### Imports

```typescript
import { Architecture, defineTool, Platform } from '@gitea/dotfiles';
```

| Export         | Description                                    |
| -------------- | ---------------------------------------------- |
| `defineTool`   | Factory function to create tool configurations |
| `Platform`     | Enum: `Darwin`, `Linux`, `Windows`, `MacOS`    |
| `Architecture` | Enum: `X86_64`, `Arm64`                        |

### Configuration-Only Tools

Tools that only contribute shell configuration (no binary installation):

```typescript
export default defineTool((install) => install().zsh((shell) => shell.env({ FOO: 'bar' })));
```

### Orphaned Artifact Cleanup

When a `.tool.ts` configuration file is removed, `dotfiles generate` automatically cleans up the corresponding generated shims and completions on the next run. No manual cleanup is needed.

### Auto-Generated Types

Running `dotfiles generate` creates `.generated/tool-types.d.ts` with type-safe `dependsOn()` autocomplete for all your tool binaries.

Add to your `tsconfig.json`:

```json
{
  "include": ["tools/**/*.tool.ts", ".generated/tool-types.d.ts"]
}
```

### Common Type Errors

```typescript
// ❌ Missing required parameter
install('github-release', {})  // Error: 'repo' is required

// ❌ Invalid parameter for method
install('brew', { repo: 'owner/tool' })  // Error: 'repo' not valid for brew

// ❌ String instead of enum
.platform('macos', ...)  // Error: use Platform.MacOS
```

---

# Project Configuration

The project configuration file defines paths, features, and API settings for your dotfiles system.

## Basic Configuration

```typescript
import { defineConfig } from '@gitea/dotfiles';

export default defineConfig(() => ({
  paths: {
    dotfilesDir: '~/.dotfiles',
    toolConfigsDir: '~/.dotfiles/tools',
    generatedDir: '~/.dotfiles/.generated',
    targetDir: '~/.local/bin',
  },
}));
```

## defineConfig Options

### Async Configuration

```typescript
export default defineConfig(async () => {
  const token = await loadTokenFromVault();
  return {
    paths: { dotfilesDir: '~/.dotfiles' },
    github: { token },
  };
});
```

### Context-Aware Configuration

```typescript
export default defineConfig(({ configFileDir, systemInfo }) => ({
  paths: {
    generatedDir: `${configFileDir}/.generated`,
  },
}));
```

## Configuration Reference

### paths

```typescript
paths: {
  homeDir: '~',                                    // User's home directory
  dotfilesDir: '~/.dotfiles',                      // Root dotfiles directory
  toolConfigsDir: '~/.dotfiles/tools',             // Directory with *.tool.ts files
  generatedDir: '~/.dotfiles/.generated',          // Generated files directory
  targetDir: '/usr/local/bin',                     // Shim directory (must be in PATH)
  shellScriptsDir: '~/.dotfiles/.generated/shell-scripts',
  binariesDir: '~/.dotfiles/.generated/binaries',
}
```

### features

#### Catalog

Auto-generates a markdown file listing all managed tools:

```typescript
features: {
  catalog: {
    generate: true,                                // Enable catalog generation
    filePath: '~/.dotfiles/CATALOG.md',            // Output location
  },
}
```

The generated catalog includes tool names, installation methods, and available binaries.

#### Shell Installation

Automatically adds sourcing to your shell configuration:

```typescript
features: {
  shellInstall: {
    zsh: '~/.zshrc',                               // Path to zsh config
    bash: '~/.bashrc',                             // Path to bash config
    powershell: '~/.config/powershell/profile.ps1', // Path to PowerShell config
  },
}
```

If a shell path is not provided, initialization for that shell is skipped.

### github

```typescript
github: {
  host: 'https://api.github.com',
  token: process.env.GITHUB_TOKEN,                 // Recommended for rate limits
  userAgent: 'dotfiles-generator',
  cache: {
    enabled: true,
    ttl: 86400000,                                 // 24 hours in ms
  },
}
```

### proxy

HTTP caching proxy to prevent API rate limiting during development:

```typescript
proxy: {
  enabled: false,                                  // Enable proxy server
  port: 3128,                                      // Proxy server port
  cacheDir: '{paths.generatedDir}/.http-proxy-cache', // Cache directory
  ttl: 86400000,                                   // Cache TTL (24 hours)
}
```

When enabled, the proxy ignores server cache headers, ensuring responses are always cached for the configured TTL. Use the proxy to avoid rate limits when frequently testing tool installations.

#### Endpoints

- `POST /cache/clear` - Clear cache entries by glob pattern (use `*` to clear all)
- `POST /cache/populate` - Pre-populate cache entries
- `GET /cache/stats` - Get cache statistics

#### Standalone Usage

The proxy can also be run standalone without enabling it in the config:

```bash
bun run packages/http-proxy/src/server.ts --port=3128 --cache-dir=.tmp/cache
```

### system

```typescript
system: {
  sudoPrompt: 'Please enter your password to continue:',
}
```

### updates

```typescript
updates: {
  checkOnRun: true,                                // Check for updates on each run
  checkInterval: 86400,                            // Seconds between checks (24 hours)
}
```

## Platform Overrides

```typescript
export default defineConfig(() => ({
  paths: {
    targetDir: '~/.local/bin',
  },
  platform: [
    {
      match: [{ platform: 'darwin', arch: 'arm64' }],
      config: {
        paths: { targetDir: '/opt/homebrew/bin' },
      },
    },
  ],
}));
```

## CLI Usage

```bash
dotfiles --config ~/.dotfiles/config.ts install
dotfiles install  # Uses config.ts in current directory
```

## Directory Structure

```
~/.dotfiles/
├── config.ts              # Project configuration
├── tools/                 # Tool definitions (*.tool.ts)
├── CATALOG.md            # Auto-generated
└── .generated/           # Not version controlled
    ├── bin/              # Shims
    ├── shell-scripts/    # Shell init scripts
    └── binaries/         # Downloaded binaries
```

---

# Platform-Specific Configuration

Use `.platform()` for cross-platform tool configurations.

## Platform and Architecture Enums

```typescript
import { Architecture, Platform } from '@gitea/dotfiles';

// Platforms (bitwise flags)
Platform.Linux; // 1
Platform.MacOS; // 2
Platform.Windows; // 4
Platform.Unix; // Linux | MacOS (3)
Platform.All; // All platforms (7)

// Architectures (bitwise flags)
Architecture.X86_64; // 1
Architecture.Arm64; // 2
Architecture.All; // Both (3)
```

## Basic Usage

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install) =>
  install()
    .bin('tool')
    .platform(Platform.MacOS, (install) => install('brew', { formula: 'tool' }))
    .platform(Platform.Linux, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      }))
    .platform(Platform.Windows, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*windows*.zip',
      }))
);
```

## With Architecture

```typescript
import { Architecture, defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install) =>
  install()
    .bin('tool')
    .platform(Platform.Linux, Architecture.X86_64, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux-amd64*.tar.gz',
      }))
    .platform(Platform.Linux, Architecture.Arm64, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux-arm64*.tar.gz',
      }))
    .platform(Platform.MacOS, Architecture.All, (install) => install('brew', { formula: 'tool' }))
);
```

## Platform Groups

Use `Platform.Unix` for shared Linux/macOS configuration:

```typescript
export default defineTool((install) =>
  install()
    .bin('tool')
    .platform(Platform.Unix, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*unix*.tar.gz',
      }))
    .platform(Platform.Windows, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*windows*.zip',
      }))
);
```

## Platform-Specific Shell Config

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.Unix, (install) =>
      install().zsh((shell) =>
        shell.env({
          TOOL_CONFIG: '~/.config/tool',
        })
      ))
    .platform(Platform.Windows, (install) =>
      install().powershell((shell) =>
        shell.env({
          TOOL_CONFIG: '~\\.config\\tool',
        })
      ))
);
```

## Platform Detection in Hooks

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ systemInfo, $ }) => {
      if (systemInfo.platform === 'darwin') {
        await $`./setup-macos.sh`;
      } else if (systemInfo.platform === 'linux') {
        await $`./setup-linux.sh`;
      }

      if (systemInfo.arch === 'arm64') {
        await $`./configure-arm64.sh`;
      }
    })
);
```

## Common Asset Patterns

| Platform | Pattern Examples                               |
| -------- | ---------------------------------------------- |
| macOS    | `*darwin*.tar.gz`, `*macos*.zip`               |
| Linux    | `*linux*.tar.gz`, `*x86_64-unknown-linux-gnu*` |
| Windows  | `*windows*.zip`, `*pc-windows-msvc*`           |
| x86_64   | `*amd64*`, `*x86_64*`                          |
| ARM64    | `*arm64*`, `*aarch64*`                         |

---

# Virtual Environments

Virtual environments allow you to create isolated dotfiles configurations for different projects, similar to Python's `venv`, `pyenv`, or Hermit.

## Overview

Instead of a single global dotfiles configuration, you can create project-specific environments with their own:

- Tool configurations
- Generated shell scripts
- Installed binaries
- XDG configuration files

## Creating an Environment

```bash
# Create with default name 'env' in current directory
dotfiles env create

# Create with custom name
dotfiles env create my-env

# Create at absolute path
dotfiles env create /path/to/project/.devenv
```

This creates:

```
env/
├── source       # POSIX shell activation script
├── source.ps1   # PowerShell activation script
├── config.ts    # Dotfiles configuration
├── .config/     # XDG_CONFIG_HOME for tool configs
└── tools/       # Tool configuration directory
```

## Activating an Environment

**Bash/Zsh:**

```bash
source env/source
```

**PowerShell:**

```powershell
. .\env\source.ps1
```

When activated, the following environment variables are set:

| Variable            | Value                                |
| ------------------- | ------------------------------------ |
| `DOTFILES_ENV_DIR`  | Absolute path to environment         |
| `DOTFILES_ENV_NAME` | Environment directory name           |
| `XDG_CONFIG_HOME`   | `$DOTFILES_ENV_DIR/.config`          |
| `PATH`              | Prepended with environment's bin dir |

## Using an Activated Environment

Once activated, all dotfiles commands use the environment's configuration automatically:

```bash
source env/source

# These all use env/config.ts automatically
dotfiles generate
dotfiles install
dotfiles update fd
```

No need to pass `--config` - the CLI detects `DOTFILES_ENV_DIR` and uses its `config.ts`.

## Adding Tools

Create tool configuration files in the `tools/` directory:

```bash
source env/source

cat > env/tools/fd.tool.ts << 'EOF'
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'sharkdp/fd' })
    .bin('fd')
);
EOF

dotfiles generate
dotfiles install fd
```

## Deactivating

```bash
dotfiles-deactivate
```

This restores the previous `PATH` and `XDG_CONFIG_HOME` values.

## Deleting an Environment

```bash
# Delete default 'env' directory
dotfiles env delete

# Delete specific environment
dotfiles env delete my-env

# Force delete without confirmation
dotfiles env delete --force
```

## Use Cases

### Project-Specific Tools

Keep project tools isolated from your global configuration:

```bash
cd ~/projects/data-science
dotfiles env create
source env/source

# Add project-specific tools
cat > env/tools/jupyter.tool.ts << 'EOF'
import { defineTool } from '@gitea/dotfiles';
export default defineTool((install) =>
  install('manual').bin('jupyter')
    .zsh((shell) => shell.aliases({
      jn: 'jupyter notebook',
      jl: 'jupyter lab'
    }))
);
EOF

dotfiles generate
```

### Team Environments

Share tool configurations with your team:

```bash
cd ~/work/team-project
dotfiles env create .devenv

# Configure shared tools
# ...

# Add to version control
echo ".devenv/.generated" >> .gitignore
git add .devenv/config.ts .devenv/tools/ .devenv/source .devenv/source.ps1
git commit -m "Add development environment"
```

Team members then run:

```bash
git clone <repo>
cd team-project
source .devenv/source
dotfiles install
```

### Multiple Environments

Different projects can have different tool versions:

```bash
# Project A uses older tools
cd ~/projects/legacy
dotfiles env create
source env/source
# Configure tools...

# Project B uses latest
cd ~/projects/modern
dotfiles env create
source env/source
# Configure different versions...
```

## XDG Configuration Isolation

The environment sets `XDG_CONFIG_HOME` to isolate tool configuration files:

```bash
source env/source
echo $XDG_CONFIG_HOME
# /path/to/env/.config

# Tools that respect XDG will store config here
# e.g., ~/.config/nvim becomes env/.config/nvim
```

This prevents activated environments from affecting global tool configurations.

## Generated Files

After running `dotfiles generate`, the environment contains:

```
env/
├── .generated/
│   ├── shell-scripts/
│   │   ├── main.zsh
│   │   ├── main.bash
│   │   └── main.ps1
│   ├── user-bin/
│   │   └── <tool shims>
│   └── binaries/
│       └── <installed tools>
├── source
├── source.ps1
├── config.ts
├── .config/
└── tools/
```

The activation script sources the generated shell scripts and adds `user-bin` to PATH.

---

# Common Patterns

Real-world examples for common tool configuration scenarios.

## GitHub Tool with Shell Integration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'BurntSushi/ripgrep' })
    .bin('rg')
    .zsh((shell) => shell.completions('complete/_rg').aliases({ rg: 'ripgrep' }))
    .bash((shell) => shell.completions('complete/rg.bash'))
);
```

## Tool Dependencies

Use `.dependsOn()` when a tool needs other binaries to exist first:

```typescript
// provider.tool.ts
export default defineTool((install) => install('manual', { binaryPath: './bin/provider' }).bin('provider'));

// consumer.tool.ts
export default defineTool((install) =>
  install('github-release', { repo: 'owner/consumer' }).bin('consumer').dependsOn('provider')
);
```

## Complex Shell Integration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'junegunn/fzf' })
    .bin('fzf')
    .zsh((shell) =>
      shell.env({ FZF_DEFAULT_OPTS: '--color=fg+:cyan' }).completions('shell/completion.zsh').always(/* zsh */ `
          if [[ -f "${ctx.currentDir}/shell/key-bindings.zsh" ]]; then
            source "${ctx.currentDir}/shell/key-bindings.zsh"
          fi
        `)
    )
);
```

## Cross-Shell Configuration

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.completions('completions/_tool').env({ TOOL_CONFIG: '~/.config/tool' }).aliases({ t: 'tool' })
    )
    .bash((shell) =>
      shell.completions('completions/tool.bash').env({ TOOL_CONFIG: '~/.config/tool' }).aliases({ t: 'tool' })
    )
);
```

## With Hooks

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .symlink('./config.yml', '~/.config/tool/config.yml')
    .hook('after-install', async ({ installedDir, fileSystem, $ }) => {
      await $`${installedDir}/tool init`;
    })
);
```

## Platform-Specific Installation

```typescript
import { Architecture, defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.MacOS, (installMac) => installMac('brew', { formula: 'tool' }))
    .platform(Platform.Linux, (installLinux) =>
      installLinux('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      }))
    .platform(Platform.Windows, Architecture.Arm64, (installWin) =>
      installWin('github-release', {
        repo: 'owner/tool',
        assetPattern: '*windows-arm64.zip',
      }))
);
```

## Cargo (Rust) Tool

```typescript
export default defineTool((install) =>
  install('cargo', {
    crateName: 'eza',
    githubRepo: 'eza-community/eza',
  })
    .bin('eza')
    .zsh((shell) => shell.completions('completions/eza.zsh').aliases({ ls: 'eza', ll: 'eza -l', la: 'eza -la' }))
);
```

## Manual Script

```typescript
export default defineTool((install) =>
  install('manual', { binaryPath: './scripts/deploy.sh' })
    .bin('deploy')
    .symlink('./deploy.config.yaml', '~/.config/deploy/config.yaml')
    .zsh((shell) =>
      shell.aliases({
        dp: 'deploy',
        'deploy-prod': 'deploy --env production',
      })
    )
);
```

## Configuration-Only (No Binary)

```typescript
export default defineTool((install) =>
  install()
    .symlink('./gitconfig', '~/.gitconfig')
    .zsh((shell) => shell.aliases({ g: 'git', gs: 'git status', ga: 'git add' }).env({ GIT_EDITOR: 'nvim' }))
);
```

## Custom Asset Selection

```typescript
export default defineTool((install) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: ({ assets, systemInfo }) => {
      const platformMap: Record<string, string> = { darwin: 'macos', linux: 'linux' };
      const archMap: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };
      const platform = platformMap[systemInfo.platform];
      const arch = archMap[systemInfo.arch];
      return assets.find((a) => a.name.includes(platform) && a.name.includes(arch) && a.name.endsWith('.tar.gz'));
    },
  }).bin('tool')
);
```

## Installation Method Quick Reference

| Use Case          | Method           | Example Tools      |
| ----------------- | ---------------- | ------------------ |
| GitHub releases   | `github-release` | fzf, ripgrep, bat  |
| Gitea/Forgejo     | `gitea-release`  | Codeberg tools     |
| Homebrew          | `brew`           | git, jq            |
| Rust crates       | `cargo`          | eza, fd, ripgrep   |
| npm packages      | `npm`            | prettier, eslint   |
| Custom scripts    | `manual`         | deployment scripts |
| Shell config only | `install()`      | aliases, env vars  |
| Installer scripts | `curl-script`    | rustup, nvm        |
| Direct binaries   | `curl-binary`    | single-file tools  |

---

# Advanced Topics

Advanced configuration patterns for complex setups.

## Custom Asset Selection

For non-standard release naming, use `assetSelector`:

```typescript
export default defineTool((install) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: ({ assets, systemInfo, release, log }) => {
      const osMap: Record<string, string> = { darwin: 'macos', linux: 'linux' };
      const archMap: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };

      return assets.find(
        (a) =>
          a.name.includes(osMap[systemInfo.platform]) &&
          a.name.includes(archMap[systemInfo.arch]) &&
          a.name.endsWith('.tar.gz'),
      );
    },
  }).bin('tool')
);
```

## Dynamic Configuration

Use environment variables for runtime configuration:

```typescript
const isDev = process.env.NODE_ENV === 'development';

export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version(isDev ? 'latest' : 'v1.2.3')
    .zsh((shell) => shell.env({ TOOL_LOG_LEVEL: isDev ? 'debug' : 'info' }))
);
```

## Conditional Installation

Choose methods based on system capabilities:

```typescript
export default defineTool((install) => {
  if (process.platform === 'darwin' && process.env.HOMEBREW_PREFIX) {
    return install('brew', { formula: 'tool' }).bin('tool');
  }
  return install('github-release', { repo: 'owner/tool' }).bin('tool');
});
```

## Build from Source

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-extract', async ({ extractDir, stagingDir, $ }) => {
      if (extractDir && stagingDir) {
        await $`cd ${extractDir} && ./configure --prefix=${stagingDir}`;
        await $`cd ${extractDir} && make -j$(nproc)`;
        await $`cd ${extractDir} && make install`;
      }
    })
);
```

## Dependency Verification

Combine `.dependsOn()` with hooks for version checks:

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .dependsOn('node')
    .hook('before-install', async ({ log, $ }) => {
      const result = await $`node --version`.nothrow();
      if (result.exitCode !== 0) {
        throw new Error('Node is required but not available');
      }
      log.info(`Using Node ${result.stdout.toString().trim()}`);
    })
);
```

## Lazy Loading

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        function expensive-fn() {
          unfunction expensive-fn
          source "${ctx.currentDir}/expensive.zsh"
          expensive-fn "$@"
        }
      `)
    )
);
```

## Dynamic Completions

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .once(
          `
          tool completion zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
        `,
        )
        .completions(`${ctx.projectConfig.paths.generatedDir}/completions/_tool`)
    )
);
```

## Parallel Setup Tasks

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, log }) => {
      await Promise.all([$`tool setup-task-1`, $`tool setup-task-2`, $`tool setup-task-3`]);
      log.info('All setup tasks completed');
    })
);
```

---

# Troubleshooting

## Enable Debug Logging

```bash
dotfiles install tool-name --trace --log=verbose
```

## Common Issues

### Tool Not Found After Installation

1. Verify `.bin()` is called with correct binary names
2. Check shim exists: `ls -la ~/.generated/usr-local-bin/tool-name`
3. Ensure PATH includes generated bin directory

### Installation Fails

1. Check asset patterns match actual GitHub release assets
2. Verify repository name is correct
3. Use `--trace --log=verbose` to see detailed error messages

### Infinite Recursion Error

**Message**: "Recursive installation detected for [TOOL]. Aborting..."

The installer has built-in recursion guards. If you see this, check that your installation scripts don't call the tool being installed via its shim.

### Disable Shim Usage Tracking

Shim usage tracking is enabled by default and runs in the background.

- Disable temporarily for a single command:
  `DOTFILES_USAGE_TRACKING=0 rg --version`
- Disable for the current shell session:
  `export DOTFILES_USAGE_TRACKING=0`

### Dependency Errors

**Messages**: "Missing dependency", "Ambiguous dependency", "Circular dependency"

- Ensure every `.dependsOn()` references a binary from `.bin()` in exactly one tool
- Verify providers include active platform/architecture for platform-specific configs

### Shell Integration Not Working

1. Source shell scripts: `source ~/.generated/shell-scripts/main.zsh`
2. Check for syntax errors: `zsh -n ~/.generated/shell-scripts/main.zsh`
3. Use declarative `.env()` instead of inline exports

### Completions Not Loading

1. Check completion file exists in extracted archive
2. Reload completions: `autoload -U compinit && compinit`
3. Verify shell completion path is correct

### Hook Not Executing

```typescript
.hook('after-install', async ({ log, $ }) => {
  try {
    await $`./setup.sh`;
  } catch (error) {
    log.error('Setup failed');
    throw error;
  }
})
```

- `$` uses tool directory as cwd
- Always await `$` commands
- Handle errors with try/catch

## Testing and Verification

### Type Checking

```bash
bun typecheck
```

### Installation Commands

```bash
dotfiles install tool-name           # Install by tool name
dotfiles install binary-name         # Install by binary name
dotfiles install tool-name --force   # Force reinstall
dotfiles install tool-name --trace --log=verbose  # Debug logging
dotfiles files tool-name             # List generated files
dotfiles check-updates               # Check all for updates
```

### Verification Steps

1. **Binary works**: `tool-name --version`
2. **Shim created**: `ls -la ~/.generated/usr-local-bin/tool-name`
3. **Shell integration**: Source shell scripts and test aliases/environment
