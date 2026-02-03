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
    .env({ VAR: 'value' })              // Environment variables (PATH prohibited)
    .path('$HOME/.local/bin')            // Add directory to PATH
    .aliases({ t: 'tool' })             // Shell aliases
    .functions({ myFunc: 'cmd' })       // Shell functions
    .completions('completions/_tool')   // Completion file path
    .sourceFile('shell/init.zsh')       // Source a file (skips if missing)
    .sourceFunction('myFunc')           // Source output of a function (source <(myFunc))
    .source('tool env --shell zsh')     // Source output of inline shell code
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
        .env({ TOOL_HOME: ctx.currentDir })
        .path(`${ctx.currentDir}/bin`) // Add tool's bin directory to PATH
        .aliases({ t: 'tool', ts: 'tool status' })
        .completions('completions/_tool')
        .functions({
          'tool-helper': 'tool --config "$TOOL_HOME/config.toml" "$@"',
        })
    )
);
```

## PATH Modifications

### `.path()` - Add Directory to PATH

Add a directory to the PATH environment variable. Paths are deduplicated during shell init generation.

```typescript
.zsh((shell) =>
  shell
    .path('$HOME/.local/bin')           // Static path with shell variable
    .path(`${ctx.currentDir}/bin`)      // Dynamic path using context
)
```

**Why use `.path()` instead of `.env({ PATH: ... })`?**

- Paths are automatically deduplicated across all tools
- Proper ordering is maintained (prepended to PATH by default)
- TypeScript prevents using `PATH` in `.env()` with a clear error message

**Note**: Setting `PATH` via `.env({ PATH: '...' })` is prohibited. Use `.path()` instead.

## Shell Functions

### `.functions()` - Define Shell Functions

Define shell functions that are generated into the shell init file.

```typescript
.zsh((shell) =>
  shell.functions({
    'my-command': 'echo "Hello, world!"',
    'tool-setup': 'cd /some/path && ./setup.sh',
  })
)
```

**Generated output:**

```zsh
my-command() {
  echo "Hello, world!"
}

tool-setup() {
  cd /some/path && ./setup.sh
}
```

This is useful for defining wrapper functions or custom commands.

## Sourcing Files and Functions

### `.sourceFile()` - Source a Script File

Source a script file during shell initialization. If the file doesn't exist, it's silently skipped.
The file is sourced in a way that respects the configured HOME directory while still affecting the current shell.

```typescript
.zsh((shell) =>
  shell
    .sourceFile('init.zsh')                    // Relative to toolDir
    .sourceFile(`${ctx.currentDir}/shell.zsh`) // Absolute path for installed archives
)
```

- **Relative paths** → resolve to `toolDir` (directory containing `.tool.ts`)
- **Absolute paths** → used as-is
- File existence is checked before sourcing

**Generated output (zsh/bash):**

```zsh
__dotfiles_source_mytool_0() {
  [[ -f "/path/to/init.zsh" ]] && cat "/path/to/init.zsh"
}
source <(__dotfiles_source_mytool_0)
unset -f __dotfiles_source_mytool_0
```

The function is automatically cleaned up after sourcing to avoid shell pollution.

### `.sourceFunction()` - Source Function Output

Source the output of a shell function defined via `.functions()`. This is ideal for tools requiring dynamic initialization (e.g., `eval "$(tool init)"`).

**Important**: When a function is used with `.sourceFunction()`, its body must **output shell code to stdout**. This output is then sourced (executed) in the current shell. Common tools like `fnm`, `pyenv`, `rbenv`, and `zoxide` have commands that print shell code for this purpose.

```typescript
.zsh((shell) =>
  shell
    .functions({
      // fnm env --use-on-cd PRINTS shell code like:
      // export FNM_DIR="/Users/me/.fnm"
      // export PATH="...fnm/bin:$PATH"
      initFnm: 'fnm env --use-on-cd',
    })
    .sourceFunction('initFnm')
)
```

**Generated output (zsh/bash):**

```zsh
initFnm() {
  fnm env --use-on-cd
}
source <(initFnm)
```

**Key differences from `.always()`:**

- `.sourceFunction()` emits `source <(fnName)` directly without any wrapping
- The function's stdout is sourced as shell code, running in the current shell
- Type-safe: only accepts function names defined via `.functions()`

### `.source()` - Source Inline Shell Code Output

Source the output of inline shell code without defining a named function. The content must **print shell code to stdout** - this output is then sourced.

```typescript
.zsh((shell) =>
  shell
    // fnm env prints shell code like "export PATH=..."
    .source('fnm env --use-on-cd')
    // Or echo shell code directly
    .source('echo "export MY_VAR=value"')
)
```

**Generated output (zsh/bash):**

```zsh
__dotfiles_source_mytool_0() {
  fnm env --use-on-cd
}
source <(__dotfiles_source_mytool_0)
unset -f __dotfiles_source_mytool_0
```

Use `.source()` when:

- You need to source command output inline without a named function
- The command prints shell code that should be executed in the current shell
- You don't need to call the function by name elsewhere

For reusable functions, use `.functions()` + `.sourceFunction()` instead.

## Script Timing

### `.always()` - Every Shell Startup

For fast inline operations that run on every shell startup:

```typescript
.zsh((shell) =>
  shell.always(`
    eval "$(tool init zsh)"
  `)
)
```

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
  const configureShell = (shell) => shell.env({ TOOL_HOME: ctx.currentDir }).aliases({ t: 'tool' });

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
      shell.env({
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

- Use declarative methods (`.env()`, `.aliases()`) for simple config
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
      shell.env({
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
