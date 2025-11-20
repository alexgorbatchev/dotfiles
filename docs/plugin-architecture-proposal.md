# Plugin Architecture Proposal for Tool Installers

## Executive Summary

This document proposes a plugin-based architecture for the tool installer system, enabling third-party installation methods to be distributed as NPM packages. The current architecture hardcodes all installation methods throughout the codebase, requiring modifications to multiple files when adding new installers. The proposed solution uses a registry-based plugin system with TypeScript module augmentation to maintain type safety while enabling zero-modification extension.

## Current Architecture Analysis

### Problem Areas

#### 1. ToolConfigBuilder Type System

**Location**: `packages/tool-config-builder/src/toolConfigBuilder.ts`

```typescript
// Hardcoded method overloads
install(method: 'github-release', params: GithubReleaseInstallParams): this;
install(method: 'brew', params: BrewInstallParams): this;
install(method: 'curl-script', params: CurlScriptInstallParams): this;
install(method: 'curl-tar', params: CurlTarInstallParams): this;
install(method: 'cargo', params: CargoInstallParams): this;
install(method: 'manual', params: ManualInstallParams): this;
```

**Issues**:
- Every new installer requires adding an overload
- Parameters are tightly coupled to method names
- No mechanism for external extension
- Switch statement in `buildInstallableToolConfig()` requires modification

#### 2. Schema System

**Location**: `packages/schemas/src/tool-config/toolConfigSchema.ts`

```typescript
export const toolConfigSchema = z.discriminatedUnion('installationMethod', [
  githubReleaseToolConfigSchema,
  brewToolConfigSchema,
  cargoToolConfigSchema,
  curlScriptToolConfigSchema,
  curlTarToolConfigSchema,
  manualToolConfigSchema,
]);
```

**Issues**:
- Discriminated union hardcoded with all schemas
- Cannot dynamically extend at runtime
- Third-party installers cannot add their schemas
- All schemas must be known at compile time

#### 3. Installer Class

**Location**: `packages/installer/src/Installer.ts`

```typescript
switch (resolvedToolConfig.installationMethod) {
  case 'github-release':
    return await this.installFromGitHubRelease(/*...*/);
  case 'brew':
    return await this.installFromBrew(/*...*/);
  case 'cargo':
    return await this.installFromCargo(/*...*/);
  case 'curl-script':
    return await this.installFromCurlScript(/*...*/);
  case 'curl-tar':
    return await this.installFromCurlTar(/*...*/);
  case 'manual':
    return await this.installManually(/*...*/);
  default:
    return { success: false, error: 'Unsupported method' };
}
```

**Issues**:
- Switch statement requires modification for each installer
- Public methods hardcoded for each installer
- No dynamic dispatch mechanism
- Testing requires modification of core class

#### 4. Type Import Graph

**Files affected when adding a new installer**:
1. `packages/schemas/src/tool-config/installation-methods/index.ts` - export new types
2. `packages/schemas/src/tool-config/installation-methods/installParams.ts` - add to union
3. `packages/schemas/src/tool-config/toolConfigSchema.ts` - add to discriminated union
4. `packages/schemas/src/tool-config/builder.types.ts` - add overload signatures
5. `packages/tool-config-builder/src/toolConfigBuilder.ts` - add overload, switch case
6. `packages/installer/src/Installer.ts` - add switch case, public method
7. `packages/installer/src/installers/index.ts` - export installer function

**Impact**: 7+ files require modification for each new installer

## Design Goals

### Primary Goals

1. **NPM Installability**: Third-party installers distributed as separate packages
2. **Zero-Modification Extension**: Add installers without modifying core code
3. **Type Safety**: Maintain full TypeScript type checking and inference
4. **Backwards Compatibility**: Existing code continues to work
5. **Developer Experience**: Simple API for creating plugins

### Secondary Goals

1. **Runtime Discovery**: Plugins can be discovered at runtime
2. **Validation**: Plugin validation at registration time
3. **Documentation**: Auto-generate documentation from plugins
4. **Testing**: Isolated testing of plugins
5. **Performance**: No performance degradation from plugin system

## Proposed Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (CLI, Tool Configs, User Code)                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Plugin Registry System                      │
│  - Plugin discovery and registration                         │
│  - Schema composition                                        │
│  - Type augmentation coordination                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Core Installer Infrastructure                   │
│  - Base interfaces and types                                 │
│  - Common utilities (hooks, steps, pipelines)               │
│  - Context management                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┬────────────┐
           ▼             ▼             ▼            ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Built-in │  │ Built-in │  │ Built-in │  │3rd Party │
    │ GitHub   │  │ Brew     │  │ Cargo    │  │ Custom   │
    │ Plugin   │  │ Plugin   │  │ Plugin   │  │ Plugin   │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Component Design

#### 1. Plugin Interface

```typescript
// packages/installer-plugin-system/src/types.ts

import type { z } from 'zod';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext } from '@dotfiles/schemas';

/**
 * Core plugin interface that all installer plugins must implement
 */
export interface InstallerPlugin<
  TMethod extends string = string,
  TParams = unknown,
  TConfig = unknown,
  TMetadata = unknown
> {
  /** Unique method name (e.g., 'github-release', 'npm') */
  readonly method: TMethod;
  
  /** Human-readable display name */
  readonly displayName: string;
  
  /** Plugin version (semver) */
  readonly version: string;
  
  /** Plugin description */
  readonly description?: string;
  
  /** Zod schema for installation parameters */
  readonly paramsSchema: z.ZodType<TParams>;
  
  /** Zod schema for complete tool config */
  readonly toolConfigSchema: z.ZodType<TConfig>;
  
  /** Installation function */
  install(
    toolName: string,
    toolConfig: TConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
    logger?: TsLogger
  ): Promise<InstallResult<TMetadata>>;
  
  /** Optional: Validate plugin can run in current environment */
  validate?(context: BaseInstallContext): Promise<ValidationResult>;
  
  /** Optional: Plugin initialization */
  initialize?(registry: InstallerPluginRegistry): Promise<void>;
  
  /** Optional: Plugin cleanup */
  cleanup?(): Promise<void>;
}

/**
 * Result from plugin installation
 */
export interface InstallResult<TMetadata = unknown> {
  success: boolean;
  error?: string;
  version?: string;
  binaryPaths?: string[];
  metadata?: TMetadata;
}

/**
 * Plugin validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
```

#### 2. Plugin Registry

```typescript
// packages/installer-plugin-system/src/InstallerPluginRegistry.ts

import type { TsLogger } from '@dotfiles/logger';
import type { InstallerPlugin } from './types';

/**
 * Central registry for installer plugins
 */
export class InstallerPluginRegistry {
  private plugins = new Map<string, InstallerPlugin>();
  private logger: TsLogger;
  
  constructor(logger: TsLogger) {
    this.logger = logger.getSubLogger({ name: 'InstallerPluginRegistry' });
  }
  
  /**
   * Register a plugin
   */
  register<T extends InstallerPlugin>(plugin: T): void {
    const { method } = plugin;
    
    // Validate plugin
    if (!method || typeof method !== 'string') {
      throw new Error('Plugin must have a valid method name');
    }
    
    if (this.plugins.has(method)) {
      this.logger.warn(`Plugin ${method} is already registered, replacing...`);
    }
    
    // Initialize plugin if needed
    if (plugin.initialize) {
      await plugin.initialize(this);
    }
    
    this.plugins.set(method, plugin);
    this.logger.info(`Registered installer plugin: ${method} (${plugin.displayName} v${plugin.version})`);
  }
  
  /**
   * Get a plugin by method name
   */
  get(method: string): InstallerPlugin | undefined {
    return this.plugins.get(method);
  }
  
  /**
   * Check if a plugin is registered
   */
  has(method: string): boolean {
    return this.plugins.has(method);
  }
  
  /**
   * Get all registered plugins
   */
  getAll(): InstallerPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get all method names
   */
  getMethods(): string[] {
    return Array.from(this.plugins.keys());
  }
  
  /**
   * Compose schemas from all registered plugins
   */
  composeToolConfigSchema(): z.ZodDiscriminatedUnion<'installationMethod', any[]> {
    const schemas = this.getAll().map(plugin => plugin.toolConfigSchema);
    
    if (schemas.length === 0) {
      throw new Error('No plugins registered');
    }
    
    return z.discriminatedUnion('installationMethod', schemas);
  }
  
  /**
   * Compose install params union from all registered plugins
   */
  composeInstallParamsSchema(): z.ZodUnion<any[]> {
    const schemas = this.getAll().map(plugin => plugin.paramsSchema);
    
    if (schemas.length === 0) {
      throw new Error('No plugins registered');
    }
    
    return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  
  /**
   * Execute installation using appropriate plugin
   */
  async install(
    method: string,
    toolName: string,
    toolConfig: any,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    const plugin = this.get(method);
    
    if (!plugin) {
      return {
        success: false,
        error: `No plugin registered for installation method: ${method}. Available methods: ${this.getMethods().join(', ')}`
      };
    }
    
    // Validate plugin can run
    if (plugin.validate) {
      const validation = await plugin.validate(context);
      if (!validation.valid) {
        return {
          success: false,
          error: `Plugin validation failed: ${validation.errors?.join(', ')}`
        };
      }
    }
    
    // Execute installation
    return await plugin.install(toolName, toolConfig, context, options, this.logger);
  }
}
```

#### 3. TypeScript Module Augmentation

```typescript
// Third-party plugin package: @myorg/installer-custom

// types.ts - Define plugin-specific types
export interface CustomInstallParams {
  customUrl: string;
  customOptions?: Record<string, string>;
}

export interface CustomToolConfig {
  name: string;
  version: string;
  binaries: string[];
  installationMethod: 'custom';
  installParams: CustomInstallParams;
  // ... other common fields
}

// augmentation.ts - Extend core types
declare module '@dotfiles/schemas' {
  // Extend ToolConfigBuilder interface
  export interface ToolConfigBuilder {
    install(method: 'custom', params: CustomInstallParams): this;
  }
  
  export interface PlatformConfigBuilder {
    install(method: 'custom', params: CustomInstallParams): this;
  }
}

// plugin.ts - Implement plugin
export class CustomInstallerPlugin implements InstallerPlugin {
  readonly method = 'custom';
  readonly displayName = 'Custom Installer';
  readonly version = '1.0.0';
  readonly paramsSchema = customInstallParamsSchema;
  readonly toolConfigSchema = customToolConfigSchema;
  
  async install(
    toolName: string,
    toolConfig: CustomToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    // Implementation
  }
}
```

#### 4. Modified ToolConfigBuilder

```typescript
// packages/tool-config-builder/src/toolConfigBuilder.ts

export class ToolConfigBuilder implements ToolConfigBuilderInterface {
  // ... existing code ...
  
  // Generic install method that works with any registered plugin
  install<TMethod extends string>(
    method: TMethod,
    params: any
  ): this {
    // Validate method is registered
    if (!this.pluginRegistry.has(method)) {
      throw new Error(
        `Installation method '${method}' is not registered. ` +
        `Available methods: ${this.pluginRegistry.getMethods().join(', ')}`
      );
    }
    
    this.currentInstallationMethod = method;
    this.currentInstallParams = params;
    return this;
  }
  
  private buildInstallableToolConfig(baseConfig: any): ToolConfig {
    // Dynamic dispatch based on method - no switch statement needed
    const plugin = this.pluginRegistry.get(this.currentInstallationMethod);
    
    if (!plugin) {
      throw new Error(`No plugin found for method: ${this.currentInstallationMethod}`);
    }
    
    // Validate params against plugin schema
    const validation = plugin.paramsSchema.safeParse(this.currentInstallParams);
    if (!validation.success) {
      throw new Error(`Invalid params for ${this.currentInstallationMethod}: ${validation.error}`);
    }
    
    return {
      ...baseConfig,
      installationMethod: this.currentInstallationMethod,
      installParams: this.currentInstallParams,
    };
  }
}
```

#### 5. Modified Installer Class

**CRITICAL: The switch statement is COMPLETELY REMOVED. The Installer class has NO knowledge of specific installers.**

```typescript
// packages/installer/src/Installer.ts

export class Installer implements IInstaller {
  constructor(
    private logger: TsLogger,
    private fs: IFileSystem,
    private pluginRegistry: InstallerPluginRegistry,
    // ... other dependencies
  ) {
    this.logger = logger.getSubLogger({ name: 'Installer' });
  }
  
  /**
   * Install a tool - delegates entirely to plugin registry
   * NO switch statement, NO hardcoded knowledge of installers
   */
  async install(
    toolName: string,
    toolConfig: ToolConfig,
    options?: InstallOptions
  ): Promise<InstallResult> {
    const logger = this.logger.getSubLogger({ name: 'install' });

    // Resolve platform-specific configuration
    const systemInfo = this.getSystemInfo();
    const resolvedToolConfig = resolvePlatformConfig(toolConfig, systemInfo);

    // Create context
    const context = this.createContext(toolName, resolvedToolConfig);

    // Check if should skip installation
    const shouldSkip = await this.shouldSkipInstallation(
      toolName,
      resolvedToolConfig,
      options,
      logger
    );
    if (shouldSkip) {
      return {
        success: false,
        error: `Tool ${toolName} is already installed. Use --force to reinstall.`,
      };
    }

    // Execute hooks if needed
    await this.executeBeforeInstallHook(toolName, resolvedToolConfig, context, logger);

    // Delegate to plugin registry - it handles ALL dispatch
    const result = await this.pluginRegistry.install(
      resolvedToolConfig.installationMethod,
      toolName,
      resolvedToolConfig,
      context,
      options
    );

    // Execute post-install hooks
    if (result.success) {
      await this.executeAfterInstallHook(toolName, resolvedToolConfig, context, logger);
    }

    return result;
  }
}
```

### Built-in Plugin Migration

Each existing installer becomes a plugin:

```typescript
// packages/installer-github/src/index.ts

export class GitHubReleaseInstallerPlugin implements InstallerPlugin {
  readonly method = 'github-release';
  readonly displayName = 'GitHub Release';
  readonly version = '1.0.0';
  readonly description = 'Install tools from GitHub release assets';
  readonly paramsSchema = githubReleaseInstallParamsSchema;
  readonly toolConfigSchema = githubReleaseToolConfigSchema;
  
  async install(
    toolName: string,
    toolConfig: GithubReleaseToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
    logger?: TsLogger
  ): Promise<InstallResult<GithubReleaseInstallMetadata>> {
    // Move existing installFromGitHubRelease logic here
  }
}
```

### Application Initialization (Where Plugins Get Registered)

**This is the KEY - plugins are registered at application startup, NOT in library code:**

```typescript
// packages/cli/src/main.ts (or wherever services are initialized)

import { InstallerPluginRegistry } from '@dotfiles/installer-plugin-system';
import { Installer } from '@dotfiles/installer';

// Import built-in plugins
import { GitHubReleaseInstallerPlugin } from '@dotfiles/installer-github';
import { BrewInstallerPlugin } from '@dotfiles/installer-brew';
import { CargoInstallerPlugin } from '@dotfiles/installer-cargo';
import { CurlScriptInstallerPlugin } from '@dotfiles/installer-curl-script';
import { CurlTarInstallerPlugin } from '@dotfiles/installer-curl-tar';
import { ManualInstallerPlugin } from '@dotfiles/installer-manual';

// Import third-party plugins (user adds these to package.json)
import { CustomInstallerPlugin } from '@mycompany/dotfiles-installer-custom';

async function initializeServices() {
  // Create registry
  const registry = new InstallerPluginRegistry(logger);
  
  // Register ALL plugins (built-in + third-party)
  registry.register(new GitHubReleaseInstallerPlugin());
  registry.register(new BrewInstallerPlugin());
  registry.register(new CargoInstallerPlugin());
  registry.register(new CurlScriptInstallerPlugin());
  registry.register(new CurlTarInstallerPlugin());
  registry.register(new ManualInstallerPlugin());
  
  // User's custom plugin - just add it to package.json and import it here
  registry.register(new CustomInstallerPlugin());
  
  // Create installer with registry
  const installer = new Installer(
    logger,
    fs,
    registry,  // Registry is injected
    downloader,
    githubClient,
    cargoClient,
    archiveExtractor,
  projectConfig,
    toolRegistry,
    systemInfo
  );
  
  return { installer, registry, /* other services */ };
}
```

**How a user adds a third-party installer:**

1. `npm install @mycompany/dotfiles-installer-custom`
2. Add import and registration in `main.ts`:
   ```typescript
   import { CustomInstallerPlugin } from '@mycompany/dotfiles-installer-custom';
   registry.register(new CustomInstallerPlugin());
   ```
3. Done! No modification of node_modules needed.

**Alternative: Auto-discovery (Optional Enhancement)**

```typescript
// Scan package.json for installer plugins
async function autoRegisterPlugins(registry: InstallerPluginRegistry) {
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  // Look for packages matching pattern
  const installerPlugins = Object.keys(dependencies)
    .filter(name => name.startsWith('@dotfiles/installer-') || 
                    name.includes('dotfiles-installer-'));
  
  // Dynamically import and register
  for (const pluginName of installerPlugins) {
    const plugin = await import(pluginName);
    if (plugin.default && plugin.default.prototype instanceof InstallerPlugin) {
      registry.register(new plugin.default());
    }
  }
}
```

### Package Structure

```
@dotfiles/
├── installer-plugin-system/      # Core plugin infrastructure
│   ├── src/
│   │   ├── InstallerPluginRegistry.ts
│   │   ├── types.ts
│   │   └── index.ts
│   └── package.json
│
├── installer/                     # Main installer (uses plugins)
│   ├── src/
│   │   ├── Installer.ts          # Modified to use registry
│   │   └── index.ts
│   └── package.json
│
├── installer-github/              # Built-in GitHub plugin
│   ├── src/
│   │   ├── GitHubReleaseInstallerPlugin.ts
│   │   ├── types.ts              # Type augmentation
│   │   └── index.ts
│   └── package.json
│
├── installer-brew/                # Built-in Homebrew plugin
├── installer-cargo/               # Built-in Cargo plugin
├── installer-curl-script/         # Built-in curl-script plugin
├── installer-curl-tar/            # Built-in curl-tar plugin
└── installer-manual/              # Built-in manual plugin

# Third-party packages
@myorg/
└── dotfiles-installer-npm/        # Example third-party plugin
    ├── src/
    │   ├── NpmInstallerPlugin.ts
    │   ├── types.ts              # Module augmentation
    │   └── index.ts
    └── package.json
```

## Implementation Details

### 1. Dependency Injection

**Everything is passed down through constructors:**

```typescript
// Plugin receives all dependencies in constructor
export class GitHubReleaseInstallerPlugin implements InstallerPlugin {
  constructor(
    private downloader: IDownloader,
    private githubClient: IGitHubApiClient,
    private archiveExtractor: IArchiveExtractor
  ) {}
  
  async install(/* ... */): Promise<InstallResult> {
    // Use injected dependencies
    await this.downloader.download(url, destination);
    const release = await this.githubClient.getLatestRelease(repo);
  }
}

// Registration in main.ts
const githubPlugin = new GitHubReleaseInstallerPlugin(
  downloader,
  githubClient,
  archiveExtractor
);
registry.register(githubPlugin);
```

### 2. Hook Execution

**Hooks are handled OUTSIDE of plugins, by the Installer class:**

```typescript
// Installer class handles hook lifecycle
export class Installer {
  async install(toolName: string, toolConfig: ToolConfig): Promise<InstallResult> {
    // Hooks are in toolConfig.installParams.hooks
    const hooks = toolConfig.installParams.hooks;
    
    // Execute beforeInstall hook
    if (hooks?.beforeInstall) {
      await hooks.beforeInstall(context);
    }
    
    // Delegate to plugin (plugin doesn't know about hooks)
    const result = await this.pluginRegistry.install(
      toolConfig.installationMethod,
      toolName,
      toolConfig,
      context,
      options
    );
    
    // Execute afterInstall hook
    if (result.success && hooks?.afterInstall) {
      await hooks.afterInstall(context);
    }
    
    return result;
  }
}

// Plugins don't execute hooks themselves
export class GitHubReleaseInstallerPlugin {
  async install(/* ... */): Promise<InstallResult> {
    // Just do the installation, no hook execution
    await this.downloadAndExtract();
    return { success: true };
  }
}
```

### 3. Common Utilities

**Utilities remain in the same package as installers (for now):**

```typescript
// packages/installer/src/utils/index.ts
export { createToolFileSystem } from './createToolFileSystem';
export { downloadWithProgress } from './downloadWithProgress';
export { getBinaryPaths } from './getBinaryPaths';
export { withInstallErrorHandling } from './withInstallErrorHandling';

// Plugin packages import from installer
import { downloadWithProgress, getBinaryPaths } from '@dotfiles/installer/utils';

export class GitHubReleaseInstallerPlugin {
  async install(/* ... */): Promise<InstallResult> {
    await downloadWithProgress(url, dest, this.downloader);
    const paths = await getBinaryPaths(extractDir, patterns);
  }
}
```

### 4. Registry Lifecycle

**Registry is created once at application startup:**

```typescript
// packages/cli/src/main.ts

// Singleton registry created at startup
let registryInstance: InstallerPluginRegistry | null = null;

export async function initializeServices() {
  // Create registry once
  const registry = new InstallerPluginRegistry(logger);
  
  // Register all plugins
  registry.register(new GitHubReleaseInstallerPlugin(downloader, githubClient, extractor));
  registry.register(new BrewInstallerPlugin());
  // ... etc
  
  // After this, NO MORE PLUGINS can be added
  registryInstance = registry;
  
  // Pass registry to all services that need it
  const installer = new Installer(logger, fs, registry, /* ... */);
  const toolConfigBuilder = new ToolConfigBuilder(logger, registry);
  
  return { installer, registry, /* ... */ };
}
```

**Testing:**
```typescript
// Each test creates its own registry with only needed plugins
describe('GitHub Release Installer', () => {
  it('should install from GitHub', async () => {
    const registry = new InstallerPluginRegistry(logger);
    registry.register(new GitHubReleaseInstallerPlugin(downloader, githubClient, extractor));
    
    const installer = new Installer(logger, fs, registry, /* ... */);
    // Test...
  });
});
```

### 5. Schema Composition

**Schemas are composed ONCE after all plugins are registered:**

```typescript
export class InstallerPluginRegistry {
  private composedToolConfigSchema?: z.ZodDiscriminatedUnion<any, any>;
  
  /**
   * Compose schemas once after all plugins registered
   */
  composeSchemas(): void {
    const schemas = this.getAll().map(plugin => plugin.toolConfigSchema);
    this.composedToolConfigSchema = z.discriminatedUnion('installationMethod', schemas);
  }
  
  /**
   * Get the composed schema (throws if not composed yet)
   */
  getToolConfigSchema(): z.ZodDiscriminatedUnion<any, any> {
    if (!this.composedToolConfigSchema) {
      throw new Error('Schemas not composed. Call composeSchemas() after registering all plugins.');
    }
    return this.composedToolConfigSchema;
  }
}

// In main.ts
async function initializeServices() {
  const registry = new InstallerPluginRegistry(logger);
  
  // Register all plugins
  registry.register(/*...*/);
  registry.register(/*...*/);
  
  // Compose schemas once
  registry.composeSchemas();
  
  // Now schema is cached and reused for all validations
}
```

### 6. Error Handling

**Plugin registration failures are fatal:**

```typescript
export class InstallerPluginRegistry {
  async register(plugin: InstallerPlugin): Promise<void> {
    try {
      // Validate plugin
      if (!plugin.method) {
        throw new Error('Plugin must have a method name');
      }
      
      // Initialize plugin
      if (plugin.initialize) {
        await plugin.initialize(this);
      }
      
      this.plugins.set(plugin.method, plugin);
      this.logger.info(`Registered: ${plugin.method}`);
      
    } catch (error) {
      // Fail fast - don't skip invalid plugins
      this.logger.error(`Failed to register plugin ${plugin.method}:`, error);
      throw new Error(`Plugin registration failed: ${plugin.method}`);
    }
  }
}
```

### 7. Plugin Validation Caching

**Validation results are cached if they don't change:**

```typescript
export class InstallerPluginRegistry {
  private validationCache = new Map<string, ValidationResult>();
  
  async install(method: string, /* ... */): Promise<InstallResult> {
    const plugin = this.get(method);
    
    if (plugin.validate) {
      // Check cache first
      let validation = this.validationCache.get(method);
      
      if (!validation) {
        // Run validation and cache result
        validation = await plugin.validate(context);
        
        // Only cache if validation is based on static conditions
        // (OS, architecture, etc.) not dynamic state
        if (this.isStaticValidation(plugin)) {
          this.validationCache.set(method, validation);
        }
      }
      
      if (!validation.valid) {
        return { success: false, error: validation.errors?.join(', ') };
      }
    }
    
    return await plugin.install(/* ... */);
  }
  
  private isStaticValidation(plugin: InstallerPlugin): boolean {
    // Plugins can declare if their validation is static
    return plugin.staticValidation ?? false;
  }
}

// Plugin declares static validation
export class BrewInstallerPlugin implements InstallerPlugin {
  readonly staticValidation = true; // Validation based on OS only
  
  async validate(context: BaseInstallContext): Promise<ValidationResult> {
    // Check if Homebrew is available (doesn't change during runtime)
    const hasHomebrew = await checkHomebrewInstalled();
    return { valid: hasHomebrew, errors: hasHomebrew ? [] : ['Homebrew not installed'] };
  }
}
```

## Type Safety Strategy

### 1. ToolConfig Type Generation (Module Augmentation)

**Core provides an interface that plugins extend:**

```typescript
// packages/schemas/src/tool-config/toolConfigSchema.ts

/**
 * Registry interface that plugins augment to register their config types
 */
export interface ToolConfigRegistry {
  // Empty initially - plugins add to this via declaration merging
}

/**
 * Union of all registered tool configs
 * Automatically includes all plugin configs that extend ToolConfigRegistry
 */
export type ToolConfig = ToolConfigRegistry[keyof ToolConfigRegistry];

/**
 * Base interface that all tool configs must implement
 */
export interface ToolConfigBase {
  name: string;
  version: string;
  binaries: string[];
  installationMethod: string;
  installParams: unknown;
  // ... other common fields
}
```

**Built-in plugins extend the registry:**

```typescript
// packages/installer-github/src/types.ts

export interface GithubReleaseToolConfig extends ToolConfigBase {
  installationMethod: 'github-release';
  installParams: GithubReleaseInstallParams;
}

// Augment the registry
declare module '@dotfiles/schemas' {
  interface ToolConfigRegistry {
    'github-release': GithubReleaseToolConfig;
  }
}
```

**Third-party plugins do the same:**

```typescript
// @mycompany/dotfiles-installer-npm

export interface NpmToolConfig extends ToolConfigBase {
  installationMethod: 'npm';
  installParams: NpmInstallParams;
}

// Augment the registry
declare module '@dotfiles/schemas' {
  interface ToolConfigRegistry {
    'npm': NpmToolConfig;
  }
}
```

**Result: ToolConfig is automatically a union of all registered plugins:**

```typescript
// After all plugins are imported, TypeScript sees:
type ToolConfig = 
  | GithubReleaseToolConfig 
  | BrewToolConfig
  | CargoToolConfig
  | NpmToolConfig  // Third-party plugin
  | ...
```

### 2. ToolConfigBuilder Augmentation

**Each plugin extends the builder interface:**

```typescript
// In plugin package
declare module '@dotfiles/schemas' {
  interface ToolConfigBuilder {
    install(method: 'my-method', params: MyParams): this;
  }
  
  interface PlatformConfigBuilder {
    install(method: 'my-method', params: MyParams): this;
  }
}
```

**TypeScript merges all declarations automatically:**

```typescript
// After all plugins imported, TypeScript sees:
interface ToolConfigBuilder {
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'npm', params: NpmInstallParams): this; // Third-party
  // ...
}
```

### 3. Schema Composition at Runtime

```typescript
// Runtime validation uses composed schema from registry
const registry = new InstallerPluginRegistry(logger);

// Register plugins
registry.register(new GitHubReleasePlugin());
registry.register(new NpmPlugin());

// Compose schemas once
registry.composeSchemas();

// Use for validation
const schema = registry.getToolConfigSchema();
const result = schema.safeParse(config);
```

### 4. Type Guards

```typescript
// Each plugin exports type guards
export function isCustomToolConfig(config: ToolConfig): config is CustomToolConfig {
  return config.installationMethod === 'custom';
}

// Usage in code
if (isCustomToolConfig(config)) {
  // TypeScript knows config is CustomToolConfig
  const url = config.installParams.customUrl; // Type-safe
}
```

## Migration Strategy

### Phase 1: Infrastructure (Week 1)

1. Create `@dotfiles/installer-plugin-system` package
2. Define core plugin interfaces
3. Implement `InstallerPluginRegistry`
4. Create plugin base classes and utilities
5. Write comprehensive tests for plugin system

### Phase 2: Built-in Plugin Migration (Week 2-3)

1. Create plugin packages for built-ins:
   - `@dotfiles/installer-github`
   - `@dotfiles/installer-brew`
   - `@dotfiles/installer-cargo`
   - `@dotfiles/installer-curl-script`
   - `@dotfiles/installer-curl-tar`
   - `@dotfiles/installer-manual`

2. Move installer logic to plugin classes (copy existing functions)
3. Add type augmentation files
4. Write plugin-specific tests
5. **Delete old installer files** from core package

### Phase 3: Core Refactoring (Week 4)

1. **Remove switch statement** from `Installer` class
2. **Remove all installer imports** from `Installer`
3. Update `Installer` constructor to require registry
4. Update `ToolConfigBuilder` to use registry validation
5. Update schema composition to use registry
6. **Delete all installation-method specific code** from core

### Phase 4: Application Integration (Week 5)

1. Update `main.ts` to import all plugin packages
2. Update `main.ts` to register plugins
3. Update services factory to create registry
4. Update all tests to register required plugins
5. Run full test suite and fix failures

### Phase 5: Documentation & Release (Week 6)

1. Update all documentation
2. Create plugin development guide  
3. Add example third-party plugin
4. Write migration guide for users
5. Update CHANGELOG with breaking changes
6. Release as v2.0.0 (major version bump)

## Breaking Changes

This is a **major version release** with breaking changes:

### What Changes

1. **Installer class constructor** - now requires `InstallerPluginRegistry`
2. **All built-in installers** - moved to separate packages
3. **Application initialization** - must register plugins at startup
4. **Import paths** - installers import from plugin packages

### What Stays the Same

1. **Tool config syntax** - `c.install('github-release', { ... })` works identically
2. **Type safety** - full TypeScript support maintained
3. **API surface** - ToolConfigBuilder interface unchanged for built-ins
4. **Tool configs** - existing `.tool.ts` files work as-is

### Migration Required

Users must update their `main.ts` or initialization code to register plugins. This is a **one-time change** per application.

## Example: Third-Party Plugin

```typescript
// @mycompany/dotfiles-installer-apt
// npm install @mycompany/dotfiles-installer-apt

import type { InstallerPlugin } from '@dotfiles/installer-plugin-system';

// Define types
export interface AptInstallParams {
  package: string;
  ppa?: string;
  version?: string;
}

// Type augmentation
declare module '@dotfiles/schemas' {
  interface ToolConfigBuilder {
    install(method: 'apt', params: AptInstallParams): this;
  }
  
  interface PlatformConfigBuilder {
    install(method: 'apt', params: AptInstallParams): this;
  }
}

// Implement plugin
export class AptInstallerPlugin implements InstallerPlugin {
  readonly method = 'apt';
  readonly displayName = 'APT Package Manager';
  readonly version = '1.0.0';
  readonly paramsSchema = aptInstallParamsSchema;
  readonly toolConfigSchema = aptToolConfigSchema;
  
  async validate(context: BaseInstallContext): Promise<ValidationResult> {
    // Check if running on Debian/Ubuntu
    const isDebianBased = await checkIsDebianBased();
    return {
      valid: isDebianBased,
      errors: isDebianBased ? [] : ['APT installer only works on Debian-based systems']
    };
  }
  
  async install(
    toolName: string,
    toolConfig: AptToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    const { package: packageName, ppa, version } = toolConfig.installParams;
    
    // Add PPA if specified
    if (ppa) {
      await $`sudo add-apt-repository -y ${ppa}`;
      await $`sudo apt update`;
    }
    
    // Install package
    const versionSpec = version ? `=${version}` : '';
    await $`sudo apt install -y ${packageName}${versionSpec}`;
    
    return {
      success: true,
      version: await getInstalledVersion(packageName),
      metadata: { method: 'apt', package: packageName }
    };
  }
}

// Usage in tool config
import { AptInstallerPlugin } from '@mycompany/dotfiles-installer-apt';

// Register plugin (done once at app startup)
registry.register(new AptInstallerPlugin());

// Use in tool config
export default async (c: ToolConfigBuilder) => {
  c.bin('jq')
    .version('latest')
    .install('apt', {
      package: 'jq'
    });
};
```

## Complete User Workflow

### Adding a Third-Party Installer

**Step 1: Install the plugin package**
```bash
npm install @mycompany/dotfiles-installer-npm
```

**Step 2: Import and register in your application**
```typescript
// packages/cli/src/main.ts

// Add this import
import { NpmInstallerPlugin } from '@mycompany/dotfiles-installer-npm';

// Add this registration (where other plugins are registered)
registry.register(new NpmInstallerPlugin());
```

**Step 3: Use in tool configs**
```typescript
// test/tools/node.tool.ts

export default async (c: ToolConfigBuilder) => {
  c.bin(['node', 'npm', 'npx'])
    .version('20.0.0')
    .install('npm', {  // New method from plugin
      package: 'node',
      global: false
    });
};
```

**That's it!** No modification of node_modules, no changes to core packages.

### How It Works Internally

1. **User imports plugin**: `import { CustomPlugin } from '@custom/plugin'`
2. **User registers plugin**: `registry.register(new CustomPlugin())`
3. **Registry stores plugin**: `plugins.set('custom-method', pluginInstance)`
4. **User writes tool config**: `c.install('custom-method', { ... })`
5. **Installer delegates to registry**: `registry.install('custom-method', ...)`
6. **Registry looks up plugin**: `plugins.get('custom-method')`
7. **Plugin executes**: `plugin.install(...)`

**The key insight**: The core `Installer` class has ZERO knowledge of specific installation methods. It only knows:
- Take a `toolConfig` with an `installationMethod` property
- Ask the registry to handle that method
- Return the result

The registry handles ALL dispatch. No switch statements. No hardcoded method names.

### File-by-File Comparison

**Before (Hardcoded)**:
```
Installer.ts (switch with 6 cases)
    ├─ import installFromGitHub
    ├─ import installFromBrew  
    ├─ import installFromCargo
    ├─ import installFromCurlScript
    ├─ import installFromCurlTar
    └─ import installManually
```

**After (Plugin-based)**:
```
Installer.ts (no switch, no installer imports)
    └─ pluginRegistry.install(method, ...)

main.ts (registration point)
    ├─ import GitHubPlugin
    ├─ import BrewPlugin
    ├─ import CargoPlugin
    ├─ import CustomPlugin (third-party)
    └─ registry.register(all plugins)
```

The switch statement **moves from library code to application code**, where users can modify it.

## Benefits

### For Core Maintainers

1. **Reduced Maintenance**: No need to maintain all installers
2. **Clear Boundaries**: Core vs plugin responsibilities
3. **Better Testing**: Plugins test independently
4. **Faster Iteration**: Changes to one installer don't affect others

### For Plugin Developers

1. **Easy Distribution**: Publish to NPM
2. **Versioning**: Independent version control
3. **Full Control**: Own implementation details
4. **Documentation**: Self-documenting through types

### For Users

1. **Flexibility**: Choose installers needed
2. **Extensibility**: Add custom installers
3. **Community**: Share installers
4. **Type Safety**: Full TypeScript support

## Risks & Mitigations

### Risk 1: TypeScript Complexity

**Risk**: Module augmentation can be tricky  
**Mitigation**: 
- Provide clear examples and templates
- Create plugin generator CLI tool
- Comprehensive documentation

### Risk 2: Breaking Changes

**Risk**: Major version release required  
**Mitigation**:
- Clear migration guide with examples
- Simple one-time change (add plugin registration)
- Tool configs remain unchanged
- Can provide migration script to automate changes

### Risk 3: Performance

**Risk**: Registry lookups add overhead  
**Mitigation**:
- Benchmark plugin system
- Cache plugin references
- Lazy-load plugins only when needed

### Risk 4: Discovery

**Risk**: Users may not know plugins exist  
**Mitigation**:
- Plugin marketplace/registry website
- CLI command to list available plugins
- Documentation of popular plugins

## Known Issues & Future Work

### TypeScript Integration Test Limitations

**Current State**: The TypeScript integration test in `packages/installer-plugin-system/src/__tests__/InstallerPluginRegistry--typescript-integration.test.ts` currently uses type casts (`as never`) to test with mock plugin method names. This is necessary because `ToolConfigBuilder` has hardcoded installation method types.

**Why This Matters**: This limitation demonstrates exactly why the plugin architecture is needed - it's currently impossible to extend the system with new installation methods without modifying core type definitions.

**Resolution (COMPLETED)**: ToolConfigBuilder has been updated to use the registry for validation. The test has been updated and now validates end-to-end plugin extensibility without type casts. ToolConfigBuilder accepts an optional InstallerPluginRegistry in the constructor and validates configurations against the registry's composed schema when available.

**Test Location**: `packages/installer-plugin-system/src/__tests__/InstallerPluginRegistry--typescript-integration.test.ts`

## Next Steps

1. **Review & Approval**: Get team feedback on proposal
2. **Proof of Concept**: Build minimal working prototype
3. **Performance Testing**: Ensure no regression
4. **Documentation**: Write plugin development guide
5. **Implementation**: Follow migration strategy phases
6. **Revisit TypeScript Tests**: ✅ COMPLETED - Integration test updated to work with registry-enabled ToolConfigBuilder

## Conclusion

The plugin architecture transforms the installer system from a monolithic design to a flexible, extensible platform. By using TypeScript module augmentation and a registry-based approach, we maintain type safety while enabling third-party extensions. The migration strategy ensures backwards compatibility while moving toward a more maintainable architecture.

This change positions the project for long-term growth, enabling community contributions and custom installation methods without requiring modifications to the core system.
