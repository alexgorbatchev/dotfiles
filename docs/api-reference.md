# API Reference

Complete reference for all methods available in the ToolConfigBuilder API.

## ToolConfigBuilder Methods

### Core Configuration

#### `.bin(names: string | string[])`
Defines the executable binaries this tool provides.

**Parameters:**
- `names`: Single binary name or array of binary names

**Returns:** `ToolConfigBuilder` (for chaining)

**Example:**
```typescript
c.bin('tool')
c.bin(['tool', 'tool-helper'])
```

#### `.dependsOn(...binaryNames: string[])`
Declares binaries that must be available before this tool runs.

**Parameters:**
- `binaryNames`: One or more binary names provided by other tools (or the system)

**Returns:** `ToolConfigBuilder` (for chaining)

**Example:**
```typescript
c.dependsOn('node');
c.dependsOn('node', 'pnpm');
```

If a dependency is missing, ambiguous, cyclical, or unavailable on the selected platform, the CLI fails with explicit diagnostics.

#### `.version(version: string)`
Specifies the desired tool version.

**Parameters:**
- `version`: Version string, SemVer constraint, or 'latest'

**Returns:** `ToolConfigBuilder` (for chaining)

**Example:**
```typescript
c.version('latest')
c.version('v1.2.3')
c.version('^2.0.0')
```

### Installation Methods

#### `.install(method: InstallMethod, params: InstallParams)`
Configures how the tool should be installed.

**Parameters:**
- `method`: Installation method type
- `params`: Method-specific parameters

**Returns:** `ToolConfigBuilder` (for chaining)

**Available Methods:**
- `'github-release'` - Install from GitHub releases
- `'brew'` - Install via Homebrew
- `'cargo'` - Install Rust tools from crates.io
- `'curl-script'` - Install via download scripts
- `'curl-tar'` - Download and extract tarballs
- `'manual'` - Configure existing tools

See [Installation Methods](./installation/README.md) for detailed parameters.

### Shell Integration

#### `.zsh(config: ShellConfig)`
Configures Zsh-specific properties.

**Parameters:**
- `config`: Shell configuration object

**Returns:** `ToolConfigBuilder` (for chaining)

#### `.bash(config: ShellConfig)`
Configures Bash-specific properties.

**Parameters:**
- `config`: Shell configuration object

**Returns:** `ToolConfigBuilder` (for chaining)

#### `.powershell(config: ShellConfig)`
Configures PowerShell-specific properties.

**Parameters:**
- `config`: Shell configuration object

**Returns:** `ToolConfigBuilder` (for chaining)

**ShellConfig Interface:**
```typescript
interface IShellConfig {
  completions?: ShellCompletionConfig;
  shellInit?: ShellScript[];
  aliases?: Record<string, string>;
  environment?: Record<string, string>;
}
```

### Platform Configuration

#### `.platform(platform: Platform, configure: (builder: ToolConfigBuilder) => void)`
Defines platform-specific configuration.

**Parameters:**
- `platform`: Platform flags (bitwise)
- `configure`: Configuration function

**Returns:** `ToolConfigBuilder` (for chaining)

#### `.platform(platform: Platform, arch: Architecture, configure: (builder: ToolConfigBuilder) => void)`
Defines platform and architecture-specific configuration.

**Parameters:**
- `platform`: Platform flags (bitwise)
- `arch`: Architecture flags (bitwise)
- `configure`: Configuration function

**Returns:** `ToolConfigBuilder` (for chaining)

**Platform Enum:**
```typescript
Platform.Linux    // 1
Platform.MacOS    // 2  
Platform.Windows  // 4
Platform.Unix     // Platform.Linux | Platform.MacOS (3)
Platform.All      // Platform.Linux | Platform.MacOS | Platform.Windows (7)
```

**Architecture Enum:**
```typescript
Architecture.X86_64  // 1
Architecture.Arm64   // 2
Architecture.All     // Architecture.X86_64 | Architecture.Arm64 (3)
```

### File Management

#### `.symlink(source: string, target: string)`
Creates symbolic links for configuration files.

**Parameters:**
- `source`: Path to source file (relative to tool config directory)
- `target`: Absolute path where symlink should be created

**Returns:** `ToolConfigBuilder` (for chaining)

> **Note:** For shell completions, use shell-specific configuration methods like `.zsh((shell) => shell.completions('path/to/_tool'))`. See [Completions Guide](./completions.md) for details.

### Advanced Features

#### `.hook(event: string, handler: HookHandler)`
Configures installation hooks for custom logic.

**Parameters:**
- `event`: Hook event name (`'before-install'`, `'after-download'`, `'after-extract'`, `'after-install'`)
- `handler`: Async function that receives HookContext

**Returns:** `ToolConfigBuilder` (for chaining)

**Example:**
```typescript
c.hook('after-install', async (context) => {
  const { logger, $ } = context;
  await $`tool init`;
  logger.info('Tool initialized');
});
```

## ToolConfigContext Properties

### Path Properties

- `toolDir: string` - Current tool's installation directory
- `projectConfig.paths.homeDir: string` - User's home directory
- `projectConfig.paths.dotfilesDir: string` - Root dotfiles directory
- `projectConfig.paths.generatedDir: string` - Generated files directory
- `projectConfig.paths.shellScriptsDir: string` - Generated shell scripts directory
- `projectConfig.paths.targetDir: string` - Executable shims directory (should be in PATH)
- `projectConfig.paths.binariesDir: string` - Tool binaries directory (versioned installs)

### Methods

- `getToolDir(toolName: string): string` - Get installation directory for any tool

## Type Definitions

### Installation Method Parameters

#### GitHubReleaseParams
```typescript
interface IGitHubReleaseParams {
  repo: string;
  assetPattern?: string;
  binaryPath?: string;
  version?: string;
  includePrerelease?: boolean;
  stripComponents?: number;
  assetSelector?: AssetSelector;
}
```

**AssetSelector Function:**
```typescript
type AssetSelector = (context: AssetSelectionContext) => GitHubReleaseAsset | undefined;

interface IAssetSelectionContext extends BaseToolContext {
  /** Available release assets to choose from */
  assets: GitHubReleaseAsset[];
  /** System information for platform/architecture matching */
  systemInfo: SystemInfo;
  /** The GitHub release being processed */
  release: GitHubRelease;
  /** The tool configuration being processed */
  toolConfig: ToolConfig;
  /** Asset pattern from configuration (if provided) */
  assetPattern?: string;
}
```

**AssetSelector Example:**
```typescript
assetSelector: (context) => {
  const { assets, systemInfo, logger, release } = context;
  
  logger.debug('Selecting asset for release:', release.tag_name);
  
  // Custom selection logic with access to full context
  const osMap = { 'darwin': 'macos', 'linux': 'linux', 'win32': 'windows' };
  const archMap = { 'x64': 'amd64', 'arm64': 'arm64' };
  
  const osKey = osMap[systemInfo.platform];
  const archKey = archMap[systemInfo.arch];
  
  const selectedAsset = assets.find(asset => 
    asset.name.toLowerCase().includes(osKey) &&
    asset.name.toLowerCase().includes(archKey) &&
    asset.name.endsWith('.tar.gz')
  );
  
  if (selectedAsset) {
    logger.debug('Selected asset:', selectedAsset.name);
  } else {
    logger.warn('No matching asset found for', osKey, archKey);
  }
  
  return selectedAsset;
}
```

#### BrewParams
```typescript
interface IBrewParams {
  formula?: string;
  cask?: boolean;
  tap?: string | string[];
}
```

#### CargoInstallParams
```typescript
interface ICargoInstallParams {
  crateName: string;
  binarySource?: 'cargo-quickinstall' | 'github-releases';
  githubRepo?: string;
  assetPattern?: string;
  versionSource?: 'cargo-toml' | 'crates-io' | 'github-releases';
  cargoTomlUrl?: string;
  customBinaries?: string[];
  allowSourceFallback?: boolean;
}
```

#### CurlScriptParams
```typescript
interface ICurlScriptParams {
  url: string;
  shell: 'bash' | 'sh';
  env?: Record<string, string>;
}
```

#### ManualParams
```typescript
interface IManualParams {
  binaryPath: string;
}
```

### Hook Context

```typescript
interface IHookContext {
  toolName: string;
  installDir: string;
  downloadPath?: string;
  extractDir?: string;
  extractResult?: ExtractResult;
  systemInfo: SystemInfo;
  fileSystem: IFileSystem;
  logger: TsLogger;
  projectConfig: ProjectConfig;
  toolConfig: ToolConfig;
  $: ReturnType<typeof $>;
  binaryPath?: string;
  version?: string;
}
```

### Shell Script Types

```typescript
type ShellScript = AlwaysScript | OnceScript;

// Branded types for script timing
type AlwaysScript = string & { __brand: 'always' };
type OnceScript = string & { __brand: 'once' };

// Helper functions
function always(template: TemplateStringsArray, ...values: any[]): AlwaysScript;
function once(template: TemplateStringsArray, ...values: any[]): OnceScript;
```

## Usage Patterns

### Basic Tool Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version('latest')
    .zsh((shell) => shell.aliases({ t: 'tool' }))
);
```

### Cross-Platform Configuration

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version('latest')
    
    .platform(Platform.MacOS, (c) => {
      c.install('brew', { formula: 'tool' });
    })
    
    .platform(Platform.Linux, (c) => {
      c.install('github-release', { repo: 'owner/tool' });
    })
);
```

### Complex Configuration with Hooks

```typescript
import { defineTool, always } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version('latest')
    .hook('after-install', async ({ logger, $ }) => {
      await $`tool init`;
      logger.info('Tool initialized');
    })
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
    .zsh((shell) =>
      shell
        .completions('completions/_tool')
        .environment({ TOOL_HOME: `${ctx.toolDir}` })
        .aliases({ t: 'tool' })
        .always(/* zsh */`
          function tool-helper() {
            tool --config "$TOOL_HOME/config.toml" "$@"
          }
        `)
    )
);
```

## Next Steps

- [Getting Started](./getting-started.md) - Learn the basics
- [Common Patterns](./common-patterns.md) - See real-world examples
- [TypeScript Requirements](./typescript.md) - Understand type safety