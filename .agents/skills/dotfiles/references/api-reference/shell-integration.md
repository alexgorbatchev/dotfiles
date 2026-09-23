# Shell Integration

Configure shell environments, aliases, completions, and functions.

## Shell Methods

| Method                  | Shell                                        |
| ----------------------- | -------------------------------------------- |
| `.shell(callback)`      | All supported shells (Zsh, Bash, PowerShell) |
| `.zsh(callback)`        | Zsh                                          |
| `.bash(callback)`       | Bash                                         |
| `.powershell(callback)` | PowerShell                                   |

Each callback receives:

- `shell` - Shell configurator for setting up environment, aliases, completions, etc.
- `ctx` - Context with `version` property (only available after installation)

For other context properties (`toolDir`, `currentDir`, `projectConfig`, etc.), use the outer `ctx` from `defineTool`.

## Configurator Methods

```typescript builder
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
    .once(`tool cache rebuild`)         // Run once at the next shell start
)
```

Two further spellings exist for calls above, and record exactly the same thing:

- `.alias(values)` is `.aliases(values)`.
- `.script(content)` is `.always(content)`, and `.script('once' | 'always', content)`
  names the timing as an argument instead of in the method name.

Prefer `.aliases()`, `.always()` and `.once()`: they say the same thing and are what the
rest of this documentation uses.

`.always()`, `.once()`, `.sourceFile()`, `.sourceFunction()` and `.source()` share one
ordered list, so the generated shell block runs them in the order they were called.
Environment variables are hoisted into a section of their own above every tool block;
inside the tool's block, aliases come first, then functions, then that list -- which is
why a function declared with `.functions()` can be called from a script that follows it.

## Basic Example

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell
        .env({ TOOL_HOME: ctx.currentDir })
        .path(`${ctx.currentDir}/bin`) // Add tool's bin directory to PATH
        .aliases({ t: "tool", ts: "tool status" })
        .completions("completions/_tool")
        .functions({
          "tool-helper": 'tool --config "$TOOL_HOME/config.toml" "$@"',
        }),
    ),
);
```

## PATH Modifications

### `.path()` - Add Directory to PATH

Add a directory to the PATH environment variable. Paths are deduplicated during shell init generation.

```typescript builder
.zsh((shell) =>
  shell
    .path('$HOME/.local/bin')           // Static path with shell variable
    .path(`${ctx.currentDir}/bin`)      // Dynamic path using context
)
```

**Why use `.path()` instead of `.env({ PATH: ... })`?**

- Paths are automatically deduplicated across all tools
- Proper ordering is maintained (prepended to PATH; the dotfiles shim target directory is placed ahead of tool-defined paths)
- TypeScript prevents using `PATH` in `.env()` with a clear error message

**Note**: Setting `PATH` via `.env({ PATH: '...' })` is prohibited. Use `.path()` instead.

## Shell Functions

### `.functions()` - Define Shell Functions

Define shell functions that are generated into the shell init file.

```typescript builder
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

```typescript builder
.zsh((shell) =>
  shell
    .sourceFile('init.zsh')                    // Relative to toolDir
    .sourceFile(`${ctx.currentDir}/shell.zsh`) // Absolute path for installed archives
)
```

- **Relative paths** -> resolve to `toolDir` (directory containing `.tool.ts`)
- **Absolute paths** -> used as-is
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

```typescript builder
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

```typescript builder
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

```typescript builder
.zsh((shell) =>
  shell.always(`
    eval "$(tool init zsh)"
  `)
)
```

### `.once()` - After Installation

For work that is too expensive to repeat on every shell start, such as building a
cache. The script is written to a generated once-file that runs at the next shell
start and deletes itself afterwards:

```typescript
export default defineTool((install) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.once(`
        tool cache rebuild --quiet
      `),
    ),
);
```

Do not generate a completion file this way. `.completions({ cmd })` runs the command
against the installed binary and owns the output path, while a once script runs at the
next shell start, after the point where the completion had to exist. See
[shell-completions.md](shell-completions.md).

## Cross-Shell Configuration

Configure environment variables, PATH modifications, aliases, functions, and scripts across all supported shells (`zsh`, `bash`, `powershell`) using `.shell()`:

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .shell((shell) => {
      shell.env({ TOOL_HOME: ctx.currentDir }).aliases({ t: "tool" }).path(`${ctx.currentDir}/bin`);
    })
    .zsh((shell) => {
      shell.completions("completions/_tool");
    }),
);
```

## Path References

Always use context variables from the outer `ctx`:

```typescript
export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/tool" })
    .bin("tool")
    .zsh((shell) =>
      shell.env({
        TOOL_CONFIG: ctx.toolDir, // Tool config directory
        TOOL_DATA: "~/.local/share/tool",
      }).always(`
          FZF_DIR="${ctx.projectConfig.paths.binariesDir}/fzf"
          [[ -d "$FZF_DIR" ]] && export FZF_BASE="$FZF_DIR"
        `),
    ),
);
```

## Best Practices

- Use declarative methods (`.env()`, `.aliases()`) for simple config
- Use `.always()` for fast runtime setup only
- Use `.once()` for expensive one-off work such as cache building, never for completions
- Use context variables for all paths - never hardcode
- Avoid shadowing binaries with shell aliases or functions across different tools (the system detects and warns on alias/function/binary collisions during `dotfiles state generate` and `dotfiles tool validate`)

## Symbolic Links

Create symlinks for configuration files with `.symlink()`.

### Syntax

```typescript no-typecheck
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
  install("github-release", { repo: "owner/my-tool" })
    .bin("my-tool")
    .symlink("./config.toml", "~/.config/my-tool/config.toml")
    .symlink("./themes/", "~/.config/my-tool/themes")
    .zsh((shell) =>
      shell.env({
        MY_TOOL_CONFIG: "~/.config/my-tool/config.toml",
      }),
    ),
);
```

### Common Patterns

```typescript builder
// Configuration files
.symlink('./gitconfig', '~/.gitconfig')

// Directories
.symlink('./themes/', '~/.config/tool/themes')

// Scripts
.symlink('./scripts/helper.sh', '~/bin/helper')
```

### Correct vs Incorrect

```typescript builder
// ✅ Tilde expansion (recommended)
.symlink('./config.toml', '~/.config/tool/config.toml')

// ❌ Hardcoded path
.symlink('./config.toml', '/home/user/.config/tool/config.toml')
```

## Directories

Ensure directories exist with explicit permissions using `.ensureDir()`. Useful for sensitive directories such as `~/.ssh` or `~/.gnupg`.

```typescript builder
.ensureDir('~/.ssh', { mode: '0700' })
```

## Copies

Copy static files or directory trees into place using `.copy()`.

```typescript builder
.copy('config', '~/.config/tool/config', { mode: '0644', conflict: 'keep-local' })
```

## Managed Blocks

Own a delimited section of a shared configuration file (e.g. `~/.ssh/config`, `~/.bashrc`, `~/.gitconfig`) with `.block()`. Changes made by the user or external tools outside the marker lines are never touched or conflicted. Any number of tools may own blocks in one file, as long as each block has its own `id`; see [Conflicting File Declarations](#conflicting-file-declarations).

```typescript builder
.block('~/.ssh/config', {
  id: 'includes',
  mode: '0600',
  position: 'top',
  conflict: 'merge',
  content: ({ toolDir }) => `Include ${toolDir}/config`,
})
```

## Templates

Render dynamic configuration templates using `.template()`. Variables support project placeholders (e.g. `{paths.homeDir}`, `{toolName}`) and author-defined values, resolved with 3-way drift detection.

```typescript builder
.template('./gitconfig.template', '~/.gitconfig', {
  mode: '0644',
  conflict: 'merge',
  variables: {
    email: 'alex@example.com',
  },
})
```

## Declaration Checks

The declarations below are checked when the configuration loads, before any command acts on it. A declaration that breaks one of the rules below fails the load with an error that names the tool's configuration file, the tool and the offending value, so nothing is linked, copied or written for any tool. A value that is not recognised is never replaced by its default: a misspelled `conflict` policy on a block or template would otherwise back up and replace a file the author asked to keep.

| Declaration    | Rule                                                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.symlink()`   | `source` and `target` must not be empty                                                                                                                                                                                                                         |
| `.copy()`      | `source` and `target` must not be empty                                                                                                                                                                                                                         |
| `.ensureDir()` | `path` must not be blank                                                                                                                                                                                                                                        |
| `.block()`     | `target` must not be blank; `id` must not be empty and may contain only letters, digits, `.`, `-` and `_`                                                                                                                                                       |
| `.template()`  | `source` and `target` must not be blank                                                                                                                                                                                                                         |
| shell scripts  | the argument of `.once()`, `.always()`, `.script()`, `.sourceFile()`, `.sourceFunction()` and `.source()` must not be empty; `.script(kind, content)` fails the load for a `kind` that is none of `once`, `always`, `sourceFile`, `source` and `sourceFunction` |

The options are checked the same way wherever they appear. Leaving an option out selects its default; only an unrecognised value is rejected.

| Option     | Accepted values                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mode`     | An octal permission from `0000` to `0777`, written as `0600`, `600` or `0o600`                                                       |
| `position` | `top` or `bottom` (the default), on `.block()`; decides where a block not yet in the file is inserted                                |
| `conflict` | `merge` (the default), `keep-local`, `overwrite` or `prompt`, on `.block()` and `.template()`. `.copy()` rejects any other value too |

### Conflicting File Declarations

A file that `.symlink()`, `.copy()` or `.template()` writes has one owner, and so does each block `id` within a file that `.block()` writes. This is checked across all tools when the configuration loads. Targets are compared as paths, after placeholders and `~` are resolved, so `~/.ssh/config`, `$HOME/.ssh/config` and `{paths.homeDir}/.ssh/config` name the same file. The load fails, naming both tools, their configuration files, both declarations and the resolved path, when:

- two blocks share a file and an `id`, whether they belong to one tool or to two. Blocks with different ids sharing a file are what `.block()` is for, and pass.
- two `.symlink()`, `.copy()` or `.template()` declarations, in any combination, write the same file.
- a block targets a file a `.symlink()`, `.copy()` or `.template()` writes. Such a declaration replaces the whole file, so the block would be taken for a local edit, or, through a symlink, written into the source file in your repository.

A disabled tool, and a tool whose `hostname` does not match the machine, write nothing and are left out of the check. Only equal paths are compared: a declaration that writes beneath a directory another declaration links or copies is not detected. To use a different file on each platform, declare the target once in each `.platform()` block rather than once outside them and again inside one.
