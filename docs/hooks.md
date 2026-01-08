# Hooks

Hooks allow custom logic at different stages of the installation process.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async (context) => {
      const { $, logger, fileSystem } = context;
      await $`./tool init`;
      logger.info('Tool initialized');
    })
);
```

## Hook Events

| Event | When | Available Properties |
|-------|------|---------------------|
| `before-install` | Before installation starts | `stagingDir` |
| `after-download` | After file download | `stagingDir`, `downloadPath` |
| `after-extract` | After archive extraction | `stagingDir`, `downloadPath`, `extractDir` |
| `after-install` | After installation completes | `installedDir`, `binaryPaths`, `version` |

## Context Properties

All hooks receive a context object with:

| Property | Description |
|----------|-------------|
| `toolName` | Name of the tool |
| `currentDir` | Stable path (symlink) for this tool |
| `systemInfo` | Platform, architecture, home directory |
| `fileSystem` | File operations (mkdir, writeFile, exists, etc.) |
| `replaceInFile` | Regex-based file text replacement |
| `logger` | Structured logging (info, warn, error) |
| `projectConfig` | Project configuration |
| `toolConfig` | Tool configuration |
| `$` | Bun shell executor |

## Examples

### File Operations

```typescript
.hook('after-install', async ({ fileSystem, systemInfo, logger }) => {
  const configDir = `${systemInfo.homeDir}/.config/tool`;
  await fileSystem.mkdir(configDir, { recursive: true });
  await fileSystem.writeFile(`${configDir}/config.toml`, 'theme = "dark"');
  logger.info('Configuration created');
})
```

### Shell Commands

```typescript
.hook('after-install', async ({ $, installedDir }) => {
  // Run tool command
  await $`${installedDir}/tool init`;
  
  // Capture output
  const version = await $`./tool --version`.text();
})
```

### Executing Installed Binaries by Name

In `after-install` hooks, the shell's PATH is automatically enhanced to include the directories containing the installed binaries. This means you can execute freshly installed tools by name without specifying the full path:

```typescript
.hook('after-install', async ({ $ }) => {
  // The installed binary is automatically available by name
  await $`my-tool --version`;
  
  // No need to use full paths like:
  // await $`${installedDir}/bin/my-tool --version`;
})
```

This PATH enhancement only applies to `after-install` hooks where `binaryPaths` is available in the context.

### Platform-Specific Setup

```typescript
.hook('after-install', async ({ systemInfo, $ }) => {
  if (systemInfo.platform === 'darwin') {
    await $`./setup-macos.sh`;
  } else if (systemInfo.platform === 'linux') {
    await $`./setup-linux.sh`;
  }
})
```

### File Text Replacement

```typescript
.hook('after-install', async ({ replaceInFile, installedDir }) => {
  // Replace a config value (returns true if replaced, false otherwise)
  const wasReplaced = await replaceInFile(
    `${installedDir}/config.toml`,
    /theme = ".*"/,
    'theme = "dark"'
  );

  // Increment version numbers line-by-line
  await replaceInFile(
    `${installedDir}/versions.txt`,
    /version=(\d+)/,
    (match) => `version=${Number(match.captures[0]) + 1}`,
    { mode: 'line' }
  );

  // Log error if pattern not found (helpful for debugging)
  await replaceInFile(
    `${installedDir}/config.toml`,
    /api_key = ".*"/,
    'api_key = "secret"',
    { errorMessage: 'Could not find api_key setting' }
  );
})
```

### Build from Source

```typescript
.hook('after-extract', async ({ extractDir, stagingDir, $ }) => {
  if (extractDir) {
    await $`cd ${extractDir} && make build`;
    await $`mv ${extractDir}/target/release/tool ${stagingDir}/tool`;
  }
})
```

## Error Handling

```typescript
.hook('after-install', async ({ $, logger }) => {
  try {
    await $`./tool self-test`;
  } catch (error) {
    logger.error('Self-test failed');
    throw error; // Re-throw to fail installation
  }
});
```

### Custom Binary Processing

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-extract', async ({ extractDir, stagingDir, fileSystem, logger }) => {
      if (extractDir) {
        // Custom binary selection and processing
        const binaries = await fileSystem.readdir(path.join(extractDir, 'bin'));
        const mainBinary = binaries.find(name => name.startsWith('main-'));
        
        if (mainBinary) {
          const sourcePath = path.join(extractDir, 'bin', mainBinary);
          const targetPath = path.join(stagingDir ?? '', 'tool');
          await fileSystem.copy(sourcePath, targetPath);
          logger.info(`Selected binary: ${mainBinary}`);
        }
      }
    })
);
```

### Environment-Specific Setup

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-install', async ({ systemInfo, fileSystem, logger, $ }) => {
      // Platform-specific setup
      if (systemInfo.platform === 'darwin') {
        // macOS-specific setup
        await $`./setup-macos.sh`;
      } else if (systemInfo.platform === 'linux') {
        // Linux-specific setup
        await $`./setup-linux.sh`;
      }
      
      // Architecture-specific setup
      if (systemInfo.arch === 'arm64') {
        logger.info('Configuring for ARM64 architecture');
        await $`./configure-arm64.sh`;
      }
    })
);
```

## Environment Variables in Installation

Set environment variables during installation (for curl-script installs):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
    env: {
      INSTALL_DIR: '~/.local/bin',
      ENABLE_FEATURE: 'true',
      API_KEY: process.env.TOOL_API_KEY || 'default',
    },
  })
    .bin('my-tool')
);
```

## Best Practices

1. **Use `$` for shell operations** that need to work with files relative to your tool config
2. **Use `fileSystem` methods** for cross-platform file operations that don't require shell features
3. **Always handle errors appropriately** in hooks to provide clear feedback
4. **Use `logger` for all output** - avoid `console.log()` in favor of structured logging:
   - `logger.info()` for general information
   - `logger.warn()` for debugging and troubleshooting
   - `logger.error()` for error conditions
5. **Test your hooks** on different platforms to ensure compatibility
6. **Keep hooks focused** - each hook should have a single responsibility
7. **Document complex logic** - explain what your hooks are doing and why

## Hook Execution Order

1. **`beforeInstall`**: Before any installation steps
2. **`afterDownload`**: After downloading but before extraction
3. **`afterExtract`**: After extraction but before binary setup
4. **`afterInstall`**: After all installation steps are complete

## Complete Example

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .symlink('./config.yml', '~/.config/custom-tool/config.yml')
    .hook('before-install', async ({ logger }) => {
      logger.info('Starting custom-tool installation...');
    })
    .hook('after-extract', async ({ extractDir, logger, $ }) => {
      if (extractDir) {
        // Build additional components
        logger.info('Building plugins...');
        await $`cd ${extractDir} && make plugins`;
      }
    })
    .hook('after-install', async ({ toolName, installedDir, systemInfo, fileSystem, logger, $ }) => {
      // Create data directory
      const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
      await fileSystem.mkdir(dataDir, { recursive: true });
      
      // Initialize tool
      await $`${path.join(installedDir ?? '', toolName)} init --data-dir ${dataDir}`;
      
      // Set up completion
      await $`${path.join(installedDir ?? '', toolName)} completion zsh > ${ctx.projectConfig.paths.generatedDir}/completions/_${toolName}`;
      
      logger.info(`Initialized ${toolName} with data directory: ${dataDir}`);
    })
    .zsh((shell) =>
      shell
        .environment({ CUSTOM_TOOL_DATA: '~/.local/share/custom-tool' })
        .aliases({ ct: 'custom-tool' })
    )
);
```

## Next Steps

- [Common Patterns](./common-patterns.md) - See real-world examples using hooks
- [Troubleshooting](./troubleshooting.md) - Debug hook issues
- [Context API](./context-api.md) - Learn about available context properties