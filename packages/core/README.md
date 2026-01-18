# @dotfiles/core

Core types, schemas, and plugin registry for the dotfiles tool installer system. Provides the foundational type system, Zod schemas, and plugin interfaces used across all packages.

## Overview

The `@dotfiles/core` package serves as the foundation of the dotfiles system, defining the core interfaces, types, and schemas that enable the plugin-based architecture. It provides type-safe contracts for installer plugins, configuration schemas, and common data structures used throughout the system.

## Features

- **Plugin System**: Core interfaces and registry for installer plugins
- **Type Safety**: TypeScript interfaces with Zod runtime validation
- **Configuration Schemas**: Comprehensive schemas for tool configurations
- **Platform Support**: Platform-specific configuration and detection
- **Shell Integration**: Types for shell scripts and initialization
- **Extensibility**: Module augmentation for plugin registration

## Architecture

### Plugin Registry System

The core package uses TypeScript's module augmentation to create a type-safe plugin registry:

```typescript
// Plugins extend these registries via module augmentation
interface IInstallParamsRegistry {
  // 'method-name': MethodParams
}

interface IToolConfigRegistry {
  // 'method-name': MethodConfig
}

interface IPluginResultRegistry {
  // 'method-name': MethodResult
}
```

### Core Interfaces

#### IInstallerPlugin

The base interface all installer plugins must implement:

```typescript
interface IInstallerPlugin<TMethod, TParams, TConfig, TMetadata> {
  readonly method: TMethod;
  readonly displayName: string;
  readonly version: string;
  readonly description?: string;
  readonly staticValidation?: boolean;
  readonly externallyManaged?: boolean;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly toolConfigSchema: z.ZodTypeAny;

  install(
    toolName: string,
    toolConfig: TConfig,
    context: BaseInstallContext,
    options?: IInstallOptions,
    logger?: TsLogger,
  ): Promise<InstallResult<TMetadata>>;

  validate?(context: BaseInstallContext): Promise<ValidationResult>;
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;

  supportsUpdateCheck?(): boolean;
  checkUpdate?(/* ... */): Promise<UpdateCheckResult>;

  supportsUpdate?(): boolean;
  updateTool?(/* ... */): Promise<UpdateResult>;

  supportsReadme?(): boolean;
  getReadmeUrl?(toolName: string, toolConfig: TConfig): string | null;
}
```

## Core Types

### Result Types

Standard result types for operations:

```typescript
interface IOperationSuccess {
  success: true;
}

interface IOperationFailure {
  success: false;
  error: string;
}

type InstallResult<TMetadata> =
  | (OperationSuccess & {
    version?: string;
    binaryPaths?: string[];
    metadata?: TMetadata;
    installationMethod?: string;
  })
  | (OperationFailure & {
    installationMethod?: string;
  });
```

### Context Types

```typescript
interface IBaseToolContext {
  projectConfig: ProjectConfig;
  systemInfo: ISystemInfo;
  toolName: string;
  toolDir: string;
  currentDir: string;
  replaceInFile: BoundReplaceInFile; // Regex-based file text replacement
  log: IToolLog; // User-facing logger for tool operations
}

// User-facing logging interface for tool configurations
interface IToolLog {
  trace(message: string): void;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

interface IToolConfigContext extends IBaseToolContext {}

interface IInstallContext extends IBaseToolContext {
  toolConfig: ToolConfig;
  stagingDir: string;
  installedDir?: string;
  timestamp: string;
}
```

## Configuration Schemas

### Tool Configuration

The core package provides schemas for tool configurations:

```typescript
// Base tool config properties
const baseToolConfigPropertiesSchema = z.object({
  version: z.string().optional(),
  binaries: z.array(binaryConfigSchema).optional(),
  symlinks: z.array(symlinkConfigSchema).optional(),
  shell: shellConfigsSchema.optional(),
  updateCheck: toolConfigUpdateCheckSchema.optional(),
});

// Platform-specific overrides
const platformConfigSchema = z.object({
  darwin: baseToolConfigPropertiesSchema.optional(),
  linux: baseToolConfigPropertiesSchema.optional(),
  // ... other platforms
});
```

### Installation Methods

Each plugin defines its own installation parameters schema:

```typescript
// Example: GitHub Release plugin params
const githubReleaseParamsSchema = z.object({
  repo: z.string(),
  assetPatterns: z.array(z.string()),
  extractPath: z.string().optional(),
});
```

## Platform Support

### Platform Types

```typescript
type SystemType = 'darwin' | 'linux' | 'win32';
type ArchType = 'x64' | 'arm64' | 'x86';
type CpuType = 'intel' | 'arm' | 'amd';

interface IPlatformInfo {
  system: SystemType;
  arch: ArchType;
  cpu: CpuType;
}
```

### Platform Configuration

```typescript
interface IPlatformConfig {
  system?: SystemType | SystemType[];
  arch?: ArchType | ArchType[];
  cpu?: CpuType | CpuType[];
}
```

## Shell Execution

The core package provides a shell execution interface for running system commands with proper dependency injection.

### Shell Types

```typescript
/**
 * Shell factory function - callable with template literals.
 */
interface Shell {
  (strings: TemplateStringsArray, ...values: unknown[]): ShellCommand;
  (command: string): ShellCommand;
}

/**
 * Result of a shell command execution.
 */
interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Chainable shell command builder with fluent API.
 */
interface ShellCommand extends PromiseLike<ShellResult> {
  cwd(path: string): ShellCommand;
  env(vars: Record<string, string | undefined>): ShellCommand;
  quiet(): ShellCommand;
  noThrow(): ShellCommand;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  lines(): Promise<string[]>;
  bytes(): Promise<Uint8Array>;
}
```

### createShell

Creates a shell instance for executing system commands.

```typescript
import { createShell } from '@dotfiles/core';

// Create a shell instance
const shell = createShell();

// Execute commands using template literals
const result = await shell`echo hello`;
console.log(result.stdout); // "hello\n"

// Use fluent API for options
const output = await shell`ls -la`.cwd('/tmp').quiet().text();

// Parse JSON output
const data = await shell`cat package.json`.json();

// Get lines as array
const files = await shell`ls`.lines();

// Don't throw on errors
const result = await shell`exit 1`.noThrow();
console.log(result.code); // 1
```

**Usage Pattern**: Shell instances should be created once at application entry point and passed to all components that need shell execution. This follows dependency injection principles and enables testing.

```typescript
// In main.ts - create once
const shell = createShell();

// Pass to components
const extractor = new ArchiveExtractor(logger, fs, shell);
const completionGenerator = new CompletionGenerator(logger, fs, shell);
```

## Shell Configuration Types

### ShellType

```typescript
type ShellType = 'zsh' | 'bash' | 'fish';

interface IShellScript {
  type: 'path' | 'env' | 'custom';
  priority: number;
  content: string;
}

interface IShellCompletionConfig {
  shell: ShellType;
  source: string | string[];
  inline?: string;
}
```

## Builder API

### Tool Config Builder Types

```typescript
interface IToolConfigBuilder<TMethod> {
  version(version: string): this;
  binary(config: BinaryConfig): this;
  binaries(configs: BinaryConfig[]): this;
  dependsOn(...binaryNames: string[]): this;
  symlink(config: SymlinkConfig): this;
  shell(config: ShellConfigs): this;
  platform(system: SystemType, config: PlatformSpecificConfig): this;
  build(): ToolConfigRegistry[TMethod];
}
```

## Plugin Registration

### Registering a Plugin

Plugins use module augmentation to register their types:

```typescript
// In your plugin package
declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    'my-method': MyMethodParams;
  }

  interface IToolConfigRegistry {
    'my-method': MyMethodToolConfig;
  }

  interface IPluginResultRegistry {
    'my-method': MyMethodResult;
  }
}
```

### Creating a Plugin

```typescript
import type { BaseInstallContext, IInstallerPlugin } from '@dotfiles/core';

export const myPlugin: IInstallerPlugin<'my-method', MyMethodParams, MyMethodToolConfig, MyMethodMetadata> = {
  method: 'my-method',
  displayName: 'My Method',
  version: '1.0.0',
  paramsSchema: myMethodParamsSchema,
  toolConfigSchema: myMethodToolConfigSchema,

  async install(toolName, toolConfig, context, options, logger) {
    // Implementation
    return {
      success: true,
      version: '1.0.0',
      binaryPaths: ['/path/to/binary'],
    };
  },
};
```

## Validation

### Plugin Validation

```typescript
interface IValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// Example validation
async validate(context: BaseInstallContext): Promise<ValidationResult> {
  const errors: string[] = [];

  if (context.system !== 'darwin') {
    errors.push('This plugin only works on macOS');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

## Utilities

### Deep Partial Type

```typescript
type PartialDeep<T> = /* deep partial implementation */;

// Usage in tests
const partialContext: PartialDeep<BaseInstallContext> = {
  homeDir: '/test/home',
  // Other fields are optional
};
```

## Installation Hooks

```typescript
interface InstallHooks {
  preInstall?: (context: BaseToolContext) => Promise<void>;
  postInstall?: (context: BaseToolContext, result: InstallResult) => Promise<void>;
  preExtract?: (context: BaseToolContext) => Promise<void>;
  postExtract?: (context: BaseToolContext) => Promise<void>;
}
```

## Update Support

### Update Checking

```typescript
type UpdateCheckResult =
  | { success: true; hasUpdate: boolean; currentVersion?: string; latestVersion?: string; }
  | { success: false; error: string; };
```

### Update Operations

```typescript
interface IUpdateOptions {
  force?: boolean;
  targetVersion?: string;
}

type UpdateResult = { success: true; oldVersion?: string; newVersion?: string; } | { success: false; error: string; };
```

## Usage

### In Application Code

```typescript
import { type BaseInstallContext, type InstallResult } from '@dotfiles/core';

async function installTool(context: BaseInstallContext): Promise<InstallResult> {
  // Use core types
}
```

### In Plugin Development

```typescript
import {
  type BaseInstallContext,
  type IInstallerPlugin,
  type InstallResult,
} from '@dotfiles/core';

export const myPlugin: IInstallerPlugin<> /* ... */ = {
  // Implementation
};
```

### In Configuration

```typescript
import type { ToolConfig } from '@dotfiles/core';

const toolConfig: ToolConfig = {
  method: 'github-release',
  version: '1.0.0',
  // ...
};
```

## Dependencies

### Internal Dependencies

- `@dotfiles/file-system` - File system abstractions
- `@dotfiles/logger` - Logging infrastructure
- All installer plugins (for type augmentation)

### External Dependencies

- `zod` - Runtime type validation
- `type-fest` - TypeScript utility types

## Plugin Ecosystem

The core package is designed to work with these installer plugins:

- `@dotfiles/installer-github` - GitHub Releases
- `@dotfiles/installer-brew` - Homebrew packages
- `@dotfiles/installer-cargo` - Rust Cargo binaries
- `@dotfiles/installer-curl-tar` - Tarball downloads
- `@dotfiles/installer-curl-script` - Script downloads
- `@dotfiles/installer-manual` - Manual installations

## Type Safety

The plugin registry system provides complete type safety:

```typescript
// Type-safe plugin method
const config: ToolConfigRegistry['github-release'] = {
  method: 'github-release',
  repo: 'owner/repo',
  // TypeScript knows the exact shape
};

// Type-safe result
const result: PluginResultRegistry['github-release'] = await install(/* ... */);
```

## Best Practices

### Plugin Development

1. Always use module augmentation to register types
2. Provide comprehensive Zod schemas for validation
3. Implement optional methods when applicable (update, validate, etc.)
4. Use descriptive method names (e.g., 'github-release', not 'gh')
5. Document metadata types thoroughly

### Configuration Design

1. Use platform-specific overrides sparingly
2. Provide sensible defaults
3. Validate all inputs with Zod schemas
4. Document all configuration options

### Type Usage

1. Import types explicitly (not entire module)
2. Use branded types for clarity
3. Leverage type inference where possible
4. Document complex type transformations

## Testing

The core package is tested through its usage in plugins and the installer system. Integration tests verify:

- Plugin registration and type augmentation
- Schema validation
- Result type correctness
- Platform detection

## Design Decisions

### Why Module Augmentation?

Module augmentation allows plugins to:

- Register types without modifying core
- Maintain type safety across packages
- Enable intellisense for plugin-specific configs
- Create a strongly-typed registry

### Why Zod Schemas?

Zod provides:

- Runtime type validation
- Type inference from schemas
- Composable schema definitions
- Clear error messages

### Why Separate Registries?

Separate registries for params, configs, and results:

- Allow independent evolution
- Provide clear contracts
- Enable better type inference
- Simplify plugin development

## Future Enhancements

Potential improvements:

- Plugin lifecycle events
- Dependency management between plugins
- Plugin composition patterns
- Enhanced validation framework
- Plugin discovery mechanism
- Dynamic plugin loading
