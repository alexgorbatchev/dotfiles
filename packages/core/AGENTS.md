# @dotfiles/installer-plugin-system

Core plugin infrastructure for the installer system. Provides the registry, base interfaces, and type system for installer plugins.

## Purpose

This package enables the plugin-based architecture for tool installers. It provides:

- `IInstallerPlugin` interface that all plugins must implement
- `InstallerPluginRegistry` for managing and dispatching to plugins
- Base types and utilities for plugin development
- Schema composition for runtime validation

## Key Concepts

### Plugin Interface

All installer plugins implement the `IInstallerPlugin` interface:

```typescript
interface IInstallerPlugin<TMethod, TParams, TConfig, TMetadata> {
  readonly method: TMethod;
  readonly displayName: string;
  readonly version: string;
  readonly paramsSchema: z.ZodType<TParams>;
  readonly toolConfigSchema: z.ZodType<TConfig>;
  
  install(/* ... */): Promise<InstallResult<TMetadata>>;
  validate?(/* ... */): Promise<ValidationResult>;
  initialize?(/* ... */): Promise<void>;
  cleanup?(): Promise<void>;
}
```

### Plugin Registry

The registry manages all registered plugins and handles dispatching:

```typescript
const registry = new InstallerPluginRegistry(logger);

// Register plugins
registry.register(new GitHubReleasePlugin(downloader, githubClient));
registry.register(new BrewPlugin());

// Compose schemas
registry.composeSchemas();

// Install using registered plugin
const result = await registry.install('github-release', toolName, config, context);
```

## API

### InstallerPluginRegistry

Main registry class for managing plugins.

#### Methods

- `register(plugin)` - Register a plugin (fails fast on error)
- `get(method)` - Get a plugin by method name
- `has(method)` - Check if a plugin is registered
- `getAll()` - Get all registered plugins
- `getMethods()` - Get all registered method names
- `composeSchemas()` - Compose schemas from all plugins (call once after registration)
- `getToolConfigSchema()` - Get the composed tool config schema
- `install(method, toolName, config, context, options)` - Execute installation via plugin

### Types

- `IInstallerPlugin<TMethod, TParams, TConfig, TMetadata>` - Plugin interface
- `InstallResult<TMetadata>` - Result from plugin installation
- `ValidationResult` - Result from plugin validation
- `IInstallOptions` - Options passed to install method

## Usage

### Creating a Plugin

```typescript
import type { IInstallerPlugin, InstallResult } from '@dotfiles/installer-plugin-system';

export class MyInstallerPlugin implements IInstallerPlugin<'my-method', MyParams, MyConfig, MyMetadata> {
  readonly method = 'my-method';
  readonly displayName = 'My Installer';
  readonly version = '1.0.0';
  readonly paramsSchema = myParamsSchema;
  readonly toolConfigSchema = myToolConfigSchema;
  readonly staticValidation = true;
  
  constructor(private myService: MyService) {}
  
  async validate(context: BaseInstallContext): Promise<ValidationResult> {
    // Validate plugin can run in this environment
    return { valid: true };
  }
  
  async install(
    toolName: string,
    toolConfig: MyConfig,
    context: BaseInstallContext,
    options?: IInstallOptions,
    logger?: TsLogger
  ): Promise<InstallResult<MyMetadata>> {
    // Implement installation logic
    return {
      success: true,
      version: '1.0.0',
      binaryPaths: ['/path/to/binary'],
      metadata: { method: 'my-method' }
    };
  }
}
```

### Registering Plugins

```typescript
// In application startup (main.ts)
import { InstallerPluginRegistry } from '@dotfiles/installer-plugin-system';
import { MyInstallerPlugin } from '@mycompany/installer-plugin';

const registry = new InstallerPluginRegistry(logger);

// Register all plugins
registry.register(new MyInstallerPlugin(myService));

// Compose schemas once
registry.composeSchemas();

// Pass registry to services
const installer = new Installer(logger, fs, registry, /* ... */);
```

## Dependencies

- `@dotfiles/logger` - Structured logging
- `@dotfiles/schemas` - Type definitions and base types
- `zod` - Runtime schema validation

## Design Principles

1. **Registry is created once** at application startup
2. **No plugins can be added** after schema composition
3. **Registration failures are fatal** - fail fast
4. **Plugins are isolated** - no inter-plugin dependencies
5. **Validation caching** - static validations are cached

## Testing

Plugins can be tested in isolation:

```typescript
describe('MyInstallerPlugin', () => {
  it('should install tool', async () => {
    const registry = new InstallerPluginRegistry(logger);
    const plugin = new MyInstallerPlugin(mockService);
    
    registry.register(plugin);
    registry.composeSchemas();
    
    const result = await registry.install('my-method', 'tool', config, context);
    expect(result.success).toBe(true);
  });
});
```
