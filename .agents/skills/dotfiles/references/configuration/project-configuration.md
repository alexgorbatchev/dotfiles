---
title: Project Configuration
sidebar:
  order: 1
---

# Project Configuration

The project configuration file defines paths, features, and API settings for your dotfiles system.

## Basic Configuration

```typescript
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(() => ({
  paths: {
    dotfilesDir: "~/.dotfiles",
    toolConfigsDir: "~/.dotfiles/tools",
    generatedDir: "~/.dotfiles/.generated",
    targetDir: "~/.local/bin",
  },
}));
```

## defineConfig Options

### Async Configuration

```typescript
export default defineConfig(async () => {
  const token = await loadTokenFromVault();
  return {
    paths: { dotfilesDir: "~/.dotfiles" },
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

Default values shown.

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
    targetDir: "~/.local/bin",
  },
  platform: [
    {
      match: [{ platform: "darwin", arch: "arm64" }],
      config: {
        paths: { targetDir: "/opt/homebrew/bin" },
      },
    },
  ],
}));
```

## CLI Usage

```bash
dotfiles --config ~/.dotfiles/dotfiles.config.ts install
dotfiles install  # Uses dotfiles.config.ts in current directory
```

## Directory Structure

```
~/.dotfiles/
├── dotfiles.config.ts     # Project configuration
├── tools/                 # Tool definitions (*.tool.ts)
├── CATALOG.md            # Auto-generated
└── .generated/           # Not version controlled
    ├── bin/              # Shims
    ├── shell-scripts/    # Shell init scripts
    └── binaries/         # Downloaded binaries
```

## Complete Reference

The generator can be customized via a `dotfiles.config.ts` file located in your dotfiles directory (e.g., `~/.dotfiles/dotfiles.config.ts`). The following is a reference for all available options.

```typescript
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(() => ({
  // Path to the user's config file.
  // (string, default: ~/.dotfiles/dotfiles.config.ts)
  userConfigPath: "~/.dotfiles/dotfiles.config.ts",

  // ---------------------------------------------------------------------------
  // File System Paths
  // ---------------------------------------------------------------------------
  paths: {
    // Root directory of the dotfiles repository. You SHOULD set this value.
    // (string, default: ~/.dotfiles)
    dotfilesDir: "~/.dotfiles",
    // Target directory for executable shims. This directory MUST be in your shell's $PATH.
    // (string, default: /usr/local/bin)
    targetDir: "/usr/local/bin",
    // The user's home directory.
    // (string, default: value of $HOME)
    homeDir: "~",
    // Directory where all generated files will be stored.
    // (string, default: ~/.dotfiles/.generated)
    generatedDir: "~/.dotfiles/.generated",
    // Directory containing *.tool.ts tool configuration files.
    // (string, default: ~/.dotfiles/tools)
    toolConfigsDir: "~/.dotfiles/tools",
    // Directory where generated shell scripts are stored.
    // (string, default: ~/.dotfiles/.generated/shell-scripts)
    shellScriptsDir: "~/.dotfiles/.generated/shell-scripts",
    // Directory where downloaded tool binaries are stored.
    // (string, default: ~/.dotfiles/.generated/binaries)
    binariesDir: "~/.dotfiles/.generated/binaries",
  },

  // ---------------------------------------------------------------------------
  // System Settings
  // ---------------------------------------------------------------------------
  system: {
    // Custom prompt message to display when sudo is required.
    // (string, default: "Please enter your password to continue:")
    sudoPrompt: "Please enter your password to continue:",
  },

  // ---------------------------------------------------------------------------
  // Logging Configuration
  // ---------------------------------------------------------------------------
  logging: {
    // Controls debug logging output. Set to "*" to enable all debug logs.
    // (string, default: "")
    debug: "",
  },

  // ---------------------------------------------------------------------------
  // Automatic Updates
  // ---------------------------------------------------------------------------
  updates: {
    // If true, automatically check for tool updates on certain runs.
    // (boolean, default: true)
    checkOnRun: true,
    // Interval in seconds between automatic update checks.
    // (number, default: 86400, i.e., 24 hours)
    checkInterval: 86400,
  },

  // ---------------------------------------------------------------------------
  // Features Configuration
  // ---------------------------------------------------------------------------
  features: {
    // Configuration for the tool catalog generation.
    catalog: {
      // If true, generate a markdown catalog of all tools.
      // (boolean, default: true)
      generate: true,
      // Path where the catalog file will be generated.
      // (string, default: {paths.dotfilesDir}/CATALOG.md)
      filePath: "{paths.dotfilesDir}/CATALOG.md",
    },

    // Configuration for shell initialization.
    // Controls where the shell initialization scripts are sourced.
    shellInstall: {
      // Path to zsh configuration file (e.g., ~/.zshrc).
      // If not provided, zsh initialization will be skipped.
      zsh: "~/.zshrc",
      // Path to bash configuration file (e.g., ~/.bashrc).
      // If not provided, bash initialization will be skipped.
      bash: "~/.bashrc",
      // Path to powershell configuration file (e.g., ~/.config/powershell/profile.ps1).
      // If not provided, powershell initialization will be skipped.
      powershell: "~/.config/powershell/profile.ps1",
    },
  },

  // ---------------------------------------------------------------------------
  // API and Service Configurations
  // ---------------------------------------------------------------------------
  github: {
    // GitHub API host.
    // (string, default: "https://api.github.com")
    host: "https://api.github.com",
    // GitHub API token. Can be set via GITHUB_TOKEN environment variable.
    // (string, optional)
    token: "",
    // User-Agent for GitHub API requests.
    // (string, default: "dotfiles-generator")
    userAgent: "dotfiles-generator",
    // Caching for GitHub API requests.
    cache: {
      enabled: true,
      ttl: 86400000, // 24 hours in ms
    },
  },

  cargo: {
    // User-Agent for Cargo-related requests.
    userAgent: "dotfiles-generator",
    // Configuration for the crates.io API.
    cratesIo: {
      host: "https://crates.io",
      cache: {
        enabled: true,
        ttl: 86400000,
      },
    },
    // Configuration for accessing raw files on GitHub (e.g., Cargo.toml).
    githubRaw: {
      host: "https://raw.githubusercontent.com",
      cache: {
        enabled: true,
        ttl: 86400000,
      },
    },
    // Configuration for accessing GitHub releases.
    githubRelease: {
      host: "https://github.com",
      cache: {
        enabled: true,
        ttl: 86400000,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Downloader Settings
  // ---------------------------------------------------------------------------
  downloader: {
    // Timeout in milliseconds for download operations.
    // (number, default: 300000, i.e., 5 minutes)
    timeout: 300000,
    // Number of retry attempts for failed downloads.
    // (number, default: 3)
    retryCount: 3,
    // Delay in milliseconds between download retry attempts.
    // (number, default: 1000)
    retryDelay: 1000,
    // Caching for downloaded files.
    cache: {
      enabled: true,
      ttl: 86400000, // 24 hours in ms
    },
  },

  // ---------------------------------------------------------------------------
  // Platform-Specific Overrides
  // ---------------------------------------------------------------------------
  platform: [
    {
      // An array of platform/architecture matchers.
      match: [{ os: "macos", arch: "arm64" }],
      // The configuration overrides for this platform/architecture combination.
      // You can override any of the settings defined above.
      config: {
        paths: {
          dotfilesDir: "~/macos-dotfiles",
        },
      },
    },
  ],
}));
```
