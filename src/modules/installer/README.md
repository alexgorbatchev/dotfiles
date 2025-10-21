# Installer Module

The installer module provides a comprehensive system for installing CLI tools from various sources with a unified, extensible architecture. It supports multiple installation methods, lifecycle hooks, and provides robust error handling and logging.

## Architecture Overview

The installer system is built around three main architectural patterns:

1. **Method-Based Installation**: Traditional installation methods for different sources (GitHub releases, Homebrew, curl scripts, etc.)
2. **Step-Based Pipeline**: Composable installation steps that can be combined into flexible pipelines
3. **Shared Utilities**: Common functionality extracted to eliminate code duplication

### Core Components

```
src/modules/installer/
├── Installer.ts                 # Main installer class
├── IInstaller.ts               # Installer interface and types
├── InstallationPipeline.ts     # Pipeline orchestrator
├── HookExecutor.ts             # Lifecycle hook execution
├── BinarySetupService.ts       # Binary installation and setup
├── steps/                      # Installation step implementations
├── utils/                      # Shared utilities
└── install*.ts                 # Method-based installers
```

## Installation Methods

The installer supports six installation methods:

### 1. GitHub Release (`installFromGitHubRelease`)
Downloads and installs tools from GitHub releases.

```typescript
const toolConfig: GithubReleaseToolConfig = {
  name: 'fzf',
  binaries: ['fzf'],
  version: 'latest',
  installationMethod: 'github-release',
  installParams: {
    repo: 'junegunn/fzf',
    assetPattern: 'fzf-{version}-{platform}_{arch}.tar.gz'
  }
};
```

### 2. Homebrew (`installFromBrew`)
Installs tools using Homebrew package manager.

```typescript
const toolConfig: BrewToolConfig = {
  name: 'jq',
  binaries: ['jq'],
  installationMethod: 'brew',
  installParams: {
    formula: 'jq'
  }
};
```

### 3. Curl Script (`installFromCurlScript`)
Downloads and executes installation scripts.

```typescript
const toolConfig: CurlScriptToolConfig = {
  name: 'rustup',
  binaries: ['rustup', 'cargo'],
  installationMethod: 'curl-script',
  installParams: {
    url: 'https://sh.rustup.rs',
    args: ['-y']
  }
};
```

### 4. Curl Tar (`installFromCurlTar`)
Downloads and extracts tar archives from URLs.

```typescript
const toolConfig: CurlTarToolConfig = {
  name: 'node',
  binaries: ['node', 'npm'],
  installationMethod: 'curl-tar',
  installParams: {
    url: 'https://nodejs.org/dist/v18.17.0/node-v18.17.0-linux-x64.tar.xz'
  }
};
```

### 5. Cargo (`installFromCargo`)
Installs Rust tools using pre-compiled binaries from cargo-quickinstall or GitHub releases.

```typescript
const toolConfig: CargoToolConfig = {
  name: 'eza',
  binaries: ['eza'],
  version: 'latest',
  installationMethod: 'cargo',
  installParams: {
    crateName: 'eza',
    binarySource: 'cargo-quickinstall', // or 'github-releases'
    versionSource: 'cargo-toml', // or 'crates-io' or 'github-releases'
    githubRepo: 'eza-community/eza',
    customBinaries: ['eza'], // optional: override binary names
    assetPattern: '{crateName}-{version}-{arch}-{platform}.tar.gz' // for github-releases
  }
};
```

### 6. Manual (`installManually`)
Placeholder for tools that require manual installation.

```typescript
const toolConfig: ManualToolConfig = {
  name: 'custom-tool',
  binaries: ['custom-tool'],
  installationMethod: 'manual',
  installParams: {
    instructions: 'Please install manually from https://example.com'
  }
};
```

## Step-Based Pipeline Architecture

The step-based architecture provides a composable way to build installation pipelines:

### Available Steps

#### 1. DownloadStep
Downloads files from URLs with progress tracking.

```typescript
const downloadStep = new DownloadStep({
  url: 'https://example.com/tool.tar.gz',
  filename: 'tool.tar.gz',
  downloader: downloaderInstance
});
```

#### 2. ExtractStep
Extracts archive files to the installation directory.

```typescript
const extractStep = new ExtractStep({
  archiveExtractor: extractorInstance
});
```

#### 3. HookStep
Executes lifecycle hooks at specific points in the installation.

```typescript
const hookStep = new HookStep({
  hookType: 'afterDownload',
  hook: async (context) => {
    // Custom logic after download
  },
  hookExecutor: hookExecutorInstance
});
```

#### 4. BinarySetupStep
Sets up binaries from either archive extraction or direct download.

```typescript
const binarySetupStep = new BinarySetupStep({
  toolName: 'my-tool',
  setupType: 'archive' // or 'direct'
});
```

### Creating Custom Pipelines

```typescript
import { InstallationPipeline } from '@modules/installer';
import { createArchivePipeline } from '@modules/installer/utils';

// Using factory function
const steps = createArchivePipeline(
  url,
  filename,
  toolName,
  toolConfig,
  downloader,
  archiveExtractor,
  hookExecutor
);

// Execute pipeline
const pipeline = new InstallationPipeline(logger);
const result = await pipeline.execute(
  toolName,
  toolConfig,
  context,
  fileSystem,
  options,
  steps
);
```

## Lifecycle Hooks

The installer supports four lifecycle hooks that allow custom logic at different stages:

### Hook Types

1. **beforeInstall**: Executed before any installation steps
2. **afterDownload**: Executed after downloading files
3. **afterExtract**: Executed after extracting archives
4. **afterInstall**: Executed after all installation steps

### Hook Context

Hooks receive an enhanced context with access to:

```typescript
interface EnhancedInstallHookContext {
  toolName: string;
  version: string;
  installDir: string;
  extractDir?: string;
  downloadPath?: string;
  binaryPath?: string;
  fileSystem: IFileSystem;
  logger: TsLogger;
  $: typeof $; // ZX shell execution
}
```

### Example Hook Usage

```typescript
const toolConfig: GithubReleaseToolConfig = {
  name: 'example-tool',
  binaries: ['tool'],
  version: 'latest',
  installationMethod: 'github-release',
  installParams: {
    repo: 'example/tool',
    hooks: {
      afterExtract: async (context) => {
        // Create config directory
        const configDir = path.join(context.installDir, 'config');
        await context.fileSystem.ensureDir(configDir);
        
        // Create default config
        const configPath = path.join(configDir, 'default.yaml');
        await context.fileSystem.writeFile(
          configPath, 
          `version: ${context.version}\ninstall_dir: ${context.installDir}`
        );
        
        context.logger.info('Configuration setup completed');
      },
      
      afterInstall: async (context) => {
        // Make binary executable
        if (context.binaryPath) {
          await context.fileSystem.chmod(context.binaryPath, 0o755);
        }
      }
    }
  }
};
```

## Shared Utilities

The installer provides several shared utilities to eliminate code duplication:

### downloadWithProgress
Handles file downloads with progress tracking and caching.

```typescript
import { downloadWithProgress } from '@modules/installer/utils';

await downloadWithProgress(
  url,
  downloadPath,
  filename,
  downloader,
  options
);
```

### executeHooks
Centralized hook execution with error handling.

```typescript
import { executeAfterDownloadHook } from '@modules/installer/utils';

const result = await executeAfterDownloadHook(
  toolConfig,
  context,
  hookExecutor
);
```

### withInstallErrorHandling
Provides consistent error handling across all installation methods.

```typescript
import { withInstallErrorHandling } from '@modules/installer/utils';

const result = await withInstallErrorHandling(
  'github-release',
  toolName,
  logger,
  async () => {
    // Installation logic
    return { success: true, binaryPaths: [...] };
  }
);
```

### createToolFileSystem
Creates a tool-specific filesystem instance with proper tracking.

```typescript
import { createToolFileSystem } from '@modules/installer/utils';

const toolFs = createToolFileSystem(baseFileSystem, toolName);
```

## Creating a New Installation Method

To create a new installation method, you need to integrate it into multiple parts of the system. Here's the complete integration process:

### 1. Define Zod Schemas and Types

#### Step 1a: Create Install Parameters Schema
```typescript
// src/types/tool-config/myCustomInstallParamsSchema.ts
import { z } from 'zod';
import { baseInstallParamsSchema } from './baseInstallParamsSchema';
import { installHookSchema } from './installHookSchema';

export const myCustomInstallParamsSchema = baseInstallParamsSchema.extend({
  /**
   * Custom URL for the tool
   */
  customUrl: z.string(),

  /**
   * Optional custom options
   */
  customOptions: z.array(z.string()).optional(),

  /**
   * Installation hooks
   */
  hooks: z
    .object({
      beforeInstall: installHookSchema.optional(),
      afterDownload: installHookSchema.optional(),
      afterExtract: installHookSchema.optional(),
      afterInstall: installHookSchema.optional(),
    })
    .optional(),
});

export type MyCustomInstallParams = z.infer<typeof myCustomInstallParamsSchema>;
```

#### Step 1b: Create Tool Configuration Schema
```typescript
// src/types/tool-config/myCustomToolConfigSchema.ts
import { z } from 'zod';
import { baseToolConfigPropertiesSchema } from './baseToolConfigPropertiesSchema';
import { myCustomInstallParamsSchema } from './myCustomInstallParamsSchema';

export const myCustomToolConfigSchema = baseToolConfigPropertiesSchema.extend({
  installationMethod: z.literal('my-custom'),
  installParams: myCustomInstallParamsSchema,
});

export type MyCustomToolConfig = z.infer<typeof myCustomToolConfigSchema>;
```

#### Step 1c: Export from Index
```typescript
// src/types/tool-config/index.ts
export * from './myCustomInstallParamsSchema';
export * from './myCustomToolConfigSchema';
```

#### Step 1d: Add to Tool Config Schema Union
```typescript
// src/types/tool-config/toolConfigSchema.ts
import { myCustomToolConfigSchema } from './myCustomToolConfigSchema';

export const toolConfigSchema = z.discriminatedUnion('installationMethod', [
  githubReleaseToolConfigSchema,
  brewToolConfigSchema,
  cargoToolConfigSchema,
  curlScriptToolConfigSchema,
  curlTarToolConfigSchema,
  myCustomToolConfigSchema, // Add your schema here
  manualToolConfigSchema,
  noInstallToolConfigSchema,
]);
```

#### Step 1e: Add to Platform Config Schema
```typescript
// src/types/tool-config/platformConfigSchema.ts
import { myCustomInstallParamsSchema } from './myCustomInstallParamsSchema';

export const platformConfigSchema = commonToolConfigPropertiesSchema
  .extend({
    installationMethod: z
      .enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'cargo', 'my-custom', 'manual', 'none'])
      .optional(),
    installParams: z
      .union([
        githubReleaseInstallParamsSchema,
        brewInstallParamsSchema,
        curlScriptInstallParamsSchema,
        curlTarInstallParamsSchema,
        cargoInstallParamsSchema,
        myCustomInstallParamsSchema, // Add your params schema here
        manualInstallParamsSchema,
      ])
      .optional(),
  })
  .strict();
```

### 2. Add to ToolConfigBuilder Interface and Implementation

#### Step 2a: Add to Interface
```typescript
// src/types/toolConfigBuilder.types.ts
import type {
  // ... other imports
  MyCustomInstallParams,
} from './tool-config';

export interface PlatformConfigBuilder {
  // ... other methods
  install(method: 'my-custom', params: MyCustomInstallParams): this;
}

export interface ToolConfigBuilder {
  // ... other methods  
  install(method: 'my-custom', params: MyCustomInstallParams): this;
}
```

#### Step 2b: Add to Implementation
```typescript
// src/modules/tool-config-builder/toolConfigBuilder.ts
import type {
  // ... other imports
  MyCustomInstallParams,
  MyCustomToolConfig,
} from '@types';

export class ToolConfigBuilderImpl implements ToolConfigBuilderInterface {
  // Add to overloaded install method
  install(method: 'my-custom', params: MyCustomInstallParams): this;
  install(method: ToolConfigInstallationMethod, params: ToolConfigInstallParams): this {
    this.currentInstallationMethod = method;
    this.currentInstallParams = params;
    return this;
  }

  // Add to switch statement in buildInstallableConfig
  private buildInstallableConfig(): ToolConfig {
    // ... existing code
    switch (this.currentInstallationMethod) {
      // ... existing cases
      case 'my-custom':
        return {
          ...installableBase,
          installationMethod: 'my-custom',
          installParams: this.currentInstallParams,
        } as MyCustomToolConfig;
      // ... other cases
    }
  }

  // Update error message
  private throwInvalidMethodError(): never {
    const invalidMethodMessage = toolConfigBuilderLogMessages.configurationFieldInvalid(
      'installationMethod',
      this.currentInstallationMethod ?? 'unknown',
      'github-release | brew | curl-script | curl-tar | cargo | my-custom | manual'
    );
    this.logger.error(invalidMethodMessage);
    throw new Error(invalidMethodMessage);
  }
}
```

### 3. Create Installation Function

```typescript
// src/modules/installer/installFromMyCustom.ts
import path from 'node:path';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import { installerLogMessages } from './log-messages';
import type { BaseInstallContext, MyCustomInstallParams, MyCustomToolConfig } from '@types';
import type { HookExecutor } from './HookExecutor';
import type { InstallOptions, InstallResult } from './IInstaller';
import { createToolFileSystem, downloadWithProgress, getBinaryPaths, withInstallErrorHandling } from './utils';

export async function installFromMyCustom(
  toolName: string,
  toolConfig: MyCustomToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  fileSystem: IFileSystem,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromMyCustom' });
  logger.debug(installerLogMessages.lifecycle.methodStarted(toolName));

  if (!toolConfig.installParams) {
    return {
      success: false,
      error: 'Install parameters not specified',
    };
  }

  const params = toolConfig.installParams;

  const operation = async (): Promise<InstallResult> => {
    const toolFs = createToolFileSystem(fileSystem, toolName);

    // 1. Download phase
    const filename = `${toolName}-download`;
    const downloadPath = path.join(context.installDir, filename);

    await downloadWithProgress(params.customUrl, downloadPath, filename, downloader, options);

    // 2. Execute afterDownload hook
    const hookContext = { ...context, downloadPath };
    const afterDownloadResult = await executeAfterDownloadHook(
      toolConfig,
      hookExecutor,
      hookContext,
      downloadPath,
      toolFs,
      logger
    );
    if (!afterDownloadResult.success) {
      return afterDownloadResult;
    }

    // 3. Custom installation logic here
    // ... implement your specific installation steps ...

    // 4. Execute afterInstall hook
    const afterInstallResult = await executeAfterInstallHook(
      toolConfig,
      hookExecutor,
      hookContext,
      { extractedFiles: [] }, // or whatever result you have
      toolFs,
      logger
    );
    if (!afterInstallResult.success) {
      return afterInstallResult;
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      info: {
        customUrl: params.customUrl,
      },
    };
  };

  return withInstallErrorHandling('my-custom', toolName, logger, operation);
}

// Helper functions (similar to cargo installer)
async function executeAfterDownloadHook(
  toolConfig: MyCustomToolConfig,
  hookExecutor: HookExecutor,
  hookContext: BaseInstallContext & { downloadPath: string },
  downloadPath: string,
  toolFs: IFileSystem,
  logger: TsLogger
): Promise<InstallResult | { success: true }> {
  if (toolConfig.installParams?.hooks?.afterDownload) {
    const enhancedContext = hookExecutor.createEnhancedContext({ ...hookContext, downloadPath }, toolFs, logger);
    const hookResult = await hookExecutor.executeHook(
      'afterDownload',
      toolConfig.installParams.hooks.afterDownload,
      enhancedContext
    );
    if (!hookResult.success) {
      return { success: false, error: hookResult.error };
    }
  }
  return { success: true };
}

async function executeAfterInstallHook(
  toolConfig: MyCustomToolConfig,
  hookExecutor: HookExecutor,
  hookContext: BaseInstallContext,
  installResult: any,
  toolFs: IFileSystem,
  logger: TsLogger
): Promise<InstallResult | { success: true }> {
  if (toolConfig.installParams?.hooks?.afterInstall) {
    const enhancedContext = hookExecutor.createEnhancedContext({ ...hookContext, installResult }, toolFs, logger);
    const finalHookResult = await hookExecutor.executeHook(
      'afterInstall',
      toolConfig.installParams.hooks.afterInstall,
      enhancedContext
    );
    if (!finalHookResult.success) {
      return { success: false, error: finalHookResult.error };
    }
  }
  return { success: true };
}
```

### 4. Add to Main Installer Class

```typescript
// In src/modules/installer/Installer.ts
import { installFromMyCustom } from './installFromMyCustom';

export class Installer implements IInstaller {
  // Add to the switch statement in the install method
  async install(toolName: string, toolConfig: ToolConfig, options?: InstallOptions): Promise<InstallResult> {
    // ... existing code ...
    
    switch (toolConfig.installationMethod) {
      // ... existing cases
      case 'my-custom':
        result = await this.installFromMyCustom(toolName, toolConfig, context, options);
        break;
      // ... other cases
    }
  }

  // Add the delegation method
  public async installFromMyCustom(
    toolName: string,
    toolConfig: MyCustomToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return installFromMyCustom(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.archiveExtractor,
      this.hookExecutor,
      this.logger
    );
  }
}
```

### 5. Add Logging Templates (Optional)

```typescript
// src/modules/logger/templates/installer/debug.ts
export const installerDebugTemplates = {
  // ... existing templates
  installingFromMyCustom: () => createSafeLogMessage('Installing from my-custom: toolName=%s, customConfig=%o'),
  customProcessingStarted: () => createSafeLogMessage('Starting custom processing for %s'),
  customProcessingCompleted: () => createSafeLogMessage('Custom processing completed for %s'),
} satisfies SafeLogMessageMap;
```

### 6. Create Comprehensive Tests

```typescript
// src/modules/installer/__tests__/Installer--installFromMyCustom.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { MyCustomToolConfig } from '@types';
import { FetchMockHelper } from '@testing-helpers';
import { createInstallerTestSetup } from './installer-test-helpers';

describe('Installer - installFromMyCustom', () => {
  const fetchMockHelper = new FetchMockHelper();

  beforeEach(() => {
    fetchMockHelper.setup();
  });

  afterEach(() => {
    fetchMockHelper.restore();
  });

  it('should install tool using custom method', async () => {
    const setup = await createInstallerTestSetup();

    const toolConfig: MyCustomToolConfig = {
      name: 'test-tool',
      version: 'latest',
      binaries: ['test-tool'],
      installationMethod: 'my-custom',
      installParams: {
        customUrl: 'https://example.com/tool',
        customOptions: ['--feature', 'advanced'],
      },
    };

    const result = await setup.installer.install('test-tool', toolConfig);

    expect(result.success).toBe(true);
    expect(result.binaryPaths).toHaveLength(1);
  });

  it('should handle custom options correctly', async () => {
    // ... additional test cases
  });
});
```

### 7. Update Tool Configuration Files

Once your installer is integrated, you can use it in tool configuration files:

```typescript
// configs-migrated/my-tool/my-tool.tool.ts
import { Platform, type ToolConfigBuilder } from '../../src/types';

export default async (c: ToolConfigBuilder): Promise<void> => {
  c.bin('my-tool')
    .version('latest')
    .install('my-custom', {
      customUrl: 'https://example.com/releases/my-tool-latest.tar.gz',
      customOptions: ['--optimize'],
    })
    .platform(Platform.MacOS, async (c) => {
      c.install('my-custom', {
        customUrl: 'https://example.com/releases/my-tool-latest-macos.tar.gz',
      });
    });
};
```

### 8. Integration Checklist

When adding a new installation method, ensure you complete ALL of these steps:

#### Type System Integration:
- [ ] Create `{method}InstallParamsSchema.ts` with Zod schema
- [ ] Create `{method}ToolConfigSchema.ts` with tool config schema
- [ ] Export both schemas from `src/types/tool-config/index.ts`
- [ ] Add to `toolConfigSchema.ts` discriminated union
- [ ] Add to `platformConfigSchema.ts` enum and union
- [ ] Import types in `toolConfigBuilder.types.ts`
- [ ] Add method overload to `PlatformConfigBuilder` interface
- [ ] Add method overload to `ToolConfigBuilder` interface

#### ToolConfigBuilder Implementation:
- [ ] Import types in `toolConfigBuilder.ts`
- [ ] Add method overload to class implementation
- [ ] Add case to `buildInstallableConfig()` switch statement
- [ ] Update `throwInvalidMethodError()` message

#### Installer Integration:
- [ ] Create `installFrom{Method}.ts` implementation
- [ ] Import in `Installer.ts`
- [ ] Add case to `install()` method switch statement
- [ ] Add delegation method to `Installer` class
- [ ] Add logging templates (optional)

#### Testing:
- [ ] Create `Installer--installFrom{Method}.test.ts`
- [ ] Add test cases for different scenarios
- [ ] Update existing tests that check method lists
- [ ] Test platform-specific configurations

#### Documentation:
- [ ] Add method to this README
- [ ] Update tool configuration guide
- [ ] Add example configurations

### 9. Common Integration Issues

#### Missing Platform Resolution
If you see errors like "Unsupported installation method: none", it means the installer isn't resolving platform-specific configurations. The installer should use `resolvePlatformConfig()` before checking the installation method.

#### Type Errors in ToolConfigBuilder
If you get TypeScript errors when using your method in tool configs, ensure:
- Method is added to both interface overloads
- Types are properly imported
- Schema is added to the discriminated union

#### Circular Dependencies
Avoid importing schemas that depend on each other. Keep install params schemas separate from tool config schemas.

#### Missing Hook Support
Always implement hook support in your installer using the shared hook execution utilities.

### 10. Real-World Example: Cargo Installer Integration

The cargo installer serves as a complete example of proper integration:

1. **Schemas**: `cargoInstallParamsSchema.ts` and `cargoToolConfigSchema.ts`
2. **Types**: Exported from index and added to unions
3. **ToolConfigBuilder**: Method overloads and switch case added
4. **Implementation**: `installFromCargo.ts` with helper functions
5. **Integration**: Added to `Installer.ts` switch statement
6. **Testing**: Comprehensive test coverage
7. **Usage**: Used in `eza.tool.ts` configuration

This integration allows tools to be configured declaratively:

```typescript
c.install('cargo', {
  crateName: 'eza',
  binarySource: 'cargo-quickinstall',
  versionSource: 'cargo-toml',
  githubRepo: 'eza-community/eza',
});
```

Instead of complex manual hooks and shell commands.

## Alternative: Using Step-Based Pipeline

For more complex installation methods, consider using the step-based pipeline:

```typescript
// src/modules/installer/installFromMyCustomPipeline.ts
import { InstallationPipeline } from './InstallationPipeline';
import { createDownloadStep, createBinarySetupStep } from './utils/stepFactories';

export async function installFromMyCustomPipeline(
  toolName: string,
  toolConfig: MyCustomToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromMyCustomPipeline' });
  
  // Create custom steps
  const steps = [
    createDownloadStep(
      toolConfig.installParams.customUrl,
      'custom-file',
      context.downloader
    ),
    // Add custom step here
    new MyCustomProcessingStep({ customOptions: toolConfig.installParams.customOptions }),
    createBinarySetupStep(toolName, 'direct')
  ];

  // Execute pipeline
  const pipeline = new InstallationPipeline(logger);
  return pipeline.execute(
    toolName,
    toolConfig,
    context,
    context.fileSystem,
    options,
    steps
  );
}
```

## Best Practices

### 1. Use Shared Utilities
Always use the shared utilities to maintain consistency and avoid code duplication:

- `downloadWithProgress` for downloads
- `executeHooks` for hook execution
- `withInstallErrorHandling` for error handling
- `createToolFileSystem` for filesystem operations

### 2. Proper Error Handling
Wrap your installation logic with `withInstallErrorHandling`:

```typescript
return withInstallErrorHandling('method-name', toolName, logger, operation);
```

### 3. Structured Logging
Use the structured logging templates:

```typescript
logger.debug(installerLogMessages.downloadStep.downloadingAsset(filename, url));
logger.info(installerLogMessages.outcome.installSuccess(toolName, version, method));
```

### 4. Hook Support
Always support lifecycle hooks in your installation methods:

```typescript
// Execute hooks at appropriate points
await executeAfterDownloadHook(toolConfig, context, hookExecutor);
await executeAfterInstallHook(toolConfig, context, hookExecutor);
```

### 5. Testing
Create comprehensive tests using the shared test helpers:

```typescript
const setup = await createInstallerTestSetup();
// Use setup.installer, setup.mocks, setup.fs, etc.
```

## Migration from Legacy Code

If you have existing installation code that needs to be migrated:

1. **Extract common patterns** into the shared utilities
2. **Replace duplicated code** with utility function calls
3. **Add hook support** using the hook execution utilities
4. **Update error handling** to use `withInstallErrorHandling`
5. **Add structured logging** using the logging templates
6. **Create or update tests** using the shared test infrastructure

This architecture provides a robust, maintainable, and extensible foundation for tool installation while eliminating code duplication and ensuring consistency across all installation methods.