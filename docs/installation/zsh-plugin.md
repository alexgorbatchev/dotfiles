# Zsh Plugin Installation

The `zsh-plugin` installation method clones Git repositories for zsh plugins and automatically configures them to be sourced in your shell. This is useful for installing plugins that are not available via package managers.

## Configuration

### Basic Usage

#### GitHub Shorthand

The simplest way to install a plugin from GitHub:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
);
```

The plugin is automatically sourced - no additional configuration needed!

#### Full Git URL

For plugins hosted elsewhere (GitLab, Bitbucket, private repos):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    url: 'https://gitlab.com/user/custom-plugin.git',
  })
);
```

### Install Parameters

| Parameter    | Type    | Required | Description                                                |
| ------------ | ------- | -------- | ---------------------------------------------------------- |
| `repo`       | string  | No\*     | GitHub repository shorthand (e.g., `user/repo`)            |
| `url`        | string  | No\*     | Full Git URL (e.g., `https://github.com/user/repo.git`)    |
| `pluginName` | string  | No       | Custom plugin directory name (defaults to repository name) |
| `source`     | string  | No       | Explicit source file path (auto-detected if not specified) |
| `auto`       | boolean | No       | Auto-install during `generate` command (default: `true`)   |

\* Either `repo` or `url` must be provided.

### Auto-Install Behavior

By default (`auto: true`), zsh plugins are automatically installed during the `dotfiles generate` command. This means:

1. When you run `dotfiles generate`, plugins with `auto: true` are cloned/updated
2. The plugin's `source` command is automatically added to your shell init
3. No separate `dotfiles install` step is needed for these plugins

To disable auto-installation and require explicit `dotfiles install`:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
    auto: false, // Requires explicit `dotfiles install`
  })
);
```

### Custom Plugin Name

Use `pluginName` when you want the plugin directory name to differ from the repository name:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
    pluginName: 'vi-mode', // Cloned to plugins/vi-mode instead of plugins/zsh-vi-mode
  })
);
```

### Explicit Source File

If the plugin's source file doesn't follow standard naming conventions, specify it explicitly:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'some-org/some-plugin',
    source: 'custom-init.zsh', // Use this file instead of auto-detection
  })
);
```

## How It Works

1. **Clone**: The repository is cloned with `--depth 1` to minimize download size
2. **Detect**: The plugin's source file is auto-detected (e.g., `*.plugin.zsh`)
3. **Source**: A `source` command is automatically added to your shell init
4. **Update**: On subsequent runs, `git pull --ff-only` updates the plugin
5. **Version**: Version is determined from git tags (e.g., `v0.1.0`) or commit hash (e.g., `abc1234`)

### Auto-detected Source Files

The installer checks for these files in order:

- `{pluginName}.plugin.zsh`
- `{pluginName}.zsh`
- `init.zsh`
- `plugin.zsh`
- `{pluginName}.zsh-theme`

## Adding Environment Variables

Use `.zsh()` to add environment variables or other shell configuration:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) =>
      shell.environment({
        ZVM_VI_INSERT_ESCAPE_BINDKEY: 'jj',
        ZVM_CURSOR_STYLE_ENABLED: 'false',
      })
    )
);
```

The environment variables are set **before** the plugin is sourced, allowing you to configure the plugin's behavior.

## Troubleshooting

### Update fails

If `git pull --ff-only` fails, you may have local changes. Delete the plugin directory and reinstall, or manually reset it:

```bash
cd ~/.dotfiles-generated/plugins/<plugin-name>
git reset --hard origin/HEAD
```

## Related

- [Manual Installation](manual.md) - For plugins requiring custom setup
- [Shell Integration](../shell-integration.md) - How shell configs are generated
