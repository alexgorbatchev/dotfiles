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

The installer supports five installation methods:

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

### 5. Manual (`installManually`)
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

To create a new installation method, follow these steps:

### 1. Define Tool Configuration Type

```typescript
// In src/types/tool-config/
export interface MyCustomToolConfig extends BaseToolConfigProperties {
  installationMethod: 'my-custom';
  installParams: MyCustomInstallParams;
}

export interface MyCustomInstallParams extends BaseInstallParams {
  customUrl: string;
  customOptions?: string[];
}
```

### 2. Create Installation Function

```typescript
// src/modules/installer/installFromMyCustom.ts
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, MyCustomToolConfig } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';
import { 
  downloadWithProgress,
  executeAfterDownloadHook,
  executeAfterInstallHook,
  withInstallErrorHandling,
  createToolFileSystem,
  getBinaryPaths
} from './utils';

export async function installFromMyCustom(
  toolName: string,
  toolConfig: MyCustomToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromMyCustom' });
  logger.debug(logs.installer.debug.installingFromMyCustom(), toolName, toolConfig.installParams);

  const operation = async (): Promise<InstallResult> => {
    const toolFs = createToolFileSystem(context.fileSystem, toolName);
    
    // 1. Download phase
    const downloadPath = path.join(context.installDir, 'downloaded-file');
    await downloadWithProgress(
      toolConfig.installParams.customUrl,
      downloadPath,
      'downloaded-file',
      context.downloader,
      options
    );

    // 2. Execute afterDownload hook
    const hookContext = { ...context, downloadPath, toolFs };
    const hookResult = await executeAfterDownloadHook(
      toolConfig,
      hookContext,
      context.hookExecutor
    );
    if (!hookResult.success) {
      return { success: false, error: hookResult.error };
    }

    // 3. Custom installation logic
    // ... implement your custom installation steps ...

    // 4. Execute afterInstall hook
    const finalHookResult = await executeAfterInstallHook(
      toolConfig,
      hookContext,
      context.hookExecutor
    );
    if (!finalHookResult.success) {
      return { success: false, error: finalHookResult.error };
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      info: {
        customUrl: toolConfig.installParams.customUrl,
      },
    };
  };

  return withInstallErrorHandling('my-custom', toolName, logger, operation);
}
```

### 3. Add to Main Installer

```typescript
// In src/modules/installer/Installer.ts
import { installFromMyCustom } from './installFromMyCustom';

// Add to the switch statement in the install method
case 'my-custom':
  return this.installFromMyCustom(toolName, toolConfig as MyCustomToolConfig, context, options);

// Add the method
private async installFromMyCustom(
  toolName: string,
  toolConfig: MyCustomToolConfig,
  context: BaseInstallContext,
  options?: InstallOptions
): Promise<InstallResult> {
  return installFromMyCustom(toolName, toolConfig, context, options, this.logger);
}
```

### 4. Create Tests

```typescript
// src/modules/installer/__tests__/Installer--installFromMyCustom.test.ts
import { describe, expect, it } from 'bun:test';
import { createInstallerTestSetup } from './installer-test-helpers';

describe('Installer - installFromMyCustom', () => {
  it('should install tool using custom method', async () => {
    const setup = await createInstallerTestSetup();
    
    const toolConfig = {
      name: 'test-tool',
      binaries: ['test-tool'],
      installationMethod: 'my-custom' as const,
      installParams: {
        customUrl: 'https://example.com/tool',
      },
    };

    const result = await setup.installer.install('test-tool', toolConfig);
    
    expect(result.success).toBe(true);
    expect(result.binaryPaths).toHaveLength(1);
  });
});
```

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
logger.debug(logs.installer.debug.downloadingAsset(), filename, url);
logger.info(logs.installer.success.installationCompleted(), toolName);
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