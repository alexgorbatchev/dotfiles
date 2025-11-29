# @dotfiles/config

Configuration loading and management for the dotfiles tool installer system.

## Overview

This package provides functionality to load, validate, and process configuration files for the dotfiles system. It handles both the main YAML configuration (`config.yaml`) and individual tool configurations (`.tool.ts` files), applying platform-specific overrides and performing token substitution.

## Features

- **YAML Configuration**: Load and validate the main `config.yaml` file
- **Tool Configuration Discovery**: Recursively scan directories for `.tool.ts` configuration files
- **Platform Overrides**: Apply OS and architecture-specific configuration overrides
- **Token Substitution**: Replace environment variables and config references in configuration values
- **Path Expansion**: Expand home directory (`~`) in path values
- **Schema Validation**: Runtime validation using Zod schemas
- **Dependency Injection**: `IConfigService` interface for testable code
- **TypeScript Helpers**: `defineConfig` wrapper for strongly typed `.config.ts` files

## Core API

### `loadProjectConfig(logger, fileSystem, userConfigPath, systemInfo, env): Promise<ProjectConfig>`

Loads and validates the main project configuration file from the filesystem.

```typescript
import { loadProjectConfig } from '@dotfiles/config';
import { createRealFileSystem } from '@dotfiles/file-system';

const projectConfig = await loadProjectConfig(
  logger,
  createRealFileSystem(),
  './config.yaml',
  { platform: 'darwin', arch: 'x64', homeDir: '/Users/username' },
  process.env
);

console.log(projectConfig.paths.binariesDir);
console.log(projectConfig.paths.targetDir);
```

### `loadToolConfigs(logger, toolConfigsDir, fs, projectConfig): Promise<Record<string, ToolConfig>>`

Recursively loads all `.tool.ts` configuration files from a directory.

```typescript
import { loadToolConfigs } from '@dotfiles/config';

const toolConfigs = await loadToolConfigs(
  logger,
  projectConfig.paths.toolConfigsDir,
  fileSystem,
  projectConfig
);

// Access specific tool config
const fzfConfig = toolConfigs['fzf'];
if (fzfConfig) {
  console.log(fzfConfig.version);
  console.log(fzfConfig.installationMethod);
}
```

### `loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, projectConfig): Promise<ToolConfig | undefined>`

Loads configuration for a single tool by name.

```typescript
import { loadSingleToolConfig } from '@dotfiles/config';

const fzfConfig = await loadSingleToolConfig(
  logger,
  'fzf',
  projectConfig.paths.toolConfigsDir,
  fileSystem,
  projectConfig
);

if (fzfConfig) {
  console.log(`Installing ${fzfConfig.name} version ${fzfConfig.version}`);
}
```

### `ConfigService`

Default implementation of `IConfigService` for dependency injection.

```typescript
import { ConfigService } from '@dotfiles/config';

const configService = new ConfigService();

const toolConfig = await configService.loadSingleToolConfig(
  logger,
  'fzf',
  toolConfigsDir,
  fileSystem,
  projectConfig
);
```

### `defineConfig(configFn)`

Wraps a synchronous or asynchronous factory so `.config.ts` files stay fully typed and consistently return a promise.

```typescript
// dotfiles.config.ts
import { defineConfig } from '@dotfiles/config';

export default defineConfig(async () => ({
  paths: {
    dotfilesDir: '~/.dotfiles',
    targetDir: '~/.local/bin',
  },
  github: {
    token: process.env.GITHUB_TOKEN,
  },
}));

// ... synchronous factories are also supported
export default defineConfig(() => ({
  paths: {
    generatedDir: '${configFileDir}/.generated',
  },
}));

// ... context-aware factories
export default defineConfig(({ configFileDir, systemInfo }) => ({
  paths: {
    generatedDir: `${configFileDir}/.generated`,
  },
}));
```

## Configuration File Structure

### Main Configuration (config.yaml)

```yaml
paths:
  homeDir: ~
  dotfilesDir: ~/.dotfiles
  binariesDir: ~/.dotfiles/binaries
  targetDir: ~/.local/bin
  toolConfigsDir: ~/.dotfiles/tools
  shellScriptsDir: ~/.dotfiles/shell-scripts
  generatedDir: ~/.dotfiles/generated

# Platform-specific overrides
platform:
  - match:
      - os: macos
    config:
      paths:
        targetDir: ~/bin
  - match:
      - os: linux
        arch: arm64
    config:
      paths:
        binariesDir: ~/.dotfiles/binaries-arm64
```

### Tool Configuration Files

Tool configuration files are TypeScript modules (`.tool.ts`) that export a configuration function:

```typescript
// tools/fzf.tool.ts
import type { ToolConfigBuilder, ToolConfigContext } from '@dotfiles/schemas';

export default (c: ToolConfigBuilder, ctx: ToolConfigContext) => {
  c.bin('fzf')
    .version('0.54.0')
    .install('github-release', {
      repo: 'junegunn/fzf',
      assetPattern: 'fzf-*-linux_amd64.tar.gz',
    })
    .zsh((shell) =>
      shell.always(/* zsh */`
        source <(fzf --zsh)
      `)
    );
};
```

Tool configs can also be placed in subdirectories for better organization:

```
tools/
├── cli/
│   ├── fzf.tool.ts
│   └── ripgrep.tool.ts
├── dev/
│   ├── node.tool.ts
│   └── rust.tool.ts
└── git.tool.ts
```

## Usage Examples

### Loading Configuration

```typescript
import { loadProjectConfig, loadToolConfigs } from '@dotfiles/config';
import { createRealFileSystem } from '@dotfiles/file-system';
import { createTsLogger } from '@dotfiles/logger';

const logger = createTsLogger();
const fs = createRealFileSystem();

// Load main configuration
const projectConfig = await loadProjectConfig(
  logger,
  fs,
  './config.yaml',
  {
    platform: process.platform,
    arch: process.arch,
    homeDir: process.env.HOME || '~',
  },
  process.env
);

// Load all tool configurations
const toolConfigs = await loadToolConfigs(
  logger,
  projectConfig.paths.toolConfigsDir,
  fs,
  projectConfig
);

console.log(`Loaded ${Object.keys(toolConfigs).length} tool configurations`);
```

### Loading a Single Tool Configuration

```typescript
import { loadSingleToolConfig } from '@dotfiles/config';

const ripgrepConfig = await loadSingleToolConfig(
  logger,
  'ripgrep',
  projectConfig.paths.toolConfigsDir,
  fs,
  projectConfig
);

if (ripgrepConfig) {
  console.log(`Will install ${ripgrepConfig.name} ${ripgrepConfig.version}`);
}
```

### Using Dependency Injection

```typescript
import { ConfigService, type IConfigService } from '@dotfiles/config';

class MyApp {
  constructor(
    private logger: TsLogger,
    private configService: IConfigService
  ) {}

  async loadToolConfig(toolName: string) {
    return this.configService.loadSingleToolConfig(
      this.logger,
      toolName,
      this.toolConfigsDir,
      this.fs,
      this.projectConfig
    );
  }
}

// Use real implementation in production
const app = new MyApp(logger, new ConfigService());

// Use mock in tests
const mockConfigService = {
  loadSingleToolConfig: async () => mockToolConfig,
  loadToolConfigs: async () => ({ fzf: mockToolConfig }),
};
const testApp = new MyApp(logger, mockConfigService);
```

## Platform Overrides

Configuration can include platform-specific overrides that are applied based on the current OS and architecture:

```yaml
paths:
  binariesDir: ~/.dotfiles/binaries
  targetDir: ~/.local/bin

platform:
  # macOS override
  - match:
      - os: macos
    config:
      paths:
        targetDir: ~/bin
  
  # Linux ARM64 override
  - match:
      - os: linux
        arch: arm64
    config:
      paths:
        binariesDir: ~/.dotfiles/binaries-arm64
  
  # Multiple platforms
  - match:
      - os: macos
      - os: linux
    config:
      someSharedSetting: value
```

## Token Substitution

Configuration values support token substitution for environment variables and config references:

```yaml
paths:
  homeDir: ${HOME}
  dotfilesDir: ${HOME}/.dotfiles
  binariesDir: ${paths.dotfilesDir}/binaries
  targetDir: ${CUSTOM_BIN_DIR:-~/.local/bin}  # With default value
```

Supported token formats:
- `${ENV_VAR}` - Environment variable
- `${paths.dotfilesDir}` - Reference to another config value
- `${VAR:-default}` - Environment variable with default value
- `~` - Home directory expansion

## Tool Configuration Loading Process

The `loadToolConfigs` function performs the following steps:

1. **Recursive Scan**: Recursively scans the directory tree for all `.tool.ts` files
2. **Dynamic Import**: Dynamically imports each module using `import()`
3. **Function Detection**: Detects whether the export is a function or direct object
4. **Builder Execution**: If function, creates a `ToolConfigBuilder` and executes the function
5. **Context Provision**: Provides a `ToolConfigContext` with paths and utilities
6. **Validation**: Validates the resulting configuration against Zod schemas
7. **Return Mapping**: Returns a record mapping tool names to validated configurations

### Tool Configuration Patterns

**Function Export (Recommended)**:
```typescript
export default (c: ToolConfigBuilder, ctx: ToolConfigContext) => {
  c.bin('tool')
    .version('1.0.0')
    .install('github-release', { repo: 'owner/tool' });
};
```

**Function with Return Value**:
```typescript
export default (c: ToolConfigBuilder, ctx: ToolConfigContext): ToolConfig => {
  return {
    name: 'tool',
    version: '1.0.0',
    binaries: ['tool'],
    installationMethod: 'github-release',
    installParams: { repo: 'owner/tool' },
  };
};
```

**Direct Object Export**:
```typescript
export default {
  name: 'tool',
  version: '1.0.0',
  binaries: ['tool'],
  installationMethod: 'manual',
  installParams: {},
};
```

## Error Handling

The package provides detailed error messages and logging for various failure scenarios:

### Configuration File Not Found
```
ERROR Config file not found: /path/to/config.yaml
```

### YAML Parse Errors
```
ERROR Failed to parse YAML configuration /path/to/config.yaml: Unexpected token
```

### Schema Validation Errors
```
ERROR Configuration validation failed:
  paths.binariesDir: Expected string, received undefined
  paths.targetDir: Expected string, received undefined
```

### Tool Configuration Errors
```
ERROR Failed to load configuration: tools/fzf.tool.ts
ERROR Failed to parse ToolConfig configuration tools/fzf.tool.ts: Builder validation failed
  installParams.repo: Required for github-release installation method
```

### Tool Name Mismatch
```
WARN Invalid tool config object name: "fzf-tool" (expected filename: fzf)
```

## Dependencies

- `@dotfiles/file-system` - File system operations
- `@dotfiles/logger` - Structured logging
- `@dotfiles/schemas` - Configuration schemas and type definitions
- `@dotfiles/tool-config-builder` - Builder for tool configurations
- `@dotfiles/utils` - Utilities including path expansion and CLI helpers
- `zod` - Runtime schema validation

## Testing

Run tests:
```bash
bun test packages/config
```

### Testing Helpers

```typescript
import { createMemFileSystem, createMockProjectConfig } from '@dotfiles/testing-helpers';

// Create in-memory file system with config files
const fs = createMemFileSystem({
  '/config.yaml': 'paths:\n  homeDir: /test',
  '/tools/fzf.tool.ts': 'export default (c) => c.bin("fzf")',
});

// Create mock project config
const projectConfig = createMockProjectConfig({
  paths: {
    toolConfigsDir: '/custom/tools',
  },
});

// Load configuration in tests
const config = await loadProjectConfig(logger, fs, '/config.yaml', systemInfo, {});
```

## Type Safety

All configurations are fully typed:

```typescript
import type { ProjectConfig, ToolConfig } from '@dotfiles/schemas';

const projectConfig: ProjectConfig = await loadProjectConfig(/*...*/);
const toolConfigs: Record<string, ToolConfig> = await loadToolConfigs(/*...*/);

// TypeScript provides full autocomplete and type checking
console.log(projectConfig.paths.binariesDir);  // string
console.log(projectConfig.configFilePath);      // string (injected by loader)
console.log(toolConfigs['fzf'].version);     // string
```

## Design Philosophy

### Type-Safe Configuration
All configuration is validated at runtime with Zod schemas and provides full TypeScript types, catching errors early in the development process.

### Platform Awareness
Built-in support for platform-specific overrides allows a single configuration file to work across macOS, Linux, and Windows with different architectures.

### Flexible Tool Configuration
Tool configurations can be:
- Simple objects for basic tools
- Functions for complex configuration logic
- Organized in subdirectories for better structure

### Token Substitution
Environment variables and config references can be used throughout configuration, enabling flexible deployment across different environments.

### Dependency Injection
The `IConfigService` interface allows for easy mocking in tests and swapping implementations without changing consuming code.
