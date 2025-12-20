# Hooks and Advanced Features

Hooks allow custom logic at different stages of the installation process, enabling advanced customization and post-installation setup.

## Installation Hooks

Use the `.hook()` method to attach handlers to lifecycle events:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async (context) => {
      // Your custom logic here
    })
    // Multiple hooks for the same event
    .hook('after-install', async (context) => { /* setup 1 */ })
    .hook('after-install', async (context) => { /* setup 2 */ })
);
```

Event names: `'before-install'`, `'after-download'`, `'after-extract'`, `'after-install'`

## Hook Context

Each hook receives an enhanced context object with the following properties:

```typescript
interface IHookContext {
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
  projectConfig: ProjectConfig;     // User's application configuration
  toolConfig: ToolConfig;    // Full tool configuration
  $: typeof $;               // Bun's shell executor for running shell commands
  
  // Available in afterInstall hook only
  binaryPath?: string;       // Path to installed binary
  version?: string;          // Version of installed tool
}
```

## Available APIs

### File System Methods

```typescript
// Available file system operations
fileSystem.mkdir(path, { recursive: true })
fileSystem.writeFile(path, content)
fileSystem.readFile(path)
fileSystem.exists(path)
fileSystem.rm(path, { recursive: true })
fileSystem.stat(path)
```

### Shell Executor (`$`)

The `$` property provides Bun's built-in shell executor for running shell commands within hooks.

**Key Features:**
- **Configured Environment**: Automatically handles `PATH` and recursion guards to prevent infinite loops.
- **Template Literals**: Use tagged template literals for shell commands: `` $`command` ``
- **Promise-Based**: All `$` commands return promises with stdout (as Buffer), stderr, and exitCode
- **Working Directory**: Use `cd` commands or `process.chdir()` to change working directory
- **Text Output**: Use `.text()` to get stdout as a string: `await $`command`.text()`
- **Cross-Platform**: Works consistently across Linux, macOS, and Windows

## Basic Usage Examples

### Simple Hook

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $ }) => {
      // Commands run in the .tool.ts file's directory
      await $`ls -la ./`;                    // List tool config directory
      await $`cat ./config.toml`;            // Read config file next to .tool.ts
      await $`mkdir -p ./generated/`;        // Create subdirectory
    })
);
```

### File Operations

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ fileSystem, systemInfo, logger }) => {
      // Create configuration directory
      const configDir = path.join(systemInfo.homeDir, '.config', 'my-tool');
      await fileSystem.mkdir(configDir, { recursive: true });
      
      // Write default configuration
      const defaultConfig = 'theme = "dark"\nverbose = true\n';
      await fileSystem.writeFile(path.join(configDir, 'config.toml'), defaultConfig);
      
      logger.info(`Created configuration at ${configDir}`);
    })
);
```

## Common Patterns

### Check File Existence

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ fileSystem, systemInfo, logger }) => {
      const configPath = path.join(systemInfo.homeDir, '.config', 'tool', 'config.toml');
      const exists = await fileSystem.exists(configPath);
      
      if (exists) {
        logger.info('Custom configuration found');
      } else {
        logger.info('Creating default configuration');
      }
    })
);
```

### Copy Files

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ fileSystem, systemInfo }) => {
      // Copy files from tool directory to user's home
      await fileSystem.copy('./dotfiles/.vimrc', path.join(systemInfo.homeDir, '.vimrc'));
      await fileSystem.copy('./themes/', path.join(systemInfo.homeDir, '.config', 'tool', 'themes'));
    })
);
```

### Run Setup Scripts

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $ }) => {
      // Run tool-specific setup scripts
      await $`chmod +x ./setup.sh && ./setup.sh`;
    })
);
```

### Process Templates

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, systemInfo }) => {
      // Process configuration templates
      await $`HOME=${systemInfo.homeDir} envsubst < ./config.template > ./config.generated`;
    })
);
```

## Error Handling

Always include proper error handling in hooks:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, logger }) => {
      try {
        // Command that might fail
        const result = await $`./configure --enable-feature`;
        logger.info(`Configure output: ${result.stdout.toString()}`);
      } catch (error) {
        // Bun throws errors with exitCode, stdout, and stderr properties
        const stderr = error && typeof error === 'object' && 'stderr' in error ? 
          (error.stderr as Buffer).toString() : 'Unknown error';
        logger.error(`Configure failed: ${stderr}`);
        throw error; // Re-throw to fail the hook
      }
    })
);
```

## Working with Command Output

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async ({ $, logger }) => {
      // Capture and process command output
      const version = await $`./tool --version`.text();
      logger.info(`Installed version: ${version.trim()}`);
      
      // Use output in subsequent commands
      if (version.includes('2.')) {
        await $`./tool migrate-config`;
      }
      
      // Check exit codes
      try {
        await $`./tool self-test`;
        logger.info('Self-test passed');
      } catch (error) {
        const exitCode = error && typeof error === 'object' && 'exitCode' in error ?
          error.exitCode as number : -1;
        logger.error(`Self-test failed with exit code: ${exitCode}`);
        throw error;
      }
    })
);
```

## Hook Examples

### Build from Source

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-extract', async ({ extractDir, installDir, logger, $ }) => {
      if (extractDir) {
        logger.info('Building tool from source...');
        await $`cd ${extractDir} && make build`;
        
        const builtBinary = path.join(extractDir, 'target/release/tool');
        const targetPath = path.join(installDir, 'tool');
        await $`mv ${builtBinary} ${targetPath}`;
        
        logger.info('Build completed successfully');
      }
    })
);
```

### Post-Installation Setup

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-install', async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
      // Create configuration directory using file system API
      const configDir = path.join(systemInfo.homeDir, '.config', toolName);
      await fileSystem.mkdir(configDir, { recursive: true });
      
      // Initialize tool-specific data using shell executor
      await $`${path.join(installDir, toolName)} init --data-dir ${configDir}`;
      
      logger.info(`Initialized ${toolName} at ${configDir}`);
    })
);
```

### Custom Binary Processing

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-extract', async ({ extractDir, installDir, fileSystem, logger }) => {
      if (extractDir) {
        // Custom binary selection and processing
        const binaries = await fileSystem.readdir(path.join(extractDir, 'bin'));
        const mainBinary = binaries.find(name => name.startsWith('main-'));
        
        if (mainBinary) {
          const sourcePath = path.join(extractDir, 'bin', mainBinary);
          const targetPath = path.join(installDir, 'tool');
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

export default defineTool((install, ctx) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
    env: {
      INSTALL_DIR: `${ctx.projectConfig.paths.homeDir}/.local/bin`,
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
    .symlink('./config.yml', path.join(ctx.projectConfig.paths.homeDir, '.config', 'custom-tool', 'config.yml'))
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
    .hook('after-install', async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
      // Create data directory
      const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
      await fileSystem.mkdir(dataDir, { recursive: true });
      
      // Initialize tool
      await $`${path.join(installDir, toolName)} init --data-dir ${dataDir}`;
      
      // Set up completion
      await $`${path.join(installDir, toolName)} completion zsh > ${ctx.projectConfig.paths.generatedDir}/completions/_${toolName}`;
      
      logger.info(`Initialized ${toolName} with data directory: ${dataDir}`);
    })
    .zsh((shell) =>
      shell
        .environment({ CUSTOM_TOOL_DATA: path.join(ctx.projectConfig.paths.homeDir, '.local/share', 'custom-tool') })
        .aliases({ ct: 'custom-tool' })
    )
);
```

## Next Steps

- [Common Patterns](./common-patterns.md) - See real-world examples using hooks
- [Troubleshooting](./troubleshooting.md) - Debug hook issues
- [Context API](./context-api.md) - Learn about available context properties