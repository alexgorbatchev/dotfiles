# Platform-Specific Configuration

Use the `.platform()` method to define different configurations for different operating systems and architectures, enabling cross-platform tool management.

## Platform Enumeration

```typescript
import { Platform, Architecture } from '@gitea/dotfiles';

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
install()
  .platform(platforms: Platform, configure: (install) => PlatformConfigBuilder)

// Platform and architecture-specific configuration  
install()
  .platform(
    platforms: Platform, 
    architectures: Architecture, 
    configure: (install) => PlatformConfigBuilder
  )
```

## Basic Platform Configuration

### Single Platform

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('brew', { formula: 'tool' })
    .bin('tool')
    .version('latest')
);
```

### Multiple Platforms

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .version('latest')
    .platform(Platform.Unix, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*unix*.tar.gz'
      })
    )
    .platform(Platform.Windows, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*windows*.zip'
      })
    )
);
```

## Architecture-Specific Configuration

### Platform and Architecture Combined

```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .version('latest')
    .platform(Platform.Linux, Architecture.X86_64, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux-amd64*.tar.gz'
      })
    )
    .platform(Platform.Linux, Architecture.Arm64, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux-arm64*.tar.gz'
      })
    )
    .platform(Platform.MacOS, Architecture.All, (install) =>
      install('brew', { formula: 'tool' })
    )
);
```

## Complete Multi-Platform Example

```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .version('latest')
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
        .zsh((shell) => shell.aliases({ t: 'tool --macos-mode' }))
    )
    .platform(Platform.Linux, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz',
      })
        .zsh((shell) => shell.aliases({ t: 'tool --linux-mode' }))
    )
    .platform(Platform.Windows, Architecture.Arm64, (install) =>
      install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows-arm64.zip',
      })
        .powershell((shell) =>
          shell
            .environment({ TOOL_ARCH: 'arm64' })
            .aliases({ t: 'tool --windows-mode' })
        )
    )
    .platform(Platform.Windows, Architecture.X86_64, (install) =>
      install('github-release', {
        repo: 'owner/tool', 
        assetPattern: '*windows-amd64.zip',
      })
        .powershell((shell) =>
          shell
            .environment({ TOOL_ARCH: 'amd64' })
            .aliases({ t: 'tool --windows-mode' })
        )
    )
);
```

## Platform-Specific Installation Methods

### Different Methods per Platform

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .version('latest')
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
    )
    .platform(Platform.Linux, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz'
      })
    )
    .platform(Platform.Windows, (install) =>
      install('curl-script', {
        url: 'https://tool.example.com/install.ps1',
        shell: 'powershell'
      })
    )
);
```

## Platform-Specific Shell Configuration

### Different Shell Setups

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.Unix, (install) =>
      install()
        .zsh((shell) =>
          shell
            .environment({
              TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`
            })
            .aliases({
              t: 'tool',
              tl: 'tool list'
            })
        )
        .bash((shell) =>
          shell
            .environment({
              TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`
            })
            .aliases({
              t: 'tool',
              tl: 'tool list'
            })
        )
    )
    .platform(Platform.Windows, (install) =>
      install()
        .powershell((shell) =>
          shell
            .environment({
              TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}\\.config\\tool\\config.toml`
            })
            .aliases({
              t: 'tool',
              tl: 'tool list'
            })
        )
    )
);
```

## Platform-Specific Hooks

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.MacOS, (install) =>
      install()
        .hook('after-install', async ({ $, logger }) => {
          logger.info('Running macOS-specific setup...');
          await $`./setup-macos.sh`;
        })
    )
    .platform(Platform.Linux, (install) =>
      install()
        .hook('after-install', async ({ $, logger }) => {
          logger.info('Running Linux-specific setup...');
          await $`./setup-linux.sh`;
        })
    )
    .platform(Platform.Windows, (install) =>
      install()
        .hook('after-install', async ({ $, logger }) => {
          logger.info('Running Windows-specific setup...');
          await $`./setup-windows.ps1`;
        })
    )
);
```

## Platform Detection in Hooks

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ systemInfo, logger, $ }) => {
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
    })
);
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
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .version('latest')
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
    )
);
```

### 2. Use Logical Platform Groups

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .platform(Platform.Unix, (install) =>
      install('github-release', { repo: 'owner/tool' })
    )
    .platform(Platform.Windows, (install) =>
      install('github-release', { repo: 'owner/tool', assetPattern: '*windows*.zip' })
    )
);
```

### 3. Handle Architecture Differences

```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .platform(Platform.Linux, Architecture.X86_64, (install) =>
      install('github-release', { repo: 'owner/tool', assetPattern: '*linux-amd64*' })
    )
    .platform(Platform.Linux, Architecture.Arm64, (install) =>
      install('github-release', { repo: 'owner/tool', assetPattern: '*linux-arm64*' })
    )
);
```

### 4. Test Across Platforms

- Test configurations on actual target platforms
- Use virtual machines or containers for testing
- Verify asset patterns work correctly
- Check shell integration on each platform

### 5. Document Platform Requirements

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

// Document platform-specific requirements
export default defineTool((install, ctx) =>
  install()
    .bin('tool')
    .version('latest')
    // macOS: Requires Homebrew
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
    )
    // Linux: Requires glibc 2.17+
    .platform(Platform.Linux, (install) =>
      install('github-release', {
        repo: 'owner/tool',
        assetPattern: '*linux*.tar.gz'
      })
    )
);
```

## Troubleshooting

### Platform Detection Issues

```typescript
import { defineTool } from '@gitea/dotfiles';

// Debug platform detection
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('before-install', async ({ systemInfo, logger }) => {
      logger.info(`Detected platform: ${systemInfo.platform}`);
      logger.info(`Detected architecture: ${systemInfo.arch}`);
    })
);
```

### Asset Selection Problems

```typescript
import { defineTool } from '@gitea/dotfiles';

// Debug asset selection
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/tool',
    assetSelector: (context) => {
      const { assets, systemInfo, logger } = context;
      logger.debug('Available assets:', assets.map(a => a.name).join(', '));
      logger.debug('System info:', systemInfo);
      // Your selection logic
      return assets[0];
    }
  })
    .bin('tool')
);
```