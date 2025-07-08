# New Features

## Multi-Platform Support

The tool configuration system now supports targeting multiple platforms using the same set of tool definitions. This feature allows for platform-specific configurations, making it easier to manage tools that have different installation methods or settings across platforms.

### Platform and Architecture Enums

Two new enums have been added in `src/types/platform.types.ts`:

- `Platform`: Represents operating systems with bitwise values for combining platforms
  ```typescript
  export enum Platform {
    None = 0,
    Linux = 1 << 0, // 1
    MacOS = 1 << 1, // 2
    Windows = 1 << 2, // 4
    Unix = Platform.Linux | Platform.MacOS, // 3
    All = Platform.Linux | Platform.MacOS | Platform.Windows, // 7
  }
  ```

- `Architecture`: Represents CPU architectures with bitwise values for combining architectures
  ```typescript
  export enum Architecture {
    None = 0,
    X86_64 = 1 << 0, // 1
    Arm64 = 1 << 1, // 2
    All = Architecture.X86_64 | Architecture.Arm64, // 3
  }
  ```

These enums support bitwise operations for combining platforms and architectures, allowing for flexible targeting.

### Helper Functions

The platform types module also includes helper functions to check if a specific platform or architecture is included in a set:

```typescript
export function hasPlatform(targetPlatforms: Platform, platform: Platform): boolean
export function hasArchitecture(targetArchitectures: Architecture, architecture: Architecture): boolean
```

### The `platform()` Method

The `ToolConfigBuilder` now has a new `platform()` method that accepts platform combinations and a configuration callback:

```typescript
// For targeting specific platforms
c.platform(Platform.Linux | Platform.MacOS, (builder) => {
  builder.bin('unix-tool');
  builder.install('github-release', { repo: 'user/repo', assetPattern: '*unix*.tar.gz' });
});

// For targeting specific platforms and architectures
c.platform(Platform.Windows, Architecture.Arm64, (builder) => {
  builder.bin('win-arm64-tool.exe');
  builder.install('manual', { binaryPath: 'C:\\Program Files\\MyTool\\win-arm64-tool.exe' });
});
```

The `platform()` method provides a strongly-typed way to define platform-specific configurations. The callback receives a `PlatformConfigBuilder` instance that has methods similar to the main `ToolConfigBuilder`:

- `bin()`: Specify platform-specific binary names
- `version()`: Set platform-specific version
- `install()`: Configure platform-specific installation method
- `hooks()`: Define platform-specific installation hooks
- `zsh()`: Add platform-specific Zsh initialization code
- `symlink()`: Configure platform-specific symlinks
- `completions()`: Set up platform-specific shell completions

### Platform-Specific Configurations

Platform-specific configurations are stored in the `platformConfigs` property of the `ToolConfig` object. Each entry in this array includes:

- `platforms`: A bitmask of target platforms
- `architectures`: An optional bitmask of target architectures
- `config`: The platform-specific configuration settings

### Example Usage

Here's a complete example of configuring a tool with platform-specific settings:

```typescript
export const configure: AsyncConfigureTool = async (c) => {
  // Common configuration for all platforms
  c.bin('common-tool');
  c.version('1.0.0');

  // Linux and macOS configuration
  c.platform(Platform.Unix, (builder) => {
    builder.install('github-release', {
      repo: 'user/tool',
      assetPattern: '*unix*.tar.gz'
    });
    builder.zsh('export TOOL_UNIX_CONFIG=true');
  });

  // Windows configuration
  c.platform(Platform.Windows, (builder) => {
    builder.bin('windows-tool.exe');
    builder.install('github-release', {
      repo: 'user/tool',
      assetPattern: '*windows*.zip'
    });
  });

  // Linux on ARM64 specific configuration
  c.platform(Platform.Linux, Architecture.Arm64, (builder) => {
    builder.install('github-release', {
      repo: 'user/tool',
      assetPattern: '*linux-arm64*.tar.gz'
    });
  });
};
```

### Benefits Over Previous Approach

The new platform-specific configuration system offers several advantages:

1. **Type Safety**: The `Platform` and `Architecture` enums provide compile-time type checking, reducing errors.
2. **Bitwise Operations**: Platforms and architectures can be combined using bitwise operations, making it easy to target multiple platforms.
3. **Intuitive API**: The `platform()` method provides a more intuitive API than the string-based `arch()` method.
4. **Consistent Interface**: The `PlatformConfigBuilder` interface is similar to the main `ToolConfigBuilder`, making it easy to learn and use.
5. **Flexible Targeting**: Tools can be configured for specific platform and architecture combinations, allowing for fine-grained control.

## Cargo and Go Installers (Planned)

Future plans include adding support for Cargo (Rust) and Go installers.
