# @dotfiles/installer-cargo

Cargo installer plugin for the dotfiles tool installer system.

## Installation

This package is part of the dotfiles tool installer monorepo and is typically used via the main CLI.

## Usage

```typescript
import { CargoInstallerPlugin } from '@dotfiles/installer-cargo';
import { InstallerPluginRegistry } from '@dotfiles/installer-plugin-system';

const registry = new InstallerPluginRegistry(logger);
const cargoPlugin = new CargoInstallerPlugin(
  logger,
  fs,
  downloader,
  cargoClient,
  archiveExtractor,
  hookExecutor,
  githubHost
);

await registry.register(cargoPlugin);
```

## Module Augmentation

This package automatically extends `ToolConfigBuilder` with type-safe `cargo` method:

```typescript
import '@dotfiles/installer-cargo';

builder.install('cargo', {
  crateName: 'my-crate',
  versionSource: 'cargo-toml',
  binarySource: 'cargo-quickinstall',
});
```

## API

### CargoInstallerPlugin

Installer plugin for Cargo pre-compiled binaries.

#### Parameters

- `crateName` (optional): Crate name (defaults to tool name)
- `versionSource` (optional): How to determine version (`cargo-toml`, `crates-io`, `github-releases`)
- `binarySource` (optional): Where to download binaries from (`cargo-quickinstall`, `github-releases`)
- `githubRepo` (optional): GitHub repository for version/binary source
- `cargoTomlUrl` (optional): Custom Cargo.toml URL
- `assetPattern` (optional): Asset naming pattern for GitHub releases

## Features

- Multiple version sources (Cargo.toml, crates.io, GitHub releases)
- Multiple binary sources (cargo-quickinstall, GitHub releases)
- Automatic platform/architecture detection
- Hook support for custom installation logic
