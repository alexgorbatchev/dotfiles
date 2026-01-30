# Shell Integration

Configure shell environments, aliases, completions, and functions.

## Shell Methods

| Method                  | Shell      |
| ----------------------- | ---------- |
| `.zsh(callback)`        | Zsh        |
| `.bash(callback)`       | Bash       |
| `.powershell(callback)` | PowerShell |

Each callback receives:

- `shell` - Shell configurator for setting up environment, aliases, completions, etc.
- `ctx` - Context with `version` property (only available after installation)

For other context properties (`toolDir`, `currentDir`, `projectConfig`, etc.), use the outer `ctx` from `defineTool`.

## Configurator Methods

```typescript
.zsh((shell) =>
  shell
    .environment({ VAR: 'value' })      // Environment variables
    .aliases({ t: 'tool' })             // Shell aliases
    .functions({ myFunc: 'cmd' })       // Shell functions with HOME override
    .completions('completions/_tool')   // Completion file path
    .sourceFile('shell/init.zsh')       // Source a file (skips if missing)
    .sourceFunction('myFunc')           // Source output of a function (source <(myFunc))
    .always(`eval "$(tool init)"`)      // Run every shell startup
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
        .functions({
          'tool-helper': 'tool --config "$TOOL_HOME/config.toml" "$@"',
        })
    )
);
```

## Shell Functions

### `.functions()` - Define Shell Functions

Define shell functions with automatic HOME override. Function bodies are wrapped
in subshells with HOME set to the configured home directory, preventing tools
from accessing the real home directory.

```typescript
.zsh((shell) =>
  shell.functions({
    'my-command': 'echo "Running with HOME=$HOME"',
    'tool-setup': 'cd /some/path && ./setup.sh',
  })
)
```

**Generated output:**

```zsh
my-command() {
  (
    HOME="/configured/home/path"
    echo "Running with HOME=$HOME"
  )
}
```

This is useful when you need functions that should operate with the sandboxed
HOME environment, similar to `always()` and `once()` scripts.

## Sourcing Files and Functions

### `.sourceFile()` - Source a Script File

Source a script file during shell initialization. If the file doesn't exist, it's silently skipped.

```typescript
.zsh((shell) =>
  shell
    .sourceFile('init.zsh')                    // Relative to toolDir
    .sourceFile(`${ctx.currentDir}/shell.zsh`) // Absolute path for installed archives
)
```

- **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
- **Absolute paths** → used as-is
- The file existence is checked at shell startup

### `.sourceFunction()` - Source Function Output

Source the output of a shell function defined via `.functions()`. This is ideal for tools requiring dynamic initialization (e.g., `eval "$(tool init)"`).

```typescript
.zsh((shell) =>
  shell
    .functions({
      initFnm: 'fnm env --use-on-cd',
    })
    .sourceFunction('initFnm')
)
```

**Generated output (zsh/bash):**

```zsh
initFnm() {
  (
    HOME="/configured/home/path"
    fnm env --use-on-cd
  )
}
source <(initFnm)
```

**Key differences from `.always()`:**

- `.sourceFunction()` emits `source <(fnName)` directly without any wrapping
- The function's stdout is sourced as shell code, running in the current shell
- Type-safe: only accepts function names defined via `.functions()`

## Script Timing

### `.always()` - Every Shell Startup

For fast inline operations. Runs in a subshell with HOME override:

```typescript
.zsh((shell) =>
  shell.always(`
    eval "$(tool init zsh)"
  `)
)
````

### `.once()` - After Installation

For expensive operations:

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.once(`
        tool gen-completions --zsh > "${ctx.projectConfig.paths.generatedDir}/completions/_tool"
      `)
    )
);
```

## Cross-Shell Configuration

Share configuration across shells using the outer `ctx` from `defineTool`:

```typescript
export default defineTool((install, ctx) => {
  const configureShell = (shell) => shell.environment({ TOOL_HOME: ctx.currentDir }).aliases({ t: 'tool' });

  return install('github-release', { repo: 'owner/tool' }).bin('tool').zsh(configureShell).bash(configureShell);
});
```

## Path References

Always use context variables from the outer `ctx`:

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.environment({
        TOOL_CONFIG: ctx.toolDir, // Tool config directory
        TOOL_DATA: '~/.local/share/tool',
      }).always(`
          FZF_DIR="${ctx.projectConfig.paths.binariesDir}/fzf"
          [[ -d "$FZF_DIR" ]] && export FZF_BASE="$FZF_DIR"
        `)
    )
);
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

| Parameter | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `source`  | Path to source file/directory. `./` is relative to tool config directory |
| `target`  | Absolute path for symlink. Use context variables or `~`                  |

### Path Resolution

| Source           | Resolution                       |
| ---------------- | -------------------------------- |
| `./config.toml`  | Relative to `.tool.ts` directory |
| `/etc/tool.conf` | Absolute path                    |

| Target           | Resolution                                     |
| ---------------- | ---------------------------------------------- |
| `~/.config/tool` | Expanded automatically via home path expansion |

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
export default defineTool((install) =>
  install('github-release', { repo: 'owner/my-tool' })
    .bin('my-tool')
    .symlink('./config.toml', '~/.config/my-tool/config.toml')
    .symlink('./themes/', '~/.config/my-tool/themes')
    .zsh((shell) =>
      shell.environment({
        MY_TOOL_CONFIG: '~/.config/my-tool/config.toml',
      })
    )
);
```

### Common Patterns

```typescript
// Configuration files
.symlink('./gitconfig', '~/.gitconfig')

// Directories
.symlink('./themes/', '~/.config/tool/themes')

// Scripts
.symlink('./scripts/helper.sh', '~/bin/helper')
```

### Correct vs Incorrect

```typescript
// ✅ Tilde expansion (recommended)
.symlink('./config.toml', '~/.config/tool/config.toml')

// ❌ Hardcoded path
.symlink('./config.toml', '/home/user/.config/tool/config.toml')
```
