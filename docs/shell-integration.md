# Shell Integration

The shell integration system provides powerful ways to configure shell environments, aliases, functions, and initialization scripts across different shells.

## Overview

The shell integration system supports:
- **Declarative Configuration**: Structured objects for environment variables and aliases
- **Script-Based Configuration**: Custom shell functions and complex logic
- **Cross-Shell Support**: Zsh, Bash, and PowerShell
- **Performance Optimization**: Always vs once script execution timing

## Shell Methods

### `.zsh(callback: ShellConfiguratorCallback)`

Configures Zsh-specific behaviour through a fluent configurator.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .environment({ TOOL_HOME: `${ctx.toolDir}` })
        .aliases({ t: 'tool', ts: 'tool status' })
        .completions('completions/_tool')
        .always(`
          function tool-helper() {
            tool --config "$TOOL_HOME/config.toml" "$@"
          }
        `)
    )
);
```

### `.bash(callback: ShellConfiguratorCallback)`

Configures Bash using the same chainable API.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .bash((shell) =>
      shell
        .environment({ TOOL_HOME: `${ctx.toolDir}` })
        .aliases({ t: 'tool', ts: 'tool status' })
        .completions('completions/tool.bash')
        .always(`
          function tool-helper() {
            tool --config "$TOOL_HOME/config.toml" "$@"
          }
        `)
    )
);
```

### `.powershell(callback: ShellConfiguratorCallback)`

Configures PowerShell-specific behaviour while keeping the fluent style.

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .powershell((shell) =>
      shell
        .environment({ TOOL_HOME: `${ctx.projectConfig.paths.homeDir}\\.tool` })
        .aliases({ t: 'tool', ts: 'tool status' })
        .completions('completions/tool.ps1')
        .always(`
          function tool-helper {
            tool --config "$env:TOOL_HOME\config.toml" @args
          }
        `)
    )
);
```

## Configuration Object

```typescript
interface IShellConfig {
  completions?: ShellCompletionConfig;  // Shell completions
  shellInit?: ShellScript[];           // Shell initialization scripts
  aliases?: Record<string, string>;    // Shell aliases (alias name -> command)
  environment?: Record<string, string>; // Environment variables (var name -> value)
}
```

## Declarative vs Script-Based Configuration

### Declarative Configuration

Use the configurator for concise, cross-shell friendly declarations:

**Environment Variables:**
```typescript
c.zsh((shell) =>
  shell.environment({
    TOOL_CONFIG_DIR: `${ctx.projectConfig.paths.homeDir}/.config/tool`,
    TOOL_DEBUG: 'true',
    TOOL_MODE: 'production'
  })
);
```

**Aliases:**
```typescript
c.zsh((shell) =>
  shell.aliases({
    t: 'tool',
    tl: 'tool list',
    ts: 'tool status --verbose',
    tc: 'tool config edit'
  })
);
```

### Script-Based Configuration

Use shell scripts for complex functions and logic:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .once(`
          # Expensive operations (run only once after installation)
          tool gen-completions --shell zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
        `)
        .always(`
          # Fast runtime setup (runs every shell startup)
          function tool-helper() {
            tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
          }
          
          # Key bindings
          bindkey '^T' tool-fuzzy-search
        `)
    )
);
```

## Script Execution Timing

### Always Scripts

Run every time the shell starts (traditional behavior):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(`
        # Fast operations only
        function quick-helper() {
          tool "$@"
        }
      `)
    )
);
```

### Once Scripts

Run only once after tool installation or updates (for expensive operations):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.once(`
        # Expensive operations
        tool gen-completions --shell zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
        tool build-cache
      `)
    )
);
```

## Path Usage in Shell Scripts

Always use ToolConfigContext variables for paths:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .environment({
          TOOL_CONFIG_DIR: `${ctx.toolDir}`,
          TOOL_DATA_DIR: `${ctx.projectConfig.paths.homeDir}/.local/share/tool`
        })
        .source('shell/key-bindings.zsh')
        .always(`
          # shell.source() skips missing files silently.
          
          # Reference other tools
          FZF_DIR="${ctx.getToolDir('fzf')}"
          [[ -d "$FZF_DIR" ]] && export FZF_BASE="$FZF_DIR"
        `)
    )
);
```

## Cross-Shell Compatibility

Define the same configuration for multiple shells:

```typescript
import { defineTool } from '@gitea/dotfiles';
import type { IShellConfigurator } from '@gitea/dotfiles';

const configureCommonShell = (shell: IShellConfigurator): IShellConfigurator =>
  shell
    .environment({
      TOOL_HOME: `${ctx.toolDir}`,
      TOOL_DEBUG: 'false'
    })
    .aliases({
      t: 'tool',
      ts: 'tool status'
    });

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh(configureCommonShell)
    .bash(configureCommonShell)
    .powershell((shell) =>
      configureCommonShell(shell).environment({ TOOL_HOME: `${ctx.toolDir}` })
    )
);
```

## Benefits

**Declarative Configuration:**
- Clean, structured definition
- Automatic shell-specific syntax generation
- Type safety and validation
- Cross-shell compatibility
- Performance optimized

**Script-Based Configuration:**
- Complex shell functions
- Conditional logic
- Advanced shell features
- Shell-specific optimizations

## Best Practices

- ✅ Use declarative config for simple environment variables and aliases
- ✅ Use script-based config for complex functions and logic
- ✅ Use `once` scripts for expensive operations
- ✅ Use `always` scripts for fast runtime setup
- ✅ Use context variables for all paths
- ✅ Test across target shells

## Next Steps

- [Completions](./completions.md) - Set up command completions
- [Context API](./context-api.md) - Learn about path resolution
- [Common Patterns](./common-patterns.md) - See real-world examples