# Getting Started

This guide covers how to create `.tool.ts` configuration files for your CLI tools.

## Prerequisites

Set up your project configuration first. See [Project Configuration](./config.md) for instructions.

## File Structure

Tool configurations are placed in your `toolConfigsDir` (default: `~/.dotfiles/tools`):

```
tools/
├── fzf.tool.ts
├── ripgrep.tool.ts
└── dev/
    ├── node.tool.ts
    └── rust.tool.ts
```

Files must be named `{tool-name}.tool.ts` and export a default using `defineTool`.

## Minimal Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'junegunn/fzf',
  })
    .bin('fzf')
);
```

## Complete Example

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  })
    .bin('rg')
    .dependsOn('pcre2')
    .symlink('./ripgreprc', '~/.ripgreprc')
    .zsh((shell) =>
      shell
        .environment({ RIPGREP_CONFIG_PATH: '~/.ripgreprc' })
        .aliases({ rgi: 'rg -i' })
    )
);
```

## Available Methods

After calling `install()`, these methods are available:

| Method | Purpose |
|--------|---------|
| `.bin(name)` | Define binary name(s) to expose |
| `.version(v)` | Set version (`'latest'` or specific) |
| `.dependsOn(bin)` | Declare binary dependencies |
| `.symlink(src, dest)` | Create config file symlinks |
| `.hook(event, fn)` | Lifecycle hooks ([details](./hooks.md)) |
| `.zsh(fn)` / `.bash(fn)` | Shell-specific configuration |
| `.platform(p, fn)` | Platform-specific overrides |

## Next Steps

- [Installation Methods](./installation/README.md) - Choose how to install your tool
- [Shell Integration](./shell-integration.md) - Aliases, functions, environment variables
- [Context API](./context-api.md) - Dynamic paths using `ctx`