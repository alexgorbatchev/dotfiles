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
import { always } from '@gitea/dotfiles';

c.zsh((shell) =>
  shell
    .environment({ TOOL_HOME: `${ctx.toolDir}` })
    .aliases({ t: 'tool', ts: 'tool status' })
    .completions('completions/_tool')
    .always(always/* zsh */`
      function tool-helper() {
        tool --config "$TOOL_HOME/config.toml" "$@"
      }
    `)
);
```

### `.bash(callback: ShellConfiguratorCallback)`

Configures Bash using the same chainable API.

```typescript
import { always } from '@gitea/dotfiles';

c.bash((shell) =>
  shell
    .environment({ TOOL_HOME: `${ctx.toolDir}` })
    .aliases({ t: 'tool', ts: 'tool status' })
    .completions('completions/tool.bash')
    .always(always/* bash */`
      function tool-helper() {
        tool --config "$TOOL_HOME/config.toml" "$@"
      }
    `)
);
```

### `.powershell(callback: ShellConfiguratorCallback)`

Configures PowerShell-specific behaviour while keeping the fluent style.

```typescript
import { always } from '@gitea/dotfiles';

c.powershell((shell) =>
  shell
    .environment({ TOOL_HOME: `${ctx.homeDir}\\.tool` })
    .aliases({ t: 'tool', ts: 'tool status' })
    .completions('completions/tool.ps1')
    .always(always/* powershell */`
      function tool-helper {
        tool --config "$env:TOOL_HOME\config.toml" @args
      }
    `)
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
    TOOL_CONFIG_DIR: `${ctx.homeDir}/.config/tool`,
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
import { always, once } from '@gitea/dotfiles';

c.zsh((shell) =>
  shell
    .once(once/* zsh */`
      # Expensive operations (run only once after installation)
      tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
    `)
    .always(always/* zsh */`
      # Fast runtime setup (runs every shell startup)
      function tool-helper() {
        tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
      }
      
      # Key bindings
      bindkey '^T' tool-fuzzy-search
    `)
);
```

## Script Execution Timing

### Always Scripts

Run every time the shell starts (traditional behavior):

```typescript
always/* zsh */`
  # Fast operations only
  function quick-helper() {
    tool "$@"
  }
`
```

### Once Scripts

Run only once after tool installation or updates (for expensive operations):

```typescript
once/* zsh */`
  # Expensive operations
  tool gen-completions --shell zsh > "${ctx.generatedDir}/completions/_tool"
  tool build-cache
`
```

## Path Usage in Shell Scripts

Always use ToolConfigContext variables for paths:

```typescript
c.zsh((shell) =>
  shell
    .environment({
      TOOL_CONFIG_DIR: `${ctx.toolDir}`,
      TOOL_DATA_DIR: `${ctx.homeDir}/.local/share/tool`
    })
    .always(always/* zsh */`
      # Reference tool directory
      if [[ -f "${ctx.toolDir}/shell/key-bindings.zsh" ]]; then
        source "${ctx.toolDir}/shell/key-bindings.zsh"
      fi
      
      # Reference other tools
      FZF_DIR="${ctx.getToolDir('fzf')}"
      [[ -d "$FZF_DIR" ]] && export FZF_BASE="$FZF_DIR"
    `)
);
```

## Cross-Shell Compatibility

Define the same configuration for multiple shells:

```typescript
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

c.zsh(configureCommonShell)
 .bash(configureCommonShell)
 .powershell((shell) =>
   configureCommonShell(shell).environment({ TOOL_HOME: `${ctx.toolDir}` })
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