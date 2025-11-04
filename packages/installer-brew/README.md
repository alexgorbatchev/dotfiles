# @dotfiles/installer-brew

Homebrew installer plugin for the dotfiles tool installer system.

## Installation

This package is part of the dotfiles tool installer monorepo and is typically used via the main CLI.

## Usage

```typescript
import { BrewInstallerPlugin } from '@dotfiles/installer-brew';
import { InstallerPluginRegistry } from '@dotfiles/installer-plugin-system';

const registry = new InstallerPluginRegistry(logger);
const brewPlugin = new BrewInstallerPlugin(logger);

await registry.register(brewPlugin);
```

## Module Augmentation

This package automatically extends `ToolConfigBuilder` with type-safe `brew` method:

```typescript
import '@dotfiles/installer-brew';

builder.install('brew', {
  formula: 'my-tool',
  cask: false,
  tap: 'my-org/my-tap',
});
```

## API

### BrewInstallerPlugin

Installer plugin for Homebrew package manager.

#### Parameters

- `formula` (optional): Homebrew formula name (defaults to tool name)
- `cask` (optional): Install as cask
- `tap` (optional): Tap(s) to add before installation

## Features

- Automatic tap management
- Cask support
- Version detection via `brew info`
- Force reinstall support
