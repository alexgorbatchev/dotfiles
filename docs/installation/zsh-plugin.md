# Zsh Plugin Installation

The `zsh-plugin` installation method clones Git repositories for zsh plugins. This is useful for installing plugins that are not available via package managers.

## Configuration

### Basic Usage

#### GitHub Shorthand

The simplest way to install a plugin from GitHub:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) => shell.always(`source "${ctx.currentDir}/zsh-vi-mode.plugin.zsh"`))
);
```

#### Full Git URL

For plugins hosted elsewhere (GitLab, Bitbucket, private repos):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('zsh-plugin', {
    url: 'https://gitlab.com/user/custom-plugin.git',
  })
    .zsh((shell) => shell.always(`source "${ctx.currentDir}/custom-plugin.plugin.zsh"`))
);
```

### Install Parameters

| Parameter    | Type   | Required | Description                                                |
| ------------ | ------ | -------- | ---------------------------------------------------------- |
| `repo`       | string | No\*     | GitHub repository shorthand (e.g., `user/repo`)            |
| `url`        | string | No\*     | Full Git URL (e.g., `https://github.com/user/repo.git`)    |
| `pluginName` | string | No       | Custom plugin directory name (defaults to repository name) |

\* Either `repo` or `url` must be provided.

### Custom Plugin Name

Use `pluginName` when you want the plugin directory name to differ from the repository name:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
    pluginName: 'vi-mode', // Cloned to plugins/vi-mode instead of plugins/zsh-vi-mode
  })
    .zsh((shell) => shell.always(`source "${ctx.currentDir}/zsh-vi-mode.plugin.zsh"`))
);
```

## How It Works

1. **Clone**: The repository is cloned with `--depth 1` to minimize download size
2. **Update**: On subsequent runs, `git pull --ff-only` updates the plugin
3. **Version**: Version is determined from git tags (e.g., `v0.1.0`) or commit hash (e.g., `abc1234`)

## Full Example

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('zsh-plugin', {
    repo: 'jeffreytse/zsh-vi-mode',
  })
    .zsh((shell) =>
      shell
        .environment({
          ZVM_VI_INSERT_ESCAPE_BINDKEY: 'jj',
          ZVM_CURSOR_STYLE_ENABLED: 'false',
        })
        .always(`source "${ctx.currentDir}/zsh-vi-mode.plugin.zsh"`)
    )
);
```

## Plugin Loading

Zsh plugins installed via this method need to be sourced in your shell init. Use the `.always()` method to add the source command. The `ctx.currentDir` variable points to the plugin directory.

Common plugin file patterns:

- `${ctx.currentDir}/<plugin-name>.plugin.zsh`
- `${ctx.currentDir}/<plugin-name>.zsh`
- `${ctx.currentDir}/init.zsh`

## Troubleshooting

### Plugin not sourced

Make sure the `.always()` block contains the correct path to the plugin file. Check the plugin's repository to find the correct file to source.

### Update fails

If `git pull --ff-only` fails, you may have local changes. Delete the plugin directory and reinstall, or manually reset it:

```bash
cd ~/.dotfiles-generated/plugins/<plugin-name>
git reset --hard origin/HEAD
```

## Related

- [Manual Installation](manual.md) - For plugins requiring custom setup
- [Shell Integration](../shell-integration.md) - How shell configs are generated
