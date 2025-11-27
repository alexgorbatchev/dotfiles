# Project Configuration

The project configuration file defines the core settings for your dotfiles system, including directory paths, tool discovery locations, and optional features. This is separate from individual tool configurations (defined with `defineTool`).

## Configuration File Formats

You can define your project configuration in one of two formats:

### TypeScript Format (.config.ts)

Recommended for dynamic configuration and full type safety:

```typescript
import { defineConfig } from '@gitea/dotfiles';

export default defineConfig(() => ({
  paths: {
    dotfilesDir: '~/.dotfiles',
    toolConfigsDir: '~/.dotfiles/tools',
    generatedDir: '~/.dotfiles/.generated',
    targetDir: '~/.local/bin',
  },
  features: {
    catalog: {
      generate: true,
      filePath: '~/.dotfiles/CATALOG.md',
    },
  },
}));
```

### YAML Format (config.yaml)

For simpler, declarative configuration:

```yaml
paths:
  dotfilesDir: ~/.dotfiles
  toolConfigsDir: ~/.dotfiles/tools
  generatedDir: ~/.dotfiles/.generated
  targetDir: ~/.local/bin

features:
  catalog:
    generate: true
    filePath: ~/.dotfiles/CATALOG.md
```

## defineConfig Helper

The `defineConfig` function provides type safety and support for both synchronous and asynchronous configuration.

### Synchronous Configuration

```typescript
import { defineConfig } from '@gitea/dotfiles';

export default defineConfig(() => ({
  paths: {
    dotfilesDir: '~/.dotfiles',
    targetDir: '~/.local/bin',
  },
}));
```

### Asynchronous Configuration

```typescript
import { defineConfig } from '@gitea/dotfiles';

export default defineConfig(async () => {
  const token = await loadTokenFromVault();
  
  return {
    paths: {
      dotfilesDir: '~/.dotfiles',
      targetDir: '~/.local/bin',
    },
    github: {
      token,
    },
  };
});
```

### Mixed Configuration

Combine multiple configuration sources:

```typescript
import { defineConfig } from '@gitea/dotfiles';
import * as fs from 'node:fs/promises';

export default defineConfig(async () => {
  const envToken = process.env.GITHUB_TOKEN;
  const configToken = await fs
    .readFile('~/.github-token', 'utf-8')
    .catch(() => undefined);

  return {
    paths: {
      dotfilesDir: process.env.DOTFILES_DIR || '~/.dotfiles',
      targetDir: process.env.TARGET_DIR || '~/.local/bin',
    },
    github: {
      token: envToken || configToken,
    },
  };
});
```

## Configuration Sections

### Paths

Controls where tools and generated files are located.

```typescript
paths: {
  // User's home directory
  // Default: auto-detected from system
  homeDir: '/home/user',

  // Root dotfiles directory (project root)
  // Default: ${configFileDir} (same directory as config file)
  dotfilesDir: '~/.dotfiles',

  // Directory containing *.tool.ts configuration files
  // Default: ${paths.dotfilesDir}/tools
  toolConfigsDir: '~/.dotfiles/tools',

  // Directory where generated files are stored
  // Default: ${paths.dotfilesDir}/.generated
  generatedDir: '~/.dotfiles/.generated',

  // Directory where executable shims are placed (must be in PATH)
  // Default: ${paths.generatedDir}/bin
  targetDir: '~/.local/bin',

  // Directory for generated shell initialization scripts
  // Default: ${paths.generatedDir}/shell-init
  shellScriptsDir: '~/.dotfiles/.generated/shell-init',

  // Directory for tool binaries
  // Default: ${paths.generatedDir}/bin
  binariesDir: '~/.dotfiles/.generated/bin',
}
```

#### Variable Expansion

Paths support variable expansion with several special variables:

```typescript
paths: {
  // Use ${configFileDir} to reference the directory containing the config file
  generatedDir: '${configFileDir}/.generated',

  // Reference other path variables
  targetDir: '${paths.generatedDir}/bin',
  
  // Use environment variables
  dotfilesDir: '${DOTFILES_PATH}',
  
  // Use home directory shorthand
  homeDir: '~/custom-home',
}
```

#### Platform-Specific Paths

Define different paths for different platforms:

```typescript
export default defineConfig(() => ({
  paths: {
    dotfilesDir: '~/.dotfiles',
    targetDir: '~/.local/bin',
  },
  // Platform-specific overrides
  platform: [
    {
      match: [{ platform: 'windows' }],
      config: {
        paths: {
          targetDir: 'C:\\Users\\user\\AppData\\Local\\bin',
        },
      },
    },
    {
      match: [{ platform: 'darwin', arch: 'arm64' }],
      config: {
        paths: {
          targetDir: '/opt/homebrew/bin',
        },
      },
    },
  ],
}));
```

### Features

Optional features that can be enabled or configured.

#### Catalog

Auto-generates a markdown file listing all managed tools:

```typescript
features: {
  catalog: {
    // Enable catalog generation
    // Default: true
    generate: true,

    // Where to write the catalog file
    // Default: ${paths.dotfilesDir}/CATALOG.md
    filePath: '~/.dotfiles/CATALOG.md',
  },
}
```

The generated catalog includes:
- Tool names and descriptions
- Installation methods
- Configuration status
- Available binaries per tool

### GitHub

Configuration for GitHub API access (required for GitHub releases):

```typescript
github: {
  // GitHub API host
  // Default: https://api.github.com
  host: 'https://api.github.com',

  // GitHub token for API access (optional, but recommended for rate limits)
  token: process.env.GITHUB_TOKEN,

  // Custom user-agent string
  // Default: dotfiles-installer/version
  userAgent: 'MyApp/1.0',

  // API response caching
  cache: {
    enabled: true,
    ttl: 3600, // seconds
  },
}
```

### Cargo

Configuration for Rust Crates.io registry:

```typescript
cargo: {
  cratesIo: {
    host: 'https://crates.io',
    token: process.env.CARGO_TOKEN,
    userAgent: 'MyApp/1.0',
    cache: {
      enabled: true,
      ttl: 3600,
    },
  },
  // For GitHub-hosted Rust binaries
  githubRaw: {
    host: 'https://raw.githubusercontent.com',
    cache: {
      enabled: true,
      ttl: 3600,
    },
  },
}
```

### System

System-level configuration:

```typescript
system: {
  // Prompt text for sudo operations
  // Default: '[sudo] password for user: '
  sudoPrompt: '[sudo] password: ',
}
```

### Logging

Logging configuration:

```typescript
logging: {
  // Debug output directory (optional)
  debug: '~/.dotfiles/.debug',
}
```

### Updates

Automatic update checking:

```typescript
updates: {
  // Check for tool updates on each run
  // Default: false
  checkOnRun: false,

  // How often to check for updates (seconds)
  // Default: 604800 (7 days)
  checkInterval: 604800,
}
```

### Downloader

Configuration for file downloads:

```typescript
downloader: {
  // Connection retry configuration
  retryAttempts: 3,
  retryDelay: 1000, // milliseconds

  // Download caching
  cache: {
    enabled: true,
    ttl: 2592000, // 30 days in seconds
  },
}
```

## Complete Example

Here's a complete configuration with multiple sections:

```typescript
import { defineConfig } from '@gitea/dotfiles';

export default defineConfig(async () => {
  const githubToken = process.env.GITHUB_TOKEN;

  return {
    paths: {
      dotfilesDir: '~/.dotfiles',
      toolConfigsDir: '~/.dotfiles/tools',
      generatedDir: '~/.dotfiles/.generated',
      targetDir: '~/.local/bin',
      shellScriptsDir: '~/.dotfiles/.generated/shell',
    },

    features: {
      catalog: {
        generate: true,
        filePath: '~/.dotfiles/CATALOG.md',
      },
    },

    github: {
      host: 'https://api.github.com',
      token: githubToken,
      cache: {
        enabled: true,
        ttl: 3600,
      },
    },

    system: {
      sudoPrompt: '[sudo] password: ',
    },

    updates: {
      checkOnRun: false,
      checkInterval: 604800,
    },

    downloader: {
      retryAttempts: 3,
      cache: {
        enabled: true,
        ttl: 2592000,
      },
    },

    // Platform-specific overrides
    platform: [
      {
        match: [{ platform: 'windows' }],
        config: {
          paths: {
            targetDir: 'C:\\Users\\user\\AppData\\Local\\bin',
          },
        },
      },
      {
        match: [{ platform: 'darwin' }],
        config: {
          paths: {
            targetDir: '/usr/local/bin',
          },
        },
      },
    ],
  };
});
```

## Directory Structure

Your dotfiles project should have this structure:

```
~/.dotfiles/
├── config.ts                 # Project configuration
├── tools/                    # Tool definitions
│   ├── fzf.tool.ts
│   ├── ripgrep.tool.ts
│   └── neovim.tool.ts
├── CATALOG.md               # Auto-generated tool catalog
└── .generated/              # Generated files (not version controlled)
    ├── bin/                 # Tool shims
    ├── shell-init/          # Shell initialization scripts
    └── binaries/            # Downloaded tool binaries
```

## Loading Configuration

When running the CLI, you can specify your config file:

```bash
# Use TypeScript config (recommended)
dotfiles --config ~/.dotfiles/config.ts install

# Use YAML config
dotfiles --config ~/.dotfiles/config.yaml install

# Default: looks for config.ts or config.yaml in current directory
dotfiles install
```

## Programmatic Usage

Load configuration in your code:

```typescript
import { loadConfig } from '@gitea/dotfiles';
import { createRealFileSystem } from '@dotfiles/file-system';
import { createLogger } from '@dotfiles/logger';

const config = await loadConfig(
  createLogger(),
  createRealFileSystem(),
  './config.ts',
  { platform: 'linux', arch: 'x64', homeDir: '/home/user' },
  process.env
);

console.log(config.paths.targetDir);
console.log(config.github.token);
```

## Best Practices

1. **Version Control**: Keep your `config.ts` in version control
2. **Secrets**: Use environment variables for sensitive values (tokens, passwords)
3. **Documentation**: Add comments explaining custom configuration
4. **Flexibility**: Use path variables to make config portable across machines
5. **Testing**: Test your configuration with different platforms if needed

## Next Steps

- [Getting Started](./getting-started.md) - Set up your first configuration
- [Tool Configuration](./getting-started.md#tool-configuration) - Create tool configurations
- [Context API](./context-api.md) - Use configuration paths in tools
