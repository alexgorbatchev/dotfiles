# Hooks and Advanced Features

Hooks allow custom logic at different stages of the installation process, enabling advanced customization and post-installation setup.

## Installation Hooks

Hooks provide entry points for custom logic during tool installation:

```typescript
c.hooks({
  beforeInstall?: async (context) => { /* setup */ },
  afterDownload?: async (context) => { /* post-download */ },
  afterExtract?: async (context) => { /* post-extract */ },
  afterInstall?: async (context) => { /* finalization */ },
})
```

## Hook Context

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

The `$` property provides a ZX shell executor that automatically has its working directory (`cwd`) set to the directory containing the `.tool.ts` file.

**Key Features:**
- **Automatic Working Directory**: `$` commands execute in the same directory as your `.tool.ts` file
- **Relative Path Support**: Use `./` to reference files next to your tool config
- **Template Literals**: Use tagged template literals for shell commands: `` $`command` ``
- **Promise-Based**: All `$` commands return promises with stdout, stderr, and exitCode
- **Cross-Platform**: Works consistently across Linux, macOS, and Windows

## Basic Usage Examples

### Simple Hook

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

### File Operations

```typescript
c.hooks({
  afterInstall: async ({ fileSystem, systemInfo, logger }) => {
    // Create configuration directory
    const configDir = path.join(systemInfo.homeDir, '.config', 'my-tool');
    await fileSystem.mkdir(configDir, { recursive: true });
    
    // Write default configuration
    const defaultConfig = 'theme = "dark"\nverbose = true\n';
    await fileSystem.writeFile(path.join(configDir, 'config.toml'), defaultConfig);
    
    logger.info(`Created configuration at ${configDir}`);
  }
})
```

## Common Patterns

### Check File Existence

```typescript
c.hooks({
  afterInstall: async ({ $ }) => {
    // Check if files exist
    const configExists = await $`test -f ./config.toml && echo "yes" || echo "no"`;
    if (configExists.stdout.includes('yes')) {
      // Config file exists
      await $`cp ./config.toml ${systemInfo.homeDir}/.config/tool/`;
    }
  }
})
```

### Copy Files

```typescript
c.hooks({
  afterInstall: async ({ $, systemInfo }) => {
    // Copy files from tool directory to user's home
    await $`cp ./dotfiles/.vimrc ${systemInfo.homeDir}/.vimrc`;
    await $`cp -r ./themes/ ${systemInfo.homeDir}/.config/tool/themes/`;
  }
})
```

### Run Setup Scripts

```typescript
c.hooks({
  afterInstall: async ({ $ }) => {
    // Run tool-specific setup scripts
    await $`chmod +x ./setup.sh && ./setup.sh`;
  }
})
```

### Process Templates

```typescript
c.hooks({
  afterInstall: async ({ $, systemInfo }) => {
    // Process configuration templates
    await $`HOME=${systemInfo.homeDir} envsubst < ./config.template > ./config.generated`;
  }
})
```

## Error Handling

Always include proper error handling in hooks:

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

## Working with Command Output

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

## Hook Examples

### Build from Source

```typescript
c.hooks({
  afterExtract: async ({ extractDir, installDir, logger, $ }) => {
    if (extractDir) {
      logger.info('Building tool from source...');
      await $`cd ${extractDir} && make build`;
      
      const builtBinary = path.join(extractDir, 'target/release/tool');
      const targetPath = path.join(installDir, 'tool');
      await $`mv ${builtBinary} ${targetPath}`;
      
      logger.info('Build completed successfully');
    }
  }
})
```

### Post-Installation Setup

```typescript
c.hooks({
  afterInstall: async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
    // Create configuration directory using file system API
    const configDir = path.join(systemInfo.homeDir, '.config', toolName);
    await fileSystem.mkdir(configDir, { recursive: true });
    
    // Initialize tool-specific data using shell executor
    await $`${path.join(installDir, toolName)} init --data-dir ${configDir}`;
    
    logger.info(`Initialized ${toolName} at ${configDir}`);
  }
})
```

### Custom Binary Processing

```typescript
c.hooks({
  afterExtract: async ({ extractDir, installDir, fileSystem, logger }) => {
    if (extractDir) {
      // Custom binary selection and processing
      const binaries = await fileSystem.readdir(path.join(extractDir, 'bin'));
      const mainBinary = binaries.find(name => name.startsWith('main-'));
      
      if (mainBinary) {
        const sourcePath = path.join(extractDir, 'bin', mainBinary);
        const targetPath = path.join(installDir, 'tool');
        await fileSystem.copyFile(sourcePath, targetPath);
        logger.info(`Selected binary: ${mainBinary}`);
      }
    }
  }
})
```

### Environment-Specific Setup

```typescript
c.hooks({
  afterInstall: async ({ systemInfo, fileSystem, logger, $ }) => {
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
  }
})
```

## Environment Variables in Installation

Set environment variables during installation (for curl-script installs):

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
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import path from 'path';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('custom-tool')
    .version('latest')
    .install('github-release', { repo: 'owner/custom-tool' })
    .symlink('./config.yml', `${ctx.homeDir}/.config/custom-tool/config.yml`)
    .hooks({
      beforeInstall: async ({ logger }) => {
        logger.info('Starting custom-tool installation...');
      },
      
      afterExtract: async ({ extractDir, logger, $ }) => {
        if (extractDir) {
          // Build additional components
          logger.info('Building plugins...');
          await $`cd ${extractDir} && make plugins`;
        }
      },
      
      afterInstall: async ({ toolName, installDir, systemInfo, fileSystem, logger, $ }) => {
        // Create data directory
        const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
        await fileSystem.mkdir(dataDir, { recursive: true });
        
        // Initialize tool
        await $`${path.join(installDir, toolName)} init --data-dir ${dataDir}`;
        
        // Set up completion
        await $`${path.join(installDir, toolName)} completion zsh > ${ctx.generatedDir}/completions/_${toolName}`;
        
        logger.info(`Initialized ${toolName} with data directory: ${dataDir}`);
      }
    })
    .zsh({
      environment: { 'CUSTOM_TOOL_DATA': `${ctx.homeDir}/.local/share/custom-tool` },
      aliases: { 'ct': 'custom-tool' }
    });
};
```

## Next Steps

- [Common Patterns](./common-patterns.md) - See real-world examples using hooks
- [Troubleshooting](./troubleshooting.md) - Debug hook issues
- [Context API](./context-api.md) - Learn about available context properties