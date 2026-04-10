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
