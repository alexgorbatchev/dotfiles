# Shell Integration and Hooks

## Table of Contents

- [Shell Integration](#shell-integration)
  - [Shell Methods](#shell-methods)
  - [Configurator Methods](#configurator-methods)
  - [Basic Example](#basic-example)
  - [PATH Modifications](#path-modifications)
  - [Shell Functions](#shell-functions)
  - [Sourcing Files and Functions](#sourcing-files-and-functions)
  - [Script Timing](#script-timing)
  - [Cross-Shell Configuration](#cross-shell-configuration)
  - [Path References](#path-references)
  - [Best Practices](#best-practices)
  - [Symbolic Links](#symbolic-links)
- [Command Completions](#command-completions)
  - [Configuration Options](#configuration-options)
  - [Shell Callback Context](#shell-callback-context)
  - [Static Completions (source)](#static-completions-source)
  - [URL-Based Completions](#url-based-completions)
  - [Dynamic Completions (cmd)](#dynamic-completions-cmd)
  - [Binary Name Override](#binary-name-override)
  - [CLI Completions](#cli-completions)
- [Hooks](#hooks)
  - [Basic Usage](#basic-usage)
  - [Hook Events](#hook-events)
  - [Context Properties](#context-properties)
  - [Examples](#examples)
  - [Error Handling](#error-handling)
  - [Environment Variables in Installation](#environment-variables-in-installation)
  - [Best Practices](#best-practices-1)
  - [Hook Execution Order](#hook-execution-order)
  - [Complete Example](#complete-example)

---

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

---

# Command Completions

Tab completions are configured per-shell using `.completions()`:

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions('completions/tool.bash'))
```

> **Lifecycle**: All completions are generated only after `dotfiles install <tool>` succeeds,
> not during `dotfiles generate`. This ensures cmd-based completions can execute the installed
> binary and callbacks receive the actual installed version in `ctx.version`.

## Configuration Options

| Property | Description                                                                              |
| -------- | ---------------------------------------------------------------------------------------- |
| `source` | Path to completion file (relative to toolDir, or absolute path within extracted archive) |
| `url`    | URL to download completion file or archive from                                          |
| `cmd`    | Command to generate completions dynamically                                              |
| `bin`    | Binary name for completion filename (when different from tool name)                      |

**Note**: Use one of these combinations:

- `'_tool.zsh'` - String path (relative to toolDir or absolute)
- `{ source }` - Static file (relative to toolDir or absolute)
- `{ cmd }` - Generate dynamically by running a command
- `{ url }` - Download direct completion file from URL (filename derived from URL)
- `{ url, source }` - Download archive, extract, use source as path to file within

## Shell Callback Context

The shell callback receives two parameters:

- `shell` - The shell configurator for setting up completions, aliases, etc.
- `ctx` - Context with `version` property (only available after installation)

For other context properties (`toolDir`, `currentDir`, `projectConfig`, etc.), use the outer `ctx` from `defineTool`.

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) => shell.completions('completions/_tool.zsh'))
);
```

## Static Completions (source)

For completion files bundled in tool archives:

```typescript
// Simple path relative to extracted archive
.zsh((shell) => shell.completions('completions/_tool.zsh'))

// Glob pattern for versioned directories
.zsh((shell) => shell.completions('*/complete/_rg'))
```

**Supported glob patterns**: `*`, `**`, `?`, `[abc]`

## URL-Based Completions

For downloading completions from external sources. Supports both direct files and archives.

### Direct File Download

```typescript
// Direct completion file download (source is optional - derived from URL)
.zsh((shell) => shell.completions({
  url: 'https://raw.githubusercontent.com/user/repo/main/completions/_tool'
}))
```

### Archive Download

```typescript
// Archive download with source path to file within
.zsh((shell) => shell.completions({
  url: 'https://github.com/user/repo/releases/download/v1.0/completions.tar.gz',
  source: `${ctx.currentDir}/completions/_tool.zsh`
}))
```

**Note**: For archives, `source` specifies the absolute path to the completion file within the extracted archive. For direct files, `source` is optional - the filename is derived from the URL.

### Version-Dependent URLs (Callback)

For completions that need the installed version in the URL, use a callback:

```typescript
// Direct file with version in URL
.zsh((shell) => shell.completions((ctx) => ({
  url: `https://raw.githubusercontent.com/user/repo/${ctx.version}/completions/_tool`
})))

// Archive with version in URL (requires source)
.zsh((shell) => shell.completions((ctx) => ({
  url: `https://github.com/user/repo/releases/download/${ctx.version}/completions.tar.gz`,
  source: `${ctx.currentDir}/completions/_tool.zsh`
})))
```

The callback receives `ctx` with:

- `version` - The installed version of the tool (e.g., `'v10.3.0'`, `'15.1.0'`), only available after installation completes

URL-based completions are downloaded to `ctx.currentDir`. For archives, they are automatically extracted and `source` specifies the path to the completion file within.

**Supported archive formats**: `.tar.gz`, `.tar.xz`, `.tar.bz2`, `.zip`, `.tar`, `.tar.lzma`, `.7z`

## Dynamic Completions (cmd)

For tools that generate completions at runtime (recommended for version-dependent completions):

```typescript
.zsh((shell) => shell.completions({ cmd: 'tool completion zsh' }))
.bash((shell) => shell.completions({ cmd: 'tool completion bash' }))
```

## Binary Name Override

When tool filename differs from binary name (e.g., `curl-script--fnm.tool.ts` for binary `fnm`):

```typescript
.zsh((shell) => shell.completions({
  cmd: 'fnm completions --shell zsh',
  bin: 'fnm'  // Results in '_fnm' instead of '_curl-script--fnm'
}))
```

## CLI Completions

The CLI generates its own completions to `<generatedDir>/shell-scripts/zsh/completions/_dotfiles`. Commands that accept tool names include all configured tools in their completions.

Reload completions after running `dotfiles generate`:

```bash
autoload -U compinit && compinit
```

---

# Hooks

Hooks allow custom logic at different stages of the installation process.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async (context) => {
      const { $, log, fileSystem } = context;
      await $`./tool init`;
      log.info('Tool initialized');
    })
);
```

## Hook Events

| Event            | When                         | Available Properties                       |
| ---------------- | ---------------------------- | ------------------------------------------ |
| `before-install` | Before installation starts   | `stagingDir`                               |
| `after-download` | After file download          | `stagingDir`, `downloadPath`               |
| `after-extract`  | After archive extraction     | `stagingDir`, `downloadPath`, `extractDir` |
| `after-install`  | After installation completes | `installedDir`, `binaryPaths`, `version`   |

## Context Properties

All hooks receive a context object with:

| Property        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `toolName`      | Name of the tool                                     |
| `currentDir`    | Stable path (symlink) for this tool                  |
| `stagingDir`    | Temporary installation directory                     |
| `systemInfo`    | Platform, architecture, home directory               |
| `fileSystem`    | File operations (mkdir, writeFile, exists, etc.)     |
| `replaceInFile` | Regex-based file text replacement                    |
| `log`           | Structured logging (trace, debug, info, warn, error) |
| `projectConfig` | Project configuration                                |
| `toolConfig`    | Tool configuration                                   |
| `$`             | Bun shell executor                                   |

> **Note:** The `stagingDir` and `projectConfig` properties form the base environment context (`IEnvContext`) that is also available to dynamic `env` functions in install parameters.

## Examples

### File Operations

```typescript
.hook('after-install', async ({ fileSystem, systemInfo, log }) => {
  const configDir = `${systemInfo.homeDir}/.config/tool`;
  await fileSystem.mkdir(configDir, { recursive: true });
  await fileSystem.writeFile(`${configDir}/config.toml`, 'theme = "dark"');
  log.info('Configuration created');
})
```

### Shell Commands

```typescript
.hook('after-install', async ({ $, installedDir }) => {
  // Run tool command
  await $`${installedDir}/tool init`;

  // Capture output
  const version = await $`./tool --version`.text();
})
```

### Executing Installed Binaries by Name

In `after-install` hooks, the shell's PATH is automatically enhanced to include the directories containing the installed binaries. This means you can execute freshly installed tools by name without specifying the full path:

```typescript
.hook('after-install', async ({ $ }) => {
  // The installed binary is automatically available by name
  await $`my-tool --version`;

  // No need to use full paths like:
  // await $`${installedDir}/bin/my-tool --version`;
})
```

This PATH enhancement only applies to `after-install` hooks where `binaryPaths` is available in the context.

### Shell Command Logging

Shell commands executed in hooks are automatically logged to help with debugging and visibility:

- Commands are logged as `$ command` at info level before execution
- Stdout lines are logged as `| line` at info level
- Stderr lines are logged as `| line` at error level (only if stderr has content)

Example output:

```
$ my-tool init
| Initializing configuration...
| Configuration complete!
```

This logging happens regardless of whether `.quiet()` is used on the shell command, since logging occurs at the hook executor level.

### Platform-Specific Setup

```typescript
.hook('after-install', async ({ systemInfo, $ }) => {
  if (systemInfo.platform === 'darwin') {
    await $`./setup-macos.sh`;
  } else if (systemInfo.platform === 'linux') {
    await $`./setup-linux.sh`;
  }
})
```

### File Text Replacement

```typescript
.hook('after-install', async ({ replaceInFile, installedDir }) => {
  // Replace a config value (returns true if replaced, false otherwise)
  const wasReplaced = await replaceInFile(
    `${installedDir}/config.toml`,
    /theme = ".*"/,
    'theme = "dark"'
  );

  // Increment version numbers line-by-line
  await replaceInFile(
    `${installedDir}/versions.txt`,
    /version=(\d+)/,
    (match) => `version=${Number(match.captures[0]) + 1}`,
    { mode: 'line' }
  );

  // Log error if pattern not found (helpful for debugging)
  await replaceInFile(
    `${installedDir}/config.toml`,
    /api_key = ".*"/,
    'api_key = "secret"',
    { errorMessage: 'Could not find api_key setting' }
  );
})
```

### Build from Source

```typescript
.hook('after-extract', async ({ extractDir, stagingDir, $ }) => {
  if (extractDir) {
    await $`cd ${extractDir} && make build`;
    await $`mv ${extractDir}/target/release/tool ${stagingDir}/tool`;
  }
})
```

## Error Handling

```typescript
.hook('after-install', async ({ $, log }) => {
  try {
    await $`./tool self-test`;
  } catch (error) {
    log.error('Self-test failed');
    throw error; // Re-throw to fail installation
  }
});
```

### Custom Binary Processing

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-extract', async ({ extractDir, stagingDir, fileSystem, log }) => {
      if (extractDir) {
        // Custom binary selection and processing
        const binaries = await fileSystem.readdir(path.join(extractDir, 'bin'));
        const mainBinary = binaries.find((name) => name.startsWith('main-'));

        if (mainBinary) {
          const sourcePath = path.join(extractDir, 'bin', mainBinary);
          const targetPath = path.join(stagingDir ?? '', 'tool');
          await fileSystem.copy(sourcePath, targetPath);
          log.info(`Selected binary: ${mainBinary}`);
        }
      }
    })
);
```

### Environment-Specific Setup

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .hook('after-install', async ({ systemInfo, fileSystem, log, $ }) => {
      // Platform-specific setup
      if (systemInfo.platform === 'darwin') {
        // macOS-specific setup
        await $`./setup-macos.sh`;
      } else if (systemInfo.platform === 'linux') {
        // Linux-specific setup
        await $`./setup-linux.sh`;
      }

      // Architecture-specific setup
      if (systemInfo.arch === 'arm64') {
        log.info('Configuring for ARM64 architecture');
        await $`./configure-arm64.sh`;
      }
    })
);
```

## Environment Variables in Installation

Set environment variables during installation (for curl-script installs):

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('curl-script', {
    url: 'https://example.com/install.sh',
    shell: 'bash',
    env: {
      INSTALL_DIR: '~/.local/bin',
      ENABLE_FEATURE: 'true',
      API_KEY: process.env.TOOL_API_KEY || 'default',
    },
  }).bin('my-tool')
);
```

## Best Practices

1. **Use `$` for shell operations** that need to work with files relative to your tool config
2. **Use `fileSystem` methods** for cross-platform file operations that don't require shell features
3. **Always handle errors appropriately** in hooks to provide clear feedback
4. **Use `log` for all output** - avoid `console.log()` in favor of structured logging:
   - `log.info()` for general information
   - `log.warn()` for warnings
   - `log.error()` for error conditions
   - `log.debug()` for debugging and troubleshooting
5. **Test your hooks** on different platforms to ensure compatibility
6. **Keep hooks focused** - each hook should have a single responsibility
7. **Document complex logic** - explain what your hooks are doing and why

## Hook Execution Order

1. **`beforeInstall`**: Before any installation steps
2. **`afterDownload`**: After downloading but before extraction
3. **`afterExtract`**: After extraction but before binary setup
4. **`afterInstall`**: After all installation steps are complete

## Complete Example

```typescript
import { defineTool } from '@gitea/dotfiles';
import path from 'path';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/custom-tool' })
    .bin('custom-tool')
    .symlink('./config.yml', '~/.config/custom-tool/config.yml')
    .hook('before-install', async ({ log }) => {
      log.info('Starting custom-tool installation...');
    })
    .hook('after-extract', async ({ extractDir, log, $ }) => {
      if (extractDir) {
        // Build additional components
        log.info('Building plugins...');
        await $`cd ${extractDir} && make plugins`;
      }
    })
    .hook('after-install', async ({ toolName, installedDir, systemInfo, fileSystem, log, $ }) => {
      // Create data directory
      const dataDir = path.join(systemInfo.homeDir, '.local/share', toolName);
      await fileSystem.mkdir(dataDir, { recursive: true });

      // Initialize tool
      await $`${path.join(installedDir ?? '', toolName)} init --data-dir ${dataDir}`;

      // Set up completion
      await $`${
        path.join(installedDir ?? '', toolName)
      } completion zsh > ${ctx.projectConfig.paths.generatedDir}/completions/_${toolName}`;

      log.info(`Initialized ${toolName} with data directory: ${dataDir}`);
    })
    .zsh((shell) =>
      shell.env({ CUSTOM_TOOL_DATA: '~/.local/share/custom-tool' }).aliases({ ct: 'custom-tool' })
    )
);
```
