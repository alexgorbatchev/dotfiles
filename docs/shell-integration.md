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

## Symbolic Links

Create symlinks for configuration files with `.symlink()`.

### Syntax

```typescript
.symlink(source, target)
```

| Parameter | Description |
|-----------|-------------|
| `source` | Path to source file/directory. `./` is relative to tool config directory |
| `target` | Absolute path for symlink. Use context variables or `~` |

### Path Resolution

| Source | Resolution |
|--------|------------|
| `./config.toml` | Relative to `.tool.ts` directory |
| `/etc/tool.conf` | Absolute path |

| Target | Resolution |
|--------|------------|
| `~/.config/tool` | Expanded to `ctx.projectConfig.paths.homeDir` |
| `${ctx.projectConfig.paths.homeDir}/.config/tool` | Explicit context variable |

### Example

```
tools/my-tool/
├── my-tool.tool.ts
├── config.toml
└── themes/
    ├── dark.toml
    └── light.toml
```

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/my-tool' })
    .bin('my-tool')
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/my-tool/config.toml`)
    .symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/my-tool/themes`)
    .zsh((shell) =>
      shell.environment({
        MY_TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/my-tool/config.toml`,
      })
    )
);
```

### Common Patterns

```typescript
// Configuration files
.symlink('./gitconfig', `${ctx.projectConfig.paths.homeDir}/.gitconfig`)

// Directories
.symlink('./themes/', `${ctx.projectConfig.paths.homeDir}/.config/tool/themes`)

// Scripts
.symlink('./scripts/helper.sh', `${ctx.projectConfig.paths.homeDir}/bin/helper`)
```

### Correct vs Incorrect

```typescript
// ✅ Context variable
.symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)

// ✅ Tilde expansion
.symlink('./config.toml', '~/.config/tool/config.toml')

// ❌ Hardcoded path
.symlink('./config.toml', '/home/user/.config/tool/config.toml')
```