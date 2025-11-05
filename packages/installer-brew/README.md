# @dotfiles/installer-brew

Installer plugin for the Homebrew package manager.

## Overview

This plugin enables installation of CLI tools via Homebrew formulas and casks on macOS and Linux. It handles tap management, version detection, and supports both standard formulas and GUI applications via casks.

## Usage

Tools are configured using `defineTool` with the `install()` function:

```typescript
import { defineTool } from '@dotfiles/cli';

export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'ripgrep',
    tap: 'homebrew/core',
  })
    .bin('rg')
);
```

### Parameters

The `install('brew', params)` function accepts the following parameters:

- **formula** (optional): Homebrew formula name. Defaults to the tool name if not specified.
- **cask** (optional): Set to `true` to install as a Homebrew Cask. Default: `false`
- **tap** (optional): Tap or array of taps to add before installation (e.g., `'user/tap'` or `['tap1', 'tap2']`)
- **env** (optional): Environment variables for the installation process
- **hooks** (optional): Lifecycle hooks (`beforeInstall`, `afterInstall`)

### Examples

#### Basic Formula Installation

```typescript
export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'bat',
  })
    .bin('bat')
);
```

#### Cask Installation

```typescript
export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'docker',
    cask: true,
  })
    .bin('docker')
);
```

#### With Custom Tap

```typescript
export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'my-tool',
    tap: 'myorg/tap',
  })
    .bin('my-tool')
);
```

#### With Multiple Taps

```typescript
export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'tool',
    tap: ['user/tap1', 'user/tap2'],
  })
    .bin('tool')
);
```

## Features

### Tap Management
Automatically executes `brew tap` for specified taps before installation, enabling access to formulas from custom repositories.

### Cask Support
Installs GUI applications and large binaries via Homebrew Casks when `cask: true` is specified.

### Version Detection
Queries `brew info --json` to determine installed versions, supporting version tracking and update checks.

### Force Reinstall
Supports forced reinstallation via `--force` flag when installation options specify force mode.

## Implementation Details

### Installation Process

1. Adds specified taps via `brew tap` (if provided)
2. Executes `brew install [--cask] [--force] <formula>`
3. Fetches version information via `brew info --json`
4. Returns binary paths and metadata

### Update Checking

The plugin implements `checkUpdate()` to query for available updates. Full implementation pending.

## Plugin Interface

Implements `InstallerPlugin` with:

- **Method**: `brew`
- **Schemas**: `brewInstallParamsSchema`, `brewToolConfigSchema`
- **Update Check**: Supported (placeholder)
- **Update Tool**: Not yet implemented
- **README URL**: Not supported

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    brew: BrewInstallParams;
  }
  interface ToolConfigRegistry {
    brew: BrewToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'brew', BrewInstallResult> {}
}
```

## Result Type

Installation returns `BrewInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],      // Paths to installed binaries
  version?: string,            // Detected version
  metadata: {
    method: 'brew',
    formula: string,
    isCask: boolean,
    tap?: string | string[]
  }
}
```
