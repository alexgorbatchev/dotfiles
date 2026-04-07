# installer-zsh-plugin Package

## Purpose

Installer plugin for zsh plugins via git clone. Clones git repositories into a configurable plugins directory for use with zsh plugin managers like Oh My Zsh, Prezto, or standalone sourcing.

## Key Components

- **ZshPluginInstallerPlugin**: Main plugin class implementing `IInstallerPlugin`
- **installFromZshPlugin**: Core installation function that performs git clone
- **Schemas**: Zod schemas for parameter validation

## Usage

```typescript
import { defineTool } from '@alexgorbatchev/dotfiles';

// GitHub shorthand
export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
);

// Full git URL
export default defineTool((install) =>
  install('zsh-plugin', {
    url: 'https://github.com/jeffreytse/zsh-vi-mode.git',
  })
);

// Custom plugin name
export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
    pluginName: 'vi-mode', // Clones to plugins/vi-mode instead of plugins/zsh-vi-mode
  })
);
```

## Architecture Notes

- Plugins are cloned to the managed directory (`.generated/tools/{toolName}/{version}/`)
- The `ctx.currentDir` symlink points to the installed version for stable references
- Plugins with `auto: true` (default) are automatically installed during `dotfiles generate`
- The installer emits `shellInit` with a `source` command that is merged into the shell init file
- Supports both GitHub shorthand (`user/repo`) and full git URLs
- Updates existing plugins via `git pull` when reinstalling
- No binaries are generated; shell integration handles plugin loading

## Testing

Run tests with: `bun test packages/installer-zsh-plugin`
