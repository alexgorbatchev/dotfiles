# Platform-Specific Configuration

Use the `.platform()` method to define different configurations for different operating systems and architectures, enabling cross-platform tool management.

## Platform Enumeration

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

## Method Signatures

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

## Basic Platform Configuration

### Single Platform

```typescript
import { Platform } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').version('latest');
  
  // macOS-specific configuration
  c.platform(Platform.MacOS, (c) => {
    c.install('brew', { formula: 'tool' });
  });
};
```

### Multiple Platforms

```typescript
import { Platform } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').version('latest');
  
  // Unix platforms (Linux + macOS)
  c.platform(Platform.Unix, (c) => {
    c.install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*unix*.tar.gz'
    });
  });
  
  // Windows-specific
  c.platform(Platform.Windows, (c) => {
    c.install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*windows*.zip'
    });
  });
};
```

## Architecture-Specific Configuration

### Platform and Architecture Combined

```typescript
import { Platform, Architecture } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').version('latest');
  
  // Linux x86_64
  c.platform(Platform.Linux, Architecture.X86_64, (c) => {
    c.install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*linux-amd64*.tar.gz'
    });
  });
  
  // Linux ARM64
  c.platform(Platform.Linux, Architecture.Arm64, (c) => {
    c.install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*linux-arm64*.tar.gz'
    });
  });
  
  // macOS (both architectures)
  c.platform(Platform.MacOS, Architecture.All, (c) => {
    c.install('brew', { formula: 'tool' });
  });
};
```

## Complete Multi-Platform Example

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { Platform, Architecture } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Common configuration for all platforms
  c.bin('tool').version('latest');
    
  // macOS-specific
  c.platform(Platform.MacOS, (c) => {
    c.install('brew', { formula: 'tool' })
     .zsh({ aliases: { 't': 'tool --macos-mode' } });
  });
  
  // Linux-specific  
  c.platform(Platform.Linux, (c) => {
    c.install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      })
     .zsh({ aliases: { 't': 'tool --linux-mode' } });
  });
  
  // Windows with architecture-specific configuration
  c.platform(Platform.Windows, Architecture.Arm64, (c) => {
    c.install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows-arm64.zip',
      })
     .powershell({ 
       environment: { 'TOOL_ARCH': 'arm64' },
       aliases: { 't': 'tool --windows-mode' }
     });
  });
  
  // Windows x86_64
  c.platform(Platform.Windows, Architecture.X86_64, (c) => {
    c.install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows-amd64.zip',
      })
     .powershell({ 
       environment: { 'TOOL_ARCH': 'amd64' },
       aliases: { 't': 'tool --windows-mode' }
     });
  });
};
```

## Platform-Specific Installation Methods

### Different Methods per Platform

```typescript
import { Platform } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').version('latest');
  
  // macOS: Use Homebrew
  c.platform(Platform.MacOS, (c) => {
    c.install('brew', { formula: 'tool' });
  });
  
  // Linux: Use GitHub releases
  c.platform(Platform.Linux, (c) => {
    c.install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*linux*.tar.gz'
    });
  });
  
  // Windows: Use curl script
  c.platform(Platform.Windows, (c) => {
    c.install('curl-script', {
      url: 'https://tool.example.com/install.ps1',
      shell: 'powershell'
    });
  });
};
```

## Platform-Specific Shell Configuration

### Different Shell Setups

```typescript
import { Platform } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').install('github-release', { repo: 'owner/tool' });
  
  // Unix platforms (Linux + macOS)
  c.platform(Platform.Unix, (c) => {
    c.zsh({
      environment: {
        'TOOL_CONFIG': `${ctx.homeDir}/.config/tool/config.toml`
      },
      aliases: {
        't': 'tool',
        'tl': 'tool list'
      }
    })
    .bash({
      environment: {
        'TOOL_CONFIG': `${ctx.homeDir}/.config/tool/config.toml`
      },
      aliases: {
        't': 'tool',
        'tl': 'tool list'
      }
    });
  });
  
  // Windows-specific PowerShell configuration
  c.platform(Platform.Windows, (c) => {
    c.powershell({
      environment: {
        'TOOL_CONFIG': `${ctx.homeDir}\.config\tool\config.toml`
      },
      aliases: {
        't': 'tool',
        'tl': 'tool list'
      }
    });
  });
};
```

## Platform-Specific Hooks

```typescript
import { Platform } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').install('github-release', { repo: 'owner/tool' });
  
  // Platform-specific post-installation setup
  c.platform(Platform.MacOS, (c) => {
    c.hooks({
      afterInstall: async ({ $, logger }) => {
        logger.info('Running macOS-specific setup...');
        await $`./setup-macos.sh`;
      }
    });
  });
  
  c.platform(Platform.Linux, (c) => {
    c.hooks({
      afterInstall: async ({ $, logger }) => {
        logger.info('Running Linux-specific setup...');
        await $`./setup-linux.sh`;
      }
    });
  });
  
  c.platform(Platform.Windows, (c) => {
    c.hooks({
      afterInstall: async ({ $, logger }) => {
        logger.info('Running Windows-specific setup...');
        await $`./setup-windows.ps1`;
      }
    });
  });
};
```

## Platform Detection in Hooks

```typescript
c.hooks({
  afterInstall: async ({ systemInfo, logger, $ }) => {
    // Platform-specific logic within hooks
    switch (systemInfo.platform) {
      case 'darwin':
        logger.info('Detected macOS');
        await $`./configure-macos.sh`;
        break;
      case 'linux':
        logger.info('Detected Linux');
        await $`./configure-linux.sh`;
        break;
      case 'win32':
        logger.info('Detected Windows');
        await $`./configure-windows.ps1`;
        break;
    }
    
    // Architecture-specific logic
    if (systemInfo.arch === 'arm64') {
      logger.info('Configuring for ARM64');
      await $`./configure-arm64.sh`;
    }
  }
})
```

## Asset Pattern Examples

### Platform-Specific Patterns

```typescript
// macOS patterns
assetPattern: '*darwin*.tar.gz'
assetPattern: '*macos*.zip'
assetPattern: '*osx*.tar.gz'

// Linux patterns  
assetPattern: '*linux*.tar.gz'
assetPattern: '*ubuntu*.deb'
assetPattern: '*x86_64-unknown-linux-gnu*.tar.gz'

// Windows patterns
assetPattern: '*windows*.zip'
assetPattern: '*win32*.exe'
assetPattern: '*pc-windows-msvc*.zip'

// Architecture-specific patterns
assetPattern: '*amd64*.tar.gz'    // x86_64
assetPattern: '*arm64*.tar.gz'    // ARM64
assetPattern: '*aarch64*.tar.gz'  // ARM64 (alternative naming)
```

## Best Practices

### 1. Start with Common Configuration

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Common configuration first
  c.bin('tool').version('latest');
  
  // Then platform-specific overrides
  c.platform(Platform.MacOS, (c) => {
    // macOS-specific config
  });
};
```

### 2. Use Logical Platform Groups

```typescript
// Group similar platforms
c.platform(Platform.Unix, (c) => {
  // Configuration for both Linux and macOS
});

c.platform(Platform.Windows, (c) => {
  // Windows-specific configuration
});
```

### 3. Handle Architecture Differences

```typescript
// Consider both platform and architecture
c.platform(Platform.Linux, Architecture.X86_64, (c) => {
  // Linux x86_64 specific
});

c.platform(Platform.Linux, Architecture.Arm64, (c) => {
  // Linux ARM64 specific
});
```

### 4. Test Across Platforms

- Test configurations on actual target platforms
- Use virtual machines or containers for testing
- Verify asset patterns work correctly
- Check shell integration on each platform

### 5. Document Platform Requirements

```typescript
// Document platform-specific requirements
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c.bin('tool').version('latest');
  
  // macOS: Requires Homebrew
  c.platform(Platform.MacOS, (c) => {
    c.install('brew', { formula: 'tool' });
  });
  
  // Linux: Requires glibc 2.17+
  c.platform(Platform.Linux, (c) => {
    c.install('github-release', {
      repo: 'owner/tool',
      assetPattern: '*linux*.tar.gz'
    });
  });
};
```

## Troubleshooting

### Platform Detection Issues

```typescript
// Debug platform detection
c.hooks({
  beforeInstall: async ({ systemInfo, logger }) => {
    logger.info(`Detected platform: ${systemInfo.platform}`);
    logger.info(`Detected architecture: ${systemInfo.arch}`);
  }
})
```

### Asset Selection Problems

```typescript
// Debug asset selection (assetSelector doesn't have logger access)
c.install('github-release', {
  repo: 'owner/tool',
  assetSelector: (assets, sysInfo) => {
    // Note: Use console.log here since logger is not available in assetSelector
    console.log('Available assets:', assets.map(a => a.name));
    console.log('System info:', sysInfo);
    // Your selection logic
  }
})
```

## Next Steps

- [Installation Methods](./installation/README.md) - Learn about different installation options
- [Shell Integration](./shell-integration.md) - Configure shell environments per platform
- [Common Patterns](./common-patterns.md) - See real-world cross-platform examples