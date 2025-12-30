# Shell Integration

Configure shell environments, aliases, completions, and functions.

## Shell Methods

| Method | Shell |
|--------|-------|
| `.zsh(callback)` | Zsh |
| `.bash(callback)` | Bash |
| `.powershell(callback)` | PowerShell |

## Configurator Methods

```typescript
.zsh((shell) =>
  shell
    .environment({ VAR: 'value' })      // Environment variables
    .aliases({ t: 'tool' })             // Shell aliases
    .completions('completions/_tool')   // Completion file path
    .source('shell/init.zsh')           // Source a file (skips if missing)
    .always(`function helper() {...}`)  // Run every shell startup
    .once(`tool gen-completions`)       // Run once after install
)
```

## Basic Example

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell
        .environment({ TOOL_HOME: ctx.currentDir })
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

## Script Timing

### `.always()` - Every Shell Startup

For fast operations only:

```typescript
.zsh((shell) =>
  shell.always(`
    function quick-helper() { tool "$@"; }
  `)
)
```

### `.once()` - After Installation

For expensive operations:

```typescript
.zsh((shell) =>
  shell.once(`
    tool gen-completions --zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
  `)
)
```

## Cross-Shell Configuration

Share configuration across shells:

```typescript
const configureShell = (shell, ctx) =>
  shell
    .environment({ TOOL_HOME: ctx.currentDir })
    .aliases({ t: 'tool' });

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) => configureShell(shell, ctx))
    .bash((shell) => configureShell(shell, ctx))
);
```

## Path References

Always use context variables:

```typescript
.zsh((shell) =>
  shell
    .environment({
      TOOL_CONFIG: ctx.toolDir,                              // Tool config directory
      TOOL_DATA: `${ctx.projectConfig.paths.homeDir}/.local/share/tool`,
    })
    .always(`
      FZF_DIR="${ctx.projectConfig.paths.binariesDir}/fzf"
      [[ -d "$FZF_DIR" ]] && export FZF_BASE="$FZF_DIR"
    `)
)
```

## Best Practices

- Use declarative methods (`.environment()`, `.aliases()`) for simple config
- Use `.always()` for fast runtime setup only
- Use `.once()` for expensive operations (completion generation, cache building)
- Use context variables for all paths - never hardcode