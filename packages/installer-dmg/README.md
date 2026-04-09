# @dotfiles/installer-dmg

Installer plugin for macOS applications distributed as DMG disk images.

## Overview

This plugin downloads `.dmg` files, mounts them with `hdiutil`, and copies the `.app` bundle to `/Applications`. On non-macOS platforms, installation is silently skipped.

Shims are not supported for DMG-installed applications. The `.bin()` method should not be used with this installer.

## Usage

```typescript
import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('dmg', {
    source: {
      type: 'url',
      url: 'https://example.com/releases/MyApp-1.0.0.dmg',
    },
  })
);
```

### Parameters

The `install('dmg', params)` function accepts the following parameters:

- **source** (required): DMG source definition
  - `type: 'url'` with `url`
  - `type: 'github-release'` with `repo`, optional `version`, `assetPattern`, `assetSelector`, `ghCli`, `prerelease`
- **appName** (optional): Name of the `.app` bundle inside the DMG (e.g., `'MyApp.app'`). Auto-detected if omitted.
- **binaryPath** (optional): Relative path to the binary inside the `.app` bundle. Defaults to `Contents/MacOS/{binary name}`.
- **versionArgs** (optional): Arguments to pass to the binary to check the version
- **versionRegex** (optional): Regex to extract version from output (`string` or `RegExp`)

### Examples

#### Basic Installation

```typescript
export default defineTool((install) =>
  install('dmg', {
    source: {
      type: 'url',
      url: 'https://example.com/MyApp-1.0.0.dmg',
    },
    appName: 'MyApp.app',
  }).version('1.0.0')
);
```

#### With Version Detection

```typescript
export default defineTool((install) =>
  install('dmg', {
    source: {
      type: 'url',
      url: 'https://example.com/MyApp-1.0.0.dmg',
    },
    versionArgs: ['--version'],
    versionRegex: /v(\d+\.\d+\.\d+)/,
  })
);
```

#### GitHub Release Source

```typescript
export default defineTool((install) =>
  install('dmg', {
    source: {
      type: 'github-release',
      repo: 'manaflow-ai/cmux',
      assetPattern: '*macos*.dmg',
    },
    appName: 'cmux.app',
  })
);
```

## Features

### Platform Gating

The plugin checks `context.systemInfo.platform` at install time. On non-macOS platforms, it returns a successful result with empty binary paths and logs an informational skip message. No `.platform()` wrapper is needed in tool definitions.

### App Bundle Auto-Detection

When `appName` is not specified, the plugin scans the mounted DMG for the first `.app` directory.

### Externally Managed

This plugin operates with `externallyManaged = true`. Temporary files are handled in `stagingDir`, while the final app is installed to `/Applications`. The shim generator will not create shims for DMG-installed tools. Applications installed via DMG are managed as `.app` bundles, not standalone binaries.

## Implementation Details

### Installation Process

1. Check platform — skip silently on non-macOS
2. Download DMG to staging directory
3. Execute `after-download` hook if configured
4. Mount DMG via `hdiutil attach -nobrowse -noautoopen`
5. Find `.app` bundle (explicit `appName` or auto-detect)
6. Copy `.app` bundle to `/Applications` (replace existing app if present)
7. Unmount DMG (always, via `finally` block)
8. Clean up downloaded DMG file

### Validation

On macOS, the `validate()` method checks that `hdiutil` is available. On non-macOS, validation passes with a warning (the install method handles the skip).

## Plugin Interface

Implements `IInstallerPlugin` with:

- **Method**: `dmg`
- **Schemas**: `dmgInstallParamsSchema`, `dmgToolConfigSchema`
- **Externally Managed**: Yes — shims are not generated
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
  binaryPaths: string[],      // Paths inside /Applications/<App>.app/Contents/MacOS/
  version?: string,            // Detected version
  metadata: {
    method: 'dmg',
    dmgUrl: string,
  }
}
```
