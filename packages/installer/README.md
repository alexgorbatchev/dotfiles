# @dotfiles/installer

A comprehensive system for installing CLI tools from various sources with a unified, extensible architecture. Supports multiple installation methods, lifecycle hooks, and provides robust error handling and logging.

## Package Structure

```
packages/installer/
├── src/
│   ├── index.ts                    # Main exports
│   ├── types.ts                    # Type definitions
│   ├── Installer.ts                # Main installer orchestrator
│   ├── clients/                    # API clients
│   │   ├── cargo/                  # Cargo/crates.io client
│   │   │   ├── CargoClient.ts
│   │   │   ├── CargoClientError.ts
│   │   │   └── ICargoClient.ts
│   │   └── github/                 # GitHub API client
│   │       ├── GitHubApiClient.ts
│   │       ├── GitHubApiClientError.ts
│   │       └── IGitHubApiClient.ts
│   ├── methods/                    # Installation methods
│   │   ├── installFromBrew.ts
│   │   ├── installFromCargo.ts
│   │   ├── installFromCurlScript.ts
│   │   ├── installFromCurlTar.ts
│   │   ├── installFromGitHubRelease.ts
│   │   └── installManually.ts
│   ├── utils/                      # Shared utilities
│   │   ├── BinarySetupService.ts
│   │   ├── HookExecutor.ts
│   │   ├── InstallationPipeline.ts
│   │   ├── commonUtils.ts
│   │   ├── hookExecutors.ts
│   │   ├── log-messages.ts
│   │   └── stepFactories.ts
│   └── __tests__/                  # Comprehensive test suite
└── README.md
```

## Architecture Overview

The installer system is built around three core architectural patterns:

### 1. Method-Based Installation
Traditional installation methods for different sources (GitHub releases, Homebrew, curl scripts, Cargo, etc.)

### 2. Client-Based API Access
Specialized API clients for external services:
- **GitHubApiClient**: Interfaces with GitHub API for releases and rate limits
- **CargoClient**: Interfaces with crates.io and cargo-quickinstall

### 3. Shared Utilities
Common functionality to eliminate code duplication:
- Download management with progress tracking
- Hook execution framework
- Binary setup and symlinking
- Error handling wrappers

## API Clients

### GitHubApiClient

Interfaces with the GitHub API for fetching releases and managing rate limits.

**Features:**
- Fetch latest releases or specific release by tag
- Get all releases with pagination support
- Find releases by version constraint (semver)
- Rate limit monitoring
- Built-in caching support
- Custom GitHub host support (for enterprise)

**Example Usage:**
```typescript
import { GitHubApiClient } from '@dotfiles/installer/clients/github';

const client = new GitHubApiClient(logger, config, downloader, cache);

// Get latest release
const release = await client.getLatestRelease('owner', 'repo');

// Get release by semver constraint
const matchingRelease = await client.getReleaseByConstraint('owner', 'repo', '^1.0.0');

// Check rate limits
const rateLimit = await client.getRateLimit();
```

### CargoClient

Interfaces with Cargo/crates.io ecosystem for Rust tools.

**Features:**
- Fetch crate metadata from crates.io
- Parse Cargo.toml from GitHub repositories
- Get latest version information
- Support for cargo-quickinstall binary sources

**Example Usage:**
```typescript
import { CargoClient } from '@dotfiles/installer/clients/cargo';

const client = new CargoClient(logger, config, downloader);

// Get crate metadata
const metadata = await client.getCrateMetadata('eza');

// Parse Cargo.toml
const packageInfo = await client.getCargoTomlPackage(
  'https://raw.githubusercontent.com/eza-community/eza/main/Cargo.toml'
);

// Get latest version
const version = await client.getLatestVersion('ripgrep');
```

## Installation Methods

The installer supports six installation methods:

### 1. GitHub Release
Downloads and installs tools from GitHub releases with flexible asset selection.

**Features:**
- Automatic platform/architecture detection
- Custom asset pattern matching
- Custom asset selector functions
- Archive extraction support
- Direct binary download support

**Example:**
```typescript
const toolConfig: GithubReleaseToolConfig = {
  name: 'fzf',
  binaries: ['fzf'],
  version: 'latest',
  installationMethod: 'github-release',
  installParams: {
    repo: 'junegunn/fzf',
    assetPattern: '*linux*amd64*.tar.gz',
    hooks: {
      afterExtract: async (context) => {
        // Custom post-extraction logic
      }
    }
  }
};
```

### 2. Homebrew
Installs tools using the Homebrew package manager.

**Features:**
- Formula and cask support
- Custom tap support
- Force reinstall option
- **Automatic version tracking** via `brew info --json`

**Example:**
```typescript
const toolConfig: BrewToolConfig = {
  name: 'jq',
  binaries: ['jq'],
  installationMethod: 'brew',
  installParams: {
    formula: 'jq',
    tap: 'homebrew/core'
  }
};
```

**Version Information:**
The installer automatically queries Homebrew for the installed version and includes it in the result. This enables the tool to be registered in the installation registry for upgrade tracking. If version fetching fails, the installation still succeeds but without version information.

### 3. Curl Script
Downloads and executes installation scripts.

**Example:**
```typescript
const toolConfig: CurlScriptToolConfig = {
  name: 'rustup',
  binaries: ['rustup', 'cargo'],
  installationMethod: 'curl-script',
  installParams: {
    url: 'https://sh.rustup.rs',
    shell: 'bash'
  }
};
```

### 4. Curl Tar
Downloads and extracts tar archives from URLs.

**Example:**
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

### 5. Cargo
Installs Rust tools using pre-compiled binaries from cargo-quickinstall or GitHub releases.

**Features:**
- Multiple binary sources (cargo-quickinstall, GitHub releases)
- Multiple version sources (Cargo.toml, crates.io, GitHub releases)
- Automatic platform/architecture detection
- Custom asset pattern support

**Example:**
```typescript
const toolConfig: CargoToolConfig = {
  name: 'eza',
  binaries: ['eza'],
  version: 'latest',
  installationMethod: 'cargo',
  installParams: {
    crateName: 'eza',
    binarySource: 'cargo-quickinstall',
    versionSource: 'cargo-toml',
    githubRepo: 'eza-community/eza'
  }
};
```

### 6. Manual
Handles tools that require manual installation or are already installed.

**Example:**
```typescript
const toolConfig: ManualToolConfig = {
  name: 'custom-tool',
  binaries: ['custom-tool'],
  installationMethod: 'manual',
  installParams: {
    binaryPath: '/usr/local/bin/custom-tool'
  }
};
```

## Core Utilities

### BinarySetupService

Handles binary installation and setup from various sources.

**Functions:**
- `setupBinariesFromArchive`: Sets up binaries from extracted archives
- `setupBinariesFromDirectDownload`: Sets up binaries from direct downloads

Both functions:
- Create symlinks in the target directory
- Preserve executable permissions from archives
- Set executable permissions for direct downloads
- Support multiple binaries per tool

### HookExecutor

Manages lifecycle hook execution with proper context and error handling.

**Features:**
- Creates enhanced contexts with filesystem and logger
- Supports timeout configuration
- Provides tool-specific $ shell executor
- Handles both synchronous and asynchronous hooks
- Automatic cleanup on errors

**Example:**
```typescript
const hookExecutor = new HookExecutor(logger);

const enhancedContext = hookExecutor.createEnhancedContext(
  baseContext,
  fileSystem
);

const result = await hookExecutor.executeHook(
  'afterInstall',
  hook,
  enhancedContext,
  { timeoutMs: 30000, continueOnError: false }
);
```

### InstallationPipeline

Orchestrates multi-step installations (currently under development for enhanced composability).

## Lifecycle Hooks

The installer supports four lifecycle hooks that allow custom logic at different stages:

### Hook Types

1. **beforeInstall**: Executed before any installation steps
2. **afterDownload**: Executed after downloading files (GitHub, Cargo, curl-tar)
3. **afterExtract**: Executed after extracting archives (GitHub, Cargo, curl-tar)
4. **afterInstall**: Executed after all installation steps (all methods)

### Hook Context

Hooks receive an enhanced context with access to:

```typescript
interface InstallHookContext extends BaseToolContext {
  toolName: string;
  version?: string;
  installDir: string;
  extractDir?: string;
  downloadPath?: string;
  binaryPath?: string;
  extractResult?: ExtractResult;
  fileSystem: IFileSystem;
  logger: TsLogger;
  $: typeof $; // Bun's shell execution
  toolConfig: ToolConfig;
  appConfig: YamlConfig;
  systemInfo: SystemInfo;
}
```

### Example Hook Usage

```typescript
const toolConfig: GithubReleaseToolConfig = {
  name: 'bat',
  binaries: ['bat'],
  version: 'latest',
  installationMethod: 'github-release',
  installParams: {
    repo: 'sharkdp/bat',
    hooks: {
      afterExtract: async (context) => {
        // Create config directory
        const configDir = path.join(context.installDir, 'config');
        await context.fileSystem.ensureDir(configDir);
        
        // Create default config
        const configPath = path.join(configDir, 'config');
        await context.fileSystem.writeFile(
          configPath, 
          `--theme="Monokai Extended"\n--style="numbers,changes,header"\n`
        );
        
        context.logger.debug('Configuration setup completed');
      },
      
      afterInstall: async (context) => {
        // Use the $ shell executor for running commands
        await context.$`${context.binaryPath} --version`;
      }
    }
  }
};
```

### Hook Execution

Hooks are executed with:
- **Default timeout**: 60 seconds
- **Error handling**: Configurable continue-on-error behavior
- **Logging**: Automatic logging of execution time and results
- **Context isolation**: Each hook gets its own logger and filesystem context

## Shared Utilities

The installer provides several shared utilities to eliminate code duplication:

### Download Management

**`downloadWithProgress(url, destinationPath, filename, downloader, options?)`**

Handles file downloads with progress tracking and caching.

```typescript
import { downloadWithProgress } from '@dotfiles/installer/utils';

await downloadWithProgress(
  'https://example.com/tool.tar.gz',
  '/path/to/tool.tar.gz',
  'tool.tar.gz',
  downloader,
  options
);
```

### Hook Execution

**`executeAfterDownloadHook(toolConfig, context, hookExecutor, fileSystem, logger)`**

Executes afterDownload hook if configured.

**`executeAfterExtractHook(toolConfig, context, hookExecutor, fileSystem, logger)`**

Executes afterExtract hook if configured.

```typescript
import { executeAfterDownloadHook, executeAfterExtractHook } from '@dotfiles/installer/utils';

const downloadResult = await executeAfterDownloadHook(
  toolConfig,
  postDownloadContext,
  hookExecutor,
  fileSystem,
  logger
);

const extractResult = await executeAfterExtractHook(
  toolConfig,
  postExtractContext,
  hookExecutor,
  fileSystem,
  logger
);
```

### Error Handling

**`withInstallErrorHandling(method, toolName, logger, operation)`**

Provides consistent error handling across all installation methods.

```typescript
import { withInstallErrorHandling } from '@dotfiles/installer/utils';

return withInstallErrorHandling('github-release', toolName, logger, async () => {
  // Installation logic
  return { success: true, binaryPaths: [...] };
});
```

### Filesystem Helpers

**`createToolFileSystem(baseFileSystem, toolName)`**

Creates a tool-specific filesystem instance with proper tracking.

```typescript
import { createToolFileSystem } from '@dotfiles/installer/utils';

const toolFs = createToolFileSystem(baseFileSystem, toolName);
```

### Binary Path Utilities

**`getBinaryPaths(binaries, toolName, installDir)`**

Generates full paths for all configured binaries.

**`getBinaryNames(binaries, toolName)`**

Extracts binary names from the binaries configuration.

```typescript
import { getBinaryPaths, getBinaryNames } from '@dotfiles/installer/utils';

const binaryPaths = getBinaryPaths(toolConfig.binaries, 'my-tool', '/path/to/install');
// ['/path/to/install/my-tool', '/path/to/install/helper']

const binaryNames = getBinaryNames(toolConfig.binaries, 'my-tool');
// ['my-tool', 'helper']
```

## Testing

The installer package has comprehensive test coverage including:

### Test Organization

- **Unit Tests**: Individual method tests (`Installer--{method}.test.ts`)
- **Integration Tests**: Client integration tests, hook execution tests
- **Error Handling Tests**: Asset selection, error scenarios
- **Mock Helpers**: Shared test setup utilities in `installer-test-helpers.ts`

### Running Tests

```bash
# Run all installer tests
bun test packages/installer

# Run specific test file
bun test packages/installer/src/__tests__/Installer--installFromGitHubRelease.test.ts

# Run with watch mode
bun test --watch packages/installer
```

### Test Helpers

The package provides comprehensive test helpers:

```typescript
import { 
  createInstallerTestSetup,
  createTestContext,
  createGithubReleaseToolConfig,
  setupFileSystemMocks
} from './installer-test-helpers';

const setup = await createInstallerTestSetup();
const context = createTestContext(setup);
const toolConfig = createGithubReleaseToolConfig({
  installParams: { repo: 'owner/repo' }
});

const result = await setup.installer.install('tool-name', toolConfig);
```

## Dependencies

### Internal Dependencies
- `@dotfiles/archive-extractor` - Archive extraction support
- `@dotfiles/config` - Configuration management
- `@dotfiles/downloader` - File download capabilities
- `@dotfiles/file-system` - Filesystem operations
- `@dotfiles/logger` - Structured logging
- `@dotfiles/registry` - Tool installation registry
- `@dotfiles/schemas` - Type definitions and validation
- `@dotfiles/utils` - Shared utilities

### External Dependencies
- `semver` - Version constraint matching
- `minimatch` - Pattern matching for asset selection

## Usage Example

```typescript
import { Installer } from '@dotfiles/installer';
import type { GithubReleaseToolConfig } from '@dotfiles/schemas';

// Create installer instance
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

// Define tool configuration
const toolConfig: GithubReleaseToolConfig = {
  name: 'fzf',
  binaries: ['fzf'],
  version: 'latest',
  installationMethod: 'github-release',
  installParams: {
    repo: 'junegunn/fzf',
    assetPattern: '*linux*amd64*.tar.gz'
  }
};

// Install the tool
const result = await installer.install('fzf', toolConfig);

if (result.success) {
  console.log(`Installed to: ${result.binaryPaths.join(', ')}`);
  console.log(`Version: ${result.version}`);
} else {
  console.error(`Installation failed: ${result.error}`);
}
```

## Creating a New Installation Method

To add a new installation method, you need to integrate it into multiple parts of the system. Here's the complete integration process:

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

]);
```

#### Step 1e: Add to Platform Config Schema
```typescript
// src/types/tool-config/platformConfigSchema.ts
import { myCustomInstallParamsSchema } from './myCustomInstallParamsSchema';

export const platformConfigSchema = commonToolConfigPropertiesSchema
  .extend({
    installationMethod: z
      .enum(['github-release', 'brew', 'curl-script', 'curl-tar', 'cargo', 'my-custom', 'manual'])
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
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
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
If you see errors like "Unsupported installation method", it means the installer isn't resolving platform-specific configurations. The installer should use `resolvePlatformConfig()` before checking the installation method.

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

```typescript
import {
  downloadWithProgress,
  executeAfterDownloadHook,
  executeAfterExtractHook,
  withInstallErrorHandling,
  createToolFileSystem,
  getBinaryPaths
} from '@dotfiles/installer/utils';
```

### 2. Proper Error Handling
Wrap your installation logic with `withInstallErrorHandling`:

```typescript
return withInstallErrorHandling('method-name', toolName, logger, async () => {
  // Installation logic
  return { success: true, binaryPaths: [...] };
});
```

### 3. Structured Logging
Use the structured logging templates from `log-messages.ts`:

```typescript
import { installerLogMessages } from '@dotfiles/installer/utils/log-messages';

logger.debug(installerLogMessages.gitHubRelease.downloadingAsset(url));
logger.debug(installerLogMessages.cargo.installingTool(toolName));
```

### 4. Hook Support
Always implement lifecycle hooks in your installation methods:

```typescript
// Execute hooks at appropriate points
const afterDownloadResult = await executeAfterDownloadHook(
  toolConfig,
  postDownloadContext,
  hookExecutor,
  fileSystem,
  logger
);

if (!afterDownloadResult.success) {
  return { success: false, error: afterDownloadResult.error };
}
```

### 5. Tool-Specific Filesystem
Use `createToolFileSystem` to get a filesystem instance with tool-specific tracking:

```typescript
const toolFs = createToolFileSystem(fileSystem, toolName);
// All operations on toolFs will be tracked with the tool name
```

### 6. Testing
Create comprehensive tests using the shared test helpers:

```typescript
import { 
  createInstallerTestSetup,
  createTestContext,
  setupFileSystemMocks
} from './installer-test-helpers';

const setup = await createInstallerTestSetup();
setupFileSystemMocks(setup);
const context = createTestContext(setup);
```

### 7. Binary Setup
Use the BinarySetupService for consistent binary installation:

```typescript
import { setupBinariesFromArchive, setupBinariesFromDirectDownload } from '@dotfiles/installer/utils';

// For archives
await setupBinariesFromArchive(fileSystem, toolName, toolConfig, context, extractDir, logger);

// For direct downloads
await setupBinariesFromDirectDownload(fileSystem, toolName, toolConfig, context, downloadPath, logger);
```

## Architecture Decisions

### Why Multiple Installation Methods?
Different tools have different distribution mechanisms. Supporting multiple methods allows the system to handle the most common distribution patterns without requiring custom logic for each tool.

### Why Separate API Clients?
The GitHub and Cargo clients encapsulate complex API interactions, caching, and error handling. This separation:
- Makes the code more testable
- Allows reuse across different installation methods
- Provides a clear interface for API operations

### Why Hook System?
Hooks provide flexibility for tool-specific post-installation steps without modifying the core installer logic. Common use cases:
- Creating configuration files
- Setting up shell completions
- Running tool-specific initialization
- Compiling from source

### Why Shared Utilities?
Extracting common patterns into utilities:
- Eliminates code duplication
- Ensures consistent behavior across methods
- Makes testing easier
- Simplifies maintenance

## Error Handling Strategy

The installer uses a layered error handling approach:

1. **Client Level**: API clients throw specific error types (GitHubApiClientError, CargoClientError)
2. **Method Level**: Installation methods catch and wrap errors with context
3. **Utility Level**: Shared utilities provide consistent error wrapping (`withInstallErrorHandling`)
4. **Top Level**: The main Installer class handles final error reporting and logging

All errors include:
- Clear error messages
- Contextual information (tool name, method, URLs)
- Original error details when available

## Performance Considerations

### Caching
- GitHub API responses are cached to avoid rate limiting
- Downloads can be cached to avoid repeated fetches
- Caching is configurable per deployment

### Parallel Operations
- Multiple binaries for a single tool are processed sequentially
- Hook execution is sequential to maintain predictable state

### Resource Management
- Downloaded archives are cleaned up after extraction
- Temporary files are removed on error
- File handles are properly closed

## Future Enhancements

Potential areas for future development:

1. **Enhanced Pipeline System**: Full composable pipeline support
2. **Rollback Support**: Automatic rollback on installation failure
3. **Incremental Updates**: Update only changed files
4. **Verification**: Binary signature and checksum verification
5. **Parallel Installations**: Install multiple tools concurrently
6. **Installation Profiles**: Predefined installation configurations

---

This architecture provides a robust, maintainable, and extensible foundation for tool installation while eliminating code duplication and ensuring consistency across all installation methods.