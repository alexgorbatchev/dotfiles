# @dotfiles/installer-dmg

Installer plugin for macOS applications distributed as DMG disk images.

## Overview

This plugin downloads `.dmg` files, mounts them with `hdiutil`, copies the `.app` bundle to the staging directory, and symlinks binaries from `Contents/MacOS/` for system-wide availability. On non-macOS platforms, installation is silently skipped.

## Usage

```typescript
import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('dmg', {
    url: 'https://example.com/releases/MyApp-1.0.0.dmg',
  }).bin('myapp')
);
```

### Parameters

The `install('dmg', params)` function accepts the following parameters:

- **url** (required): URL of the DMG file to download
- **appName** (optional): Name of the `.app` bundle inside the DMG (e.g., `'MyApp.app'`). Auto-detected if omitted.
- **binaryPath** (optional): Relative path to the binary inside the `.app` bundle. Defaults to `Contents/MacOS/{binary name}`.
- **versionArgs** (optional): Arguments to pass to the binary to check the version
- **versionRegex** (optional): Regex to extract version from output

### Examples

#### Basic Installation

```typescript
export default defineTool((install) =>
  install('dmg', {
    url: 'https://example.com/MyApp-1.0.0.dmg',
    appName: 'MyApp.app',
  })
    .bin('myapp')
    .version('1.0.0')
);
```

#### With Version Detection

```typescript
export default defineTool((install) =>
  install('dmg', {
    url: 'https://example.com/MyApp-1.0.0.dmg',
    versionArgs: ['--version'],
    versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
  }).bin('myapp')
);
```

#### With Custom Binary Path

```typescript
export default defineTool((install) =>
  install('dmg', {
    url: 'https://example.com/MyApp-1.0.0.dmg',
    appName: 'MyApp.app',
    binaryPath: 'Contents/MacOS/myapp-cli',
  }).bin('myapp')
);
```

## Features

### Platform Gating

The plugin checks `context.systemInfo.platform` at install time. On non-macOS platforms, it returns a successful result with empty binary paths and logs an informational skip message. No `.platform()` wrapper is needed in tool definitions.

### App Bundle Auto-Detection

When `appName` is not specified, the plugin scans the mounted DMG for the first `.app` directory.

### Binary Symlinking

For each declared binary, a symlink is created from `stagingDir/{binaryName}` to `AppName.app/Contents/MacOS/{binaryName}` (or the custom `binaryPath` if provided).

## Implementation Details

### Installation Process

1. Check platform — skip silently on non-macOS
2. Download DMG to staging directory
3. Execute `after-download` hook if configured
4. Mount DMG via `hdiutil attach -nobrowse -noautoopen`
5. Find `.app` bundle (explicit `appName` or auto-detect)
6. Copy `.app` bundle to staging directory
7. Symlink binaries from `Contents/MacOS/` to staging directory
8. Unmount DMG (always, via `finally` block)
9. Clean up downloaded DMG file
10. Detect version if configured

### Validation

On macOS, the `validate()` method checks that `hdiutil` is available. On non-macOS, validation passes with a warning (the install method handles the skip).

## Plugin Interface

Implements `IInstallerPlugin` with:

- **Method**: `dmg`
- **Schemas**: `dmgInstallParamsSchema`, `dmgToolConfigSchema`
- **Update Check**: Not supported
- **Update Tool**: Not supported
- **README URL**: Not supported

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module '@dotfiles/core' {
  interface IInstallParamsRegistry {
    dmg: DmgInstallParams;
  }
  interface IToolConfigRegistry {
    dmg: DmgToolConfig;
  }
  interface IPluginResultRegistry extends RegisterPluginResult<'dmg', DmgInstallResult> {}
}
```

## Result Type

Installation returns `DmgInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],      // Paths to symlinked binaries (empty on non-macOS)
  version?: string,            // Detected version
  metadata: {
    method: 'dmg',
    dmgUrl: string,
  }
}
```
