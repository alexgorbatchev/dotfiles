# @dotfiles/installer-cargo

Installer plugin for Rust CLI tools distributed as pre-compiled binaries.

## Overview

This plugin enables installation of Rust-based tools by downloading pre-compiled binaries from cargo-quickinstall or GitHub releases. It supports multiple version sources and automatically handles platform/architecture detection.

## Usage

Tools are configured using `defineTool` with the `install()` function:

```typescript
import { defineTool } from '@dotfiles/cli';

export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
  })
    .bin('rg')
);
```

### Parameters

The `install('cargo', params)` function accepts the following parameters:

- **crateName** (required): The crate name
- **binarySource** (optional): Where to download binaries from:
  - `'cargo-quickinstall'` (default): Downloads from cargo-bins/cargo-quickinstall releases
  - `'github-releases'`: Downloads from the crate's GitHub releases
- **versionSource** (optional): Where to get version information:
  - `'cargo-toml'` (default): Parses version from Cargo.toml in repository
  - `'crates-io'`: Queries crates.io API for latest version
  - `'github-releases'`: Gets version from GitHub releases (not yet implemented)
- **githubRepo** (optional): GitHub repository in `owner/repo` format (required for `github-releases` binary source)
- **cargoTomlUrl** (optional): Custom URL to Cargo.toml file (overrides default GitHub location)
- **assetPattern** (optional): Pattern for GitHub release assets. Supports placeholders: `{crateName}`, `{version}`, `{platform}`, `{arch}`
- **customBinaries** (optional): Array of custom binary names if different from crate name
- **allowSourceFallback** (optional): Whether to fallback to source compilation if binary not available (not yet implemented)
- **env** (optional): Environment variables for the installation process
- **hooks** (optional): Lifecycle hooks (`beforeInstall`, `afterDownload`, `afterInstall`)

### Examples

#### Basic Installation from cargo-quickinstall

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'fd-find',
  })
    .bin('fd')
);
```

#### From GitHub Releases

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'bat',
    binarySource: 'github-releases',
    githubRepo: 'sharkdp/bat',
    assetPattern: '{crateName}-{version}-{arch}-{platform}.tar.gz',
  })
    .bin('bat')
);
```

#### With crates.io Version Source

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'ripgrep',
    versionSource: 'crates-io',
  })
    .bin('rg')
);
```

#### With Hooks

```typescript
export default defineTool((install, ctx) =>
  install('cargo', {
    crateName: 'tool',
  })
    .bin('tool')
    .hooks({
      afterInstall: async (ctx) => {
        // Post-installation setup
      },
    })
);
```

## Features

### Multiple Version Sources

**Cargo.toml Parsing**: Fetches and parses Cargo.toml from GitHub repository to extract version information.

**crates.io API**: Queries the crates.io API to retrieve the latest published version.

**GitHub Releases**: Extracts version from GitHub release tags (implementation pending).

### Multiple Binary Sources

**cargo-quickinstall**: Downloads pre-compiled binaries from cargo-bins/cargo-quickinstall, providing fast installation for popular Rust tools.

**GitHub Releases**: Downloads pre-compiled binaries directly from the tool's GitHub releases page.

### Platform Detection

Automatically maps Node.js platform/architecture names to Rust target triples:
- Platforms: `darwin` → `apple-darwin`, `linux` → `unknown-linux-gnu`, `win32` → `pc-windows-msvc`
- Architectures: `arm64` → `aarch64`, `x64` → `x86_64`

### Lifecycle Hooks

Supports installation hooks at key points:
- **afterDownload**: Executed after archive download, before extraction
- **afterInstall**: Executed after binary setup is complete

## Implementation Details

### Installation Process

1. Determines version from configured source (Cargo.toml, crates.io, or GitHub releases)
2. Constructs download URL based on binary source and platform/architecture
3. Downloads and extracts the archive
4. Executes lifecycle hooks if configured
5. Sets up binaries in the installation directory
6. Cleans up downloaded archive

### Update Checking

The plugin queries crates.io for the latest version to support update detection.

## Plugin Interface

Implements `InstallerPlugin` with:

- **Method**: `cargo`
- **Schemas**: `cargoInstallParamsSchema`, `cargoToolConfigSchema`
- **Update Check**: Supported (queries crates.io)
- **Update Tool**: Not yet implemented
- **README URL**: Not supported

## Type Augmentation

This package extends the core type system via module augmentation:

```typescript
declare module '@dotfiles/core' {
  interface InstallParamsRegistry {
    cargo: CargoInstallParams;
  }
  interface ToolConfigRegistry {
    cargo: CargoToolConfig;
  }
  interface PluginResultRegistry extends RegisterPluginResult<'cargo', CargoInstallResult> {}
}
```

## Result Type

Installation returns `CargoInstallResult`:

```typescript
{
  success: true,
  binaryPaths: string[],      // Paths to installed binaries
  version: string,             // Detected version
  originalTag?: string,        // Original version tag if available
  metadata: {
    method: 'cargo',
    crateName: string,
    binarySource: string,
    downloadUrl: string
  }
}
```
