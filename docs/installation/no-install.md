# No-Install Configuration

The `no-install` method is used for tools that are already present on the system or do not require an installation step. This is useful for:

- System tools (e.g., `git`, `curl`)
- Tools managed by other package managers (e.g., `apt`, `yum`)
- Tools that are part of the OS

## When to Use `no-install`

Use the `no-install` method when you want to manage a tool's configuration (aliases, environment variables, symlinks) without having the dotfiles system handle its installation.

## Configuration

The `no-install` method does not take any parameters.

```typescript
import { defineTool } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  c
    .bin('git')
    .version('system') // or a specific version if you know it
    .install('no-install')
    .symlink('./gitconfig', `${ctx.homeDir}/.gitconfig`)
    .zsh({
      aliases: {
        'g': 'git',
        'gs': 'git status',
      },
    })
);
```

In this example, the system will:
1.  Create shims for the `git` binary. It assumes `git` is already in the system's `PATH`.
2.  Create a symbolic link for `.gitconfig`.
3.  Set up Zsh aliases.

The system will not attempt to download or install `git`. It's up to you to ensure the tool is available on the system.
