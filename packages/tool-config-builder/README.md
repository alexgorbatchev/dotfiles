# @dotfiles/tool-config-builder

Fluent API builder for creating type-safe tool configurations. Provides a declarative interface for defining tool installation methods, binaries, versions, and platform-specific overrides.

## Overview

The tool-config-builder package provides a fluent builder pattern for constructing tool configurations. It offers type-safe methods for defining tool properties and installation parameters, making tool configuration files easier to write and maintain.

## Features

- **Fluent API**: Chainable methods for intuitive configuration
- **Type Safety**: Full TypeScript support with type inference
- **Platform Overrides**: Platform-specific configuration support
- **Validation**: Built-in validation using Zod schemas
- **Multiple Installation Methods**: Support for all installation methods
- **Binary Configuration**: Define single or multiple binaries per tool

## API

### `ToolConfigBuilder`

Main builder interface for creating tool configurations.

```typescript
interface IToolConfigBuilder {
  bin(name: string | string[]): this;
  version(version: string): this;
  install(method: InstallationMethod, params: InstallParams): this;
  platform(platform: Platform, callback: (builder: PlatformConfigBuilder) => void): this;
  zsh(callback: (shell: IShellConfigurator) => void): this;
  bash(callback: (shell: IShellConfigurator) => void): this;
  powershell(callback: (shell: IShellConfigurator) => void): this;
  disable(): this;
  build(): ToolConfig;
}
```

## Usage Examples

### Basic Tool Configuration

```typescript
import type { ToolConfigBuilder } from '@dotfiles/tool-config-builder';

export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('fzf')
    .version('latest')
    .install('github-release', {
      repo: 'junegunn/fzf',
      assetPattern: '*linux*amd64*.tar.gz',
    });
};
```

### Tool with Multiple Binaries

```typescript
export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin(['node', 'npm', 'npx'])
    .version('20.0.0')
    .install('curl-tar', {
      url: 'https://nodejs.org/dist/v20.0.0/node-v20.0.0-linux-x64.tar.xz',
    });
};
```

### Platform-Specific Configuration

```typescript
import { Platform } from '@dotfiles/schemas';

export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('ripgrep')
    .version('14.0.0')
    .install('github-release', {
      repo: 'BurntSushi/ripgrep',
      assetPattern: '*linux*amd64*.tar.gz',
    })
    .platform(Platform.MacOS, (p) => {
      p.install('github-release', {
        repo: 'BurntSushi/ripgrep',
        assetPattern: '*apple-darwin*.tar.gz',
      });
    })
    .platform(Platform.Windows, (p) => {
      p.install('github-release', {
        repo: 'BurntSushi/ripgrep',
        assetPattern: '*windows*.zip',
      });
    });
};
```

### Using Different Installation Methods

#### GitHub Release

```typescript
c.bin('bat')
  .version('latest')
  .install('github-release', {
    repo: 'sharkdp/bat',
    assetPattern: '*linux*amd64*.tar.gz',
  });
```

#### Homebrew

```typescript
c.bin('jq')
  .version('latest')
  .install('brew', {
    formula: 'jq',
  });
```

#### Cargo

```typescript
c.bin('eza')
  .version('latest')
  .install('cargo', {
    crateName: 'eza',
    binarySource: 'cargo-quickinstall',
    versionSource: 'cargo-toml',
    githubRepo: 'eza-community/eza',
  });
```

#### Curl Script

```typescript
c.bin(['rustup', 'cargo'])
  .version('latest')
  .install('curl-script', {
    url: 'https://sh.rustup.rs',
    shell: 'bash',
  });
```

#### Curl Tar

```typescript
c.bin('tool')
  .version('1.0.0')
  .install('curl-tar', {
    url: 'https://example.com/tool-1.0.0.tar.gz',
  });
```

#### Manual

```typescript
c.bin('system-tool')
  .install('manual', {
    binaryPath: '/usr/local/bin/system-tool',
  });
```

### Disabling a Tool

Use `.disable()` to temporarily skip a tool during generation. When a tool is disabled:
- A warning is logged indicating the tool is disabled
- Any previously generated artifacts (shims, symlinks, completions) are automatically removed
- Downloaded binaries are preserved for quick re-enablement

```typescript
c.bin('deprecated-tool')
  .version('1.0.0')
  .install('github-release', {
    repo: 'owner/deprecated-tool',
  })
  .disable(); // Tool will be skipped and its artifacts cleaned up
```

### With Hooks

```typescript
import path from 'path';

export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('bat')
    .version('latest')
    .install('github-release', {
      repo: 'sharkdp/bat',
      assetPattern: '*linux*amd64*.tar.gz',
    })
    .hook('after-extract', async (context) => {
      // Create config directory
      const configDir = path.join(context.stagingDir, 'config');
      await context.fileSystem.mkdir(configDir, { recursive: true });
      
      // Create default config
      const configPath = path.join(configDir, 'config');
      await context.fileSystem.writeFile(
        configPath,
        '--theme="Monokai Extended"\n--style="numbers,changes,header"\n'
      );
    });
};
```

### Custom Asset Selector

```typescript
export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('gh')
    .version('latest')
    .install('github-release', {
      repo: 'cli/cli',
      assetSelector: (assets, systemInfo) => {
        // Custom logic to select the right asset
        const platform = systemInfo.platform === 'darwin' ? 'macOS' : 'linux';
        const arch = systemInfo.arch === 'x86_64' ? 'amd64' : 'arm64';
        
        return assets.find(asset => 
          asset.name.includes(platform) && 
          asset.name.includes(arch) &&
          asset.name.endsWith('.tar.gz')
        );
      },
    });
};
```

## Builder Methods

### `bin(name: string | string[])`

Defines the binary name(s) for the tool.

```typescript
// Single binary
c.bin('fzf')

// Multiple binaries
c.bin(['node', 'npm', 'npx'])
```

### `version(version: string)`

Sets the tool version. Use `'latest'` for the latest version.

```typescript
c.version('14.0.0')
c.version('latest')
c.version('^1.0.0')  // Semver constraint
```

### `install(method: InstallationMethod, params: InstallParams)`

Defines the installation method and parameters.

```typescript
c.install('github-release', {
  repo: 'owner/repo',
  assetPattern: '*.tar.gz',
  // Regex string form is also supported, e.g. '/^tool-.*\\.tar\\.gz$/'
})

c.install('brew', {
  formula: 'formula-name',
})

c.install('cargo', {
  crateName: 'crate-name',
})
```

### `platform(platform: Platform, callback: (builder: PlatformConfigBuilder) => void)`

Adds platform-specific overrides.

```typescript
c.platform(Platform.MacOS, (p) => {
  p.version('1.0.1')  // Different version for macOS
    .install('brew', {
      formula: 'tool',
    });
})
```

### `build(): ToolConfig`

Builds and validates the final configuration.

```typescript
const config = c.bin('tool')
  .version('1.0.0')
  .install('github-release', { repo: 'owner/repo' })
  .build();
```

## Platform Configuration

### Supported Platforms

```typescript
enum Platform {
  Darwin = 'darwin',
  Linux = 'linux', 
  Windows = 'windows',
  MacOS = 'darwin',  // Alias for Darwin
}
```

### Platform Override Patterns

#### Different Installation Methods

```typescript
c.bin('tool')
  .install('github-release', { repo: 'owner/repo' })
  .platform(Platform.MacOS, (p) => {
    p.install('brew', { formula: 'tool' });
  });
```

#### Different Asset Patterns

```typescript
c.bin('tool')
  .install('github-release', {
    repo: 'owner/repo',
    assetPattern: '*linux*.tar.gz',
  })
  .platform(Platform.MacOS, (p) => {
    p.install('github-release', {
      repo: 'owner/repo',
      assetPattern: '*darwin*.tar.gz',
    });
  });
```

#### Different Versions

```typescript
c.bin('tool')
  .version('2.0.0')
  .install('github-release', { repo: 'owner/repo' })
  .platform(Platform.Windows, (p) => {
    p.version('1.9.0');  // Use older version on Windows
  });
```

## Validation

The builder validates configurations using Zod schemas:

```typescript
// Valid configuration
c.bin('tool')
  .version('1.0.0')
  .install('github-release', {
    repo: 'owner/repo',  // Required for github-release
  })
  .build();  // ✓ Valid

// Invalid configuration
c.bin('tool')
  .version('1.0.0')
  .install('github-release', {
    // Missing required 'repo' parameter
  })
  .build();  // ✗ Throws validation error
```

## Type Safety

The builder provides full type safety:

```typescript
// TypeScript knows the params type based on the method
c.install('github-release', {
  repo: 'owner/repo',       // ✓ Valid
  assetPattern: '*.tar.gz', // ✓ Valid
  formula: 'tool',          // ✗ Type error: formula not valid for github-release
});

c.install('brew', {
  formula: 'tool',  // ✓ Valid
  repo: 'owner/repo',  // ✗ Type error: repo not valid for brew
});
```

## Dependencies

### Internal Dependencies
- `@dotfiles/logger` - Structured logging
- `@dotfiles/schemas` - Type definitions and validation schemas

## Testing

Run tests with:
```bash
bun test packages/tool-config-builder
```

The package includes tests for:
- Basic configuration building
- Platform overrides
- All installation methods
- Validation
- Type safety

## Design Decisions

### Why Fluent API?
The fluent API:
- Makes configurations readable
- Provides IDE autocomplete
- Chains naturally
- Follows common patterns

### Why Type-Safe Params?
Type-safe parameters:
- Catch errors at compile time
- Provide better IDE support
- Reduce runtime errors
- Document expected parameters

### Why Platform Callbacks?
Platform callbacks:
- Allow complex overrides
- Keep syntax consistent
- Enable partial overrides
- Support nested configuration

## Best Practices

### Always Specify Version

```typescript
// Good
c.version('latest')
c.version('14.0.0')

// Avoid implicit versions
```

### Use Platform Overrides for Differences

```typescript
// Good - clear platform differences
c.bin('tool')
  .install('github-release', { repo: 'owner/repo' })
  .platform(Platform.MacOS, (p) => {
    p.install('brew', { formula: 'tool' });
  });

// Avoid - separate tool configs per platform
```

### Provide Asset Patterns

```typescript
// Good - explicit pattern
c.install('github-release', {
  repo: 'owner/repo',
  assetPattern: '*linux*amd64*.tar.gz',
});

// Avoid - relying on auto-detection
```

### Use Hooks for Setup

```typescript
c.install('github-release', {
  repo: 'owner/repo',
})
  .hook('after-install', async (context) => {
    // Post-installation setup
  });
```

## Common Patterns

### Cross-Platform Tool

```typescript
export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('tool')
    .version('latest')
    .install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*linux*amd64*.tar.gz',
    })
    .platform(Platform.MacOS, (p) => {
      p.install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*darwin*amd64*.tar.gz',
      });
    })
    .platform(Platform.Windows, (p) => {
      p.install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*windows*amd64*.zip',
      });
    });
};
```

### Homebrew-First with Fallback

```typescript
export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('jq')
    .version('latest')
    .install('brew', {
      formula: 'jq',
    })
    .platform(Platform.Linux, (p) => {
      p.install('github-release', {
        repo: 'jqlang/jq',
        assetPattern: '*linux*amd64',
      });
    });
};
```

### Rust Tool via Cargo

```typescript
export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('ripgrep')
    .version('latest')
    .install('cargo', {
      crateName: 'ripgrep',
      binarySource: 'cargo-quickinstall',
      versionSource: 'crates-io',
    });
};
```

## Future Enhancements

Potential improvements:
- Configuration templates
- Inheritance/composition
- Configuration validation
- Auto-completion generation
- Configuration migration tools
- Schema documentation generation
