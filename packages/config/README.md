# @dotfiles/config

Configuration loading and management for the dotfiles generator system. Handles YAML configuration parsing, tool configuration loading, and validation.

## Overview

The config package provides a centralized way to load and validate configuration from YAML files. It handles both the main application configuration (`config.yaml`) and individual tool configurations.

## Features

- **YAML Configuration Loading**: Parse and validate YAML configuration files
- **Tool Configuration Discovery**: Automatically find and load tool configuration files
- **Schema Validation**: Validate configuration against Zod schemas
- **Type Safety**: Fully typed configuration with TypeScript
- **Error Handling**: Clear error messages for configuration problems

## API

### `yamlConfigLoader(configPath: string, logger: Logger): Promise<YamlConfig>`

Loads and validates the main YAML configuration file.

```typescript
import { yamlConfigLoader } from '@dotfiles/config';

const config = await yamlConfigLoader('./config.yaml', logger);

console.log(config.directories.tools);
console.log(config.directories.bin);
console.log(config.directories.cache);
```

### `loadToolConfigs(toolsConfigDir: string, logger: Logger): Promise<ToolConfigs>`

Loads all tool configuration files from a directory.

```typescript
import { loadToolConfigs } from '@dotfiles/config';

const toolConfigs = await loadToolConfigs('./configs/tools', logger);

// Access specific tool config
const fzfConfig = toolConfigs.fzf;
console.log(fzfConfig.version);
console.log(fzfConfig.installationMethod);
```

## Configuration File Structure

### Main Configuration (config.yaml)

```yaml
# Dotfiles system configuration
directories:
  tools: ~/.dotfiles/tools
  bin: ~/.dotfiles/bin
  cache: ~/.dotfiles/.cache
  configs: ~/.dotfiles/configs
  toolsConfig: ~/.dotfiles/configs/tools

# Shell configuration
shellInit:
  targetDirectory: ~/.dotfiles/shell
  shells:
    - zsh
    - bash

# Symlink configuration
symlinks:
  - source: ~/.dotfiles/configs/git/.gitconfig
    target: ~/.gitconfig
  - source: ~/.dotfiles/configs/vim/.vimrc
    target: ~/.vimrc

# Installation options
installOptions:
  parallel: true
  maxConcurrency: 4
  continueOnError: false

# Cache configuration
cache:
  enabled: true
  ttl: 86400 # 24 hours

# Update checking
updateCheck:
  enabled: true
  frequency: daily
```

### Tool Configuration Files

Tool configurations are TypeScript files that export a configuration builder:

```typescript
// configs/tools/fzf.tool.ts
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

## Usage Examples

### Loading Main Configuration

```typescript
import { yamlConfigLoader } from '@dotfiles/config';
import { createTsLogger } from '@dotfiles/logger';

const logger = createTsLogger();

try {
  const config = await yamlConfigLoader('./config.yaml', logger);
  
  // Access configuration values
  const toolsDir = config.directories.tools;
  const binDir = config.directories.bin;
  
  // Use configuration
  console.log(`Tools will be installed to: ${toolsDir}`);
} catch (error) {
  console.error('Failed to load configuration:', error);
}
```

### Loading Tool Configurations

```typescript
import { loadToolConfigs } from '@dotfiles/config';
import { createTsLogger } from '@dotfiles/logger';

const logger = createTsLogger();

const toolConfigs = await loadToolConfigs('./configs/tools', logger);

// Iterate over all tool configurations
for (const [toolName, config] of Object.entries(toolConfigs)) {
  console.log(`Tool: ${toolName}`);
  console.log(`  Version: ${config.version}`);
  console.log(`  Method: ${config.installationMethod}`);
}
```

### Using Configuration in Application

```typescript
import { yamlConfigLoader, loadToolConfigs } from '@dotfiles/config';
import { Installer } from '@dotfiles/installer';

// Load configurations
const appConfig = await yamlConfigLoader('./config.yaml', logger);
const toolConfigs = await loadToolConfigs(
  appConfig.directories.toolsConfig,
  logger
);

// Initialize installer with configuration
const installer = new Installer(
  logger,
  fileSystem,
  downloader,
  githubApiClient,
  cargoClient,
  archiveExtractor,
  appConfig,
  toolRegistry,
  systemInfo
);

// Install tools using configurations
for (const [toolName, toolConfig] of Object.entries(toolConfigs)) {
  await installer.install(toolName, toolConfig);
}
```

### Configuration Validation

```typescript
import { yamlConfigLoader } from '@dotfiles/config';

try {
  const config = await yamlConfigLoader('./config.yaml', logger);
  // Configuration is valid and typed
} catch (error) {
  if (error instanceof Error && error.message.includes('validation')) {
    console.error('Invalid configuration:');
    console.error(error.message);
    // Handle validation errors
  }
}
```

## Configuration Schema

The configuration is validated using Zod schemas from `@dotfiles/schemas`:

```typescript
import { yamlConfigSchema } from '@dotfiles/schemas/config';

// The loader validates against this schema
const config = yamlConfigSchema.parse(yamlData);
```

### YamlConfig Type

```typescript
interface YamlConfig {
  directories: {
    tools: string;
    bin: string;
    cache: string;
    configs: string;
    toolsConfig: string;
  };
  shellInit?: {
    targetDirectory: string;
    shells: string[];
  };
  symlinks?: Array<{
    source: string;
    target: string;
  }>;
  installOptions?: {
    parallel?: boolean;
    maxConcurrency?: number;
    continueOnError?: boolean;
  };
  cache?: {
    enabled: boolean;
    ttl?: number;
  };
  updateCheck?: {
    enabled: boolean;
    frequency?: 'daily' | 'weekly' | 'monthly';
  };
}
```

## Tool Configuration Discovery

The `loadToolConfigs` function:

1. **Scans Directory**: Finds all `.tool.ts` files in the specified directory
2. **Loads Modules**: Dynamically imports each tool configuration module
3. **Executes Builders**: Runs the configuration builder function
4. **Validates**: Validates the resulting configuration against schemas
5. **Returns Map**: Returns a map of tool name to configuration

## Error Handling

### Configuration File Not Found

```typescript
Error: Configuration file not found: ./config.yaml
```

### Invalid YAML Syntax

```typescript
Error: Failed to parse YAML: unexpected token at line 5
```

### Schema Validation Errors

```typescript
Error: Invalid configuration:
  - directories.tools: Required field missing
  - directories.bin: Must be a valid path
```

### Tool Configuration Errors

```typescript
Error: Failed to load tool configuration: fzf.tool.ts
  - installParams.repo: Required for github-release method
```

## Dependencies

### Internal Dependencies
- `@dotfiles/file-system` - File reading operations
- `@dotfiles/logger` - Structured logging
- `@dotfiles/schemas` - Configuration schemas and validation
- `@dotfiles/tool-config-builder` - Tool configuration builder
- `@dotfiles/utils` - Shared utilities

### External Dependencies
- `yaml` - YAML parsing library

## Testing

Run tests with:
```bash
bun test packages/config
```

The package includes tests for:
- YAML parsing
- Configuration validation
- Tool configuration loading
- Error handling
- Schema compliance

## Logging

The config package uses structured logging:

```typescript
// Log messages defined in log-messages.ts
logger.debug('Loading configuration', { path: configPath });
logger.info('Configuration loaded successfully', { toolCount });
logger.error('Configuration validation failed', { errors });
```

## Best Practices

### Validate Early
```typescript
// Load and validate configuration at application startup
const config = await yamlConfigLoader('./config.yaml', logger);
// Use validated config throughout application
```

### Use Type Guards
```typescript
import { isGithubReleaseToolConfig } from '@dotfiles/schemas';

if (isGithubReleaseToolConfig(toolConfig)) {
  // TypeScript knows this is a GithubReleaseToolConfig
  console.log(toolConfig.installParams.repo);
}
```

### Handle Missing Optionals
```typescript
const maxConcurrency = config.installOptions?.maxConcurrency ?? 4;
const cacheEnabled = config.cache?.enabled ?? true;
```

### Provide Defaults
```typescript
const directories = {
  tools: config.directories?.tools ?? '~/.dotfiles/tools',
  bin: config.directories?.bin ?? '~/.dotfiles/bin',
  // ...
};
```

## Environment Variable Support

Configuration values can reference environment variables:

```yaml
directories:
  tools: ${HOME}/.dotfiles/tools
  bin: ${DOTFILES_BIN:-~/.dotfiles/bin}
```

The loader expands environment variables during parsing.

## Design Decisions

### Why YAML?
YAML provides:
- Human-readable format
- Comment support
- Hierarchical structure
- Wide tool support

### Why Separate Tool Configs?
Separating tool configurations:
- Improves organization
- Enables selective loading
- Simplifies maintenance
- Allows tool-specific logic

### Why TypeScript Tool Configs?
Using TypeScript for tool configurations:
- Provides type safety
- Enables code reuse
- Allows computed values
- Supports complex logic

## Future Enhancements

Potential improvements:
- Configuration inheritance
- Configuration profiles (dev, prod, etc.)
- Remote configuration loading
- Configuration migration tools
- Configuration schema evolution
- Live configuration reloading
- Configuration encryption
