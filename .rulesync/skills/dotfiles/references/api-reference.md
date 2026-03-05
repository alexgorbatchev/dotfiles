# API Reference

## Table of Contents

- [Exports](#exports)
- [defineTool](#definetool)
  - [Parameters](#parameters)
  - [Builder Methods](#builder-methods)
  - [Base Install Parameters](#base-install-parameters)
  - [Shell Configuration](#shell-configuration)
- [defineConfig](#defineconfig)
- [Platform](#platform)
- [Architecture](#architecture)
- [Utilities](#utilities)
  - [ctx.replaceInFile](#ctxreplaceinfile)
  - [ctx.resolve](#ctxresolve)
  - [ctx.log](#ctxlog)
  - [dedentTemplate](#dedenttemplate)
- [Installation Method Parameters](#installation-method-parameters)
- [Context API](#context-api)
  - [Properties](#properties)
  - [Path Properties via projectConfig](#path-properties-via-projectconfig)
  - [Examples](#examples)
  - [Directory Structure](#directory-structure)
  - [Path Resolution by Method](#path-resolution-by-method)
  - [Common Mistakes](#common-mistakes)
  - [Cross-Platform](#cross-platform)

---

# API Reference

Reference for the public API available in `@gitea/dotfiles`.

## Exports

```typescript
import {
  Architecture, // Architecture enum
  dedentString, // Utility for template strings
  dedentTemplate, // Tagged template for dedenting
  defineConfig, // Create project configuration
  defineTool, // Create tool configurations
  Platform, // Platform enum for cross-platform configs
} from '@gitea/dotfiles';
```

## defineTool

Creates a tool configuration.

```typescript
export default defineTool((install, ctx) => install('github-release', { repo: 'owner/tool' }).bin('tool'));
```

### Parameters

- `install(method, params)` - Function to select installation method
- `ctx` - Context object with `projectConfig`, `toolName`, `systemInfo`

### Builder Methods

| Method                | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `.bin(name)`          | Define binary name(s) to expose                         |
| `.version(v)`         | Set version (`'latest'` or specific)                    |
| `.dependsOn(...bins)` | Declare binary dependencies                             |
| `.symlink(src, dest)` | Create config file symlink                              |
| `.hook(event, fn)`    | Lifecycle hooks (details in Hooks section)              |
| `.zsh(fn)`            | Zsh shell configuration                                 |
| `.bash(fn)`           | Bash shell configuration                                |
| `.powershell(fn)`     | PowerShell configuration                                |
| `.platform(p, fn)`    | Platform-specific overrides                             |
| `.disable()`          | Skip tool during generation (logs warning)              |
| `.hostname(pattern)`  | Restrict tool to specific hostname(s) (string or regex) |

### Base Install Parameters

All installation methods support these parameters:

| Parameter | Type                                                        | Description                                               |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `env`     | `Record<string, string> \| (ctx) => Record<string, string>` | Environment variables for installation                    |
| `hooks`   | `object`                                                    | Lifecycle hooks configuration                             |
| `auto`    | `boolean`                                                   | Auto-install during `generate` (default: method-specific) |

> **Note**: The `auto` parameter defaults to `true` for `zsh-plugin` and `false` for all other installation methods. When `auto: true`, the tool is automatically installed during `dotfiles generate` without requiring a separate `dotfiles install` step.

The `env` parameter can be static or dynamic:

```typescript
// Static environment variables
install('github-release', {
  repo: 'owner/tool',
  env: { CUSTOM_FLAG: 'true' },
}).bin('tool');

// Dynamic environment variables (receives context with projectConfig, stagingDir)
install('github-release', {
  repo: 'owner/tool',
  env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
}).bin('tool');
```

### Shell Configuration

The shell methods (`.zsh`, `.bash`, `.powershell`) receive a configurator:

```typescript
.zsh((shell) =>
  shell
    .completions('completions/_tool')
    .env({ VAR: 'value' })
    .aliases({ t: 'tool' })
    .always(/* zsh */`
      function my-func() { tool "$@"; }
    `)
)
```

| Shell Method                               | Description                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `.completions(path \| config \| callback)` | Completion file, config object, or callback with `ctx.version` (generated after install only) |
| `.env(obj)`                                | Environment variables (PATH prohibited - use `.path()`)                                       |
| `.path(dir)`                               | Add directory to PATH (deduplicated)                                                          |
| `.aliases(obj)`                            | Shell aliases                                                                                 |
| `.functions(obj)`                          | Shell functions                                                                               |
| `.sourceFile(path)`                        | Source a file (skips if missing)                                                              |
| `.sourceFunction(name)`                    | Source output of a function defined via `.functions()`                                        |
| `.always(script)`                          | Script run on every shell init                                                                |
| `.once(script)`                            | Script run once after install                                                                 |

**Completions examples:**

```typescript
.completions('completions/_tool')                    // Static path (relative to toolDir)
.completions(`${ctx.currentDir}/completions/_tool`)  // Absolute path (from extracted archive)
.completions({ cmd: 'tool completion zsh' })         // Dynamic via command
.completions({ url: 'https://.../completions.tar.gz', source: `${ctx.currentDir}/_tool` })  // Archive URL
```

## defineConfig

Creates project configuration. See Project Configuration section.

```typescript
export default defineConfig(() => ({
  paths: { dotfilesDir: '~/.dotfiles' },
}));
```

## Platform

Enum for platform-specific configurations.

```typescript
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.MacOS, (install) => install('brew', { formula: 'tool' }))
);
```

| Value              | Description                      |
| ------------------ | -------------------------------- |
| `Platform.Linux`   | Linux systems                    |
| `Platform.MacOS`   | macOS (alias: `Platform.Darwin`) |
| `Platform.Windows` | Windows systems                  |

## Architecture

Enum for architecture-specific configurations.

| Value                 | Description                      |
| --------------------- | -------------------------------- |
| `Architecture.X86_64` | Intel/AMD 64-bit                 |
| `Architecture.Arm64`  | ARM 64-bit (Apple Silicon, etc.) |

## Utilities

### ctx.replaceInFile

Performs a regex-based replacement within a file. Pre-bound with the context's file system.

**Key behaviors:**

- Always replaces _all_ matches (global replacement), even if `from` does not include the `g` flag
- Supports `to` as either a string or a (a)sync callback
- Supports `mode: 'file'` (default) and `mode: 'line'` (process each line separately)
- No-op write: if output equals input, the file is not written
- Returns `true` if replacements were made, `false` otherwise

```typescript
.hook('after-install', async (ctx) => {
  // Simple replacement (replaces all matches)
  const wasReplaced = await ctx.replaceInFile(
    `${ctx.installedDir}/config.toml`,
    /placeholder/,
    'actual_value'
  );

  // Line-by-line with callback
  await ctx.replaceInFile(
    `${ctx.installedDir}/settings.ini`,
    /version=(\d+)/,
    (match) => `version=${Number(match.captures[0]) + 1}`,
    { mode: 'line' }
  );

  // With error message for debugging missing patterns
  await ctx.replaceInFile(
    `${ctx.installedDir}/config.toml`,
    /theme = ".*"/,
    'theme = "dark"',
    { errorMessage: 'Could not find theme setting in config.toml' }
  );
})
```

**Parameters:**

- `filePath` - Path to the file (supports `~` expansion)
- `from` - Pattern to match (string or RegExp, always global)
- `to` - Replacement string or callback receiving `IReplaceInFileMatch`
- `options` - Optional settings:
  - `mode` - `'file'` (default) or `'line'` (process each line separately)
  - `errorMessage` - If provided and no matches found, logs error: `Could not find '<pattern>' in <filePath>`

**Returns:** `Promise<boolean>` - `true` if replacements were made, `false` if no matches found

**Callback argument (`IReplaceInFileMatch`):**

- `substring` - The matched substring
- `captures` - Array of capture groups (may contain `undefined`)
- `offset` - Match offset in the input
- `input` - Original input string
- `groups` - Named capture groups (if present)

### ctx.resolve

Resolves a glob pattern to a single file or directory path. Useful for referencing files with variable names (versioned directories, platform-specific assets).

```typescript
.zsh((shell) =>
  shell.always(/* zsh */ `
    source "${ctx.resolve('completions/*.zsh')}"
  `)
)

// In hooks
.hook('after-install', async (ctx) => {
  const versionDir = ctx.resolve('tool-*-x86_64-linux');
  await ctx.$`${versionDir}/bin/tool init`;
})
```

**Parameters:**

- `pattern` - Glob pattern to match (relative to `toolDir` or absolute)

**Returns:** `string` - The resolved absolute path

**Throws:** `ResolveError` if:

- No matches are found (logs ERROR: `No matches found for pattern: <pattern>`)
- Multiple matches are found (logs ERROR: `Pattern '<pattern>' matched N paths (expected exactly 1): ...`)

### ctx.log

User-facing logger for tool operations. Messages are automatically prefixed with the tool name.

```typescript
.hook('after-install', async () => {
  ctx.log.info('Configuring tool settings...');

  const result = await configureSettings();

  if (result.warnings.length > 0) {
    ctx.log.warn('Some settings could not be applied');
  }

  ctx.log.debug('Configuration complete');
})
```

**Methods:**

- `ctx.log.trace(message)` - Detailed debugging (hidden by default)
- `ctx.log.debug(message)` - Debug information (hidden by default)
- `ctx.log.info(message)` - Informational messages
- `ctx.log.warn(message)` - Warning messages
- `ctx.log.error(message, error?)` - Error messages (optionally with error object)

**Output:** Messages include the tool name as context:

```
INFO    [my-tool] Configuring tool settings...
```

### dedentTemplate

Tagged template for removing indentation from multi-line strings.

```typescript
import { dedentTemplate } from '@gitea/dotfiles';

const script = dedentTemplate`
  if [[ -n "$VAR" ]]; then
    echo "Hello"
  fi
`;
```

## Installation Method Parameters

See the Installation Methods reference for detailed parameters for each method:

- `github-release` - GitHub Releases
- `gitea-release` - Gitea/Forgejo Releases
- `brew` - Homebrew
- `cargo` - Cargo
- `npm` - npm
- `curl-script` - Curl Scripts
- `curl-tar` - Curl Tar
- `curl-binary` - Curl Binary
- `manual` - Manual
- `zsh-plugin` - Zsh Plugin

---

# Context API

The `ctx` parameter in `defineTool` provides access to tool and project information.

## Properties

| Property            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `ctx.toolName`      | Name of the tool being configured                 |
| `ctx.toolDir`       | Directory containing the `.tool.ts` file          |
| `ctx.currentDir`    | Tool's stable `current` directory (after install) |
| `ctx.projectConfig` | Full project configuration                        |
| `ctx.systemInfo`    | Platform, architecture, and home directory        |
| `ctx.replaceInFile` | Replace text in files using regex patterns        |
| `ctx.resolve`       | Resolve glob pattern to a single path             |
| `ctx.log`           | Logger for user-facing output                     |

### Path Properties via projectConfig

| Path                                      | Description               |
| ----------------------------------------- | ------------------------- |
| `ctx.projectConfig.paths.dotfilesDir`     | Root dotfiles directory   |
| `ctx.projectConfig.paths.binariesDir`     | Tool binaries directory   |
| `ctx.projectConfig.paths.generatedDir`    | Generated files directory |
| `ctx.projectConfig.paths.targetDir`       | Shim directory            |
| `ctx.projectConfig.paths.shellScriptsDir` | Shell scripts directory   |

> **Note:** For home directory paths, use `~/` instead of `ctx.projectConfig.paths.homeDir`. Tilde expansion is automatic.

## Examples

### Referencing Files Next to Tool Config

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */ `
        source "${ctx.toolDir}/shell/key-bindings.zsh"
      `)
    )
);
```

### Setting Environment Variables

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.env({
        TOOL_HOME: `${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}`,
      })
    )
);
```

### Using currentDir for Installed Assets

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */ `
        export TOOL_THEME="${ctx.currentDir}/share/themes/default.toml"
      `)
    )
);
```

### Using replaceInFile for File Modifications

The `ctx.replaceInFile` method performs regex-based replacements within files.

**Key behaviors:**

- Always replaces _all_ matches (global replacement), even if `from` does not include the `g` flag
- Supports `to` as either a string or a (a)sync callback
- Supports `mode: 'file'` (default) and `mode: 'line'` (process each line separately)
- No-op write: if output equals input, the file is not written
- Returns `true` if replacements were made, `false` otherwise

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async () => {
      // Simple replacement (replaces all matches)
      const wasReplaced = await ctx.replaceInFile(`${ctx.currentDir}/config.toml`, /placeholder_value/, 'actual_value');

      // Line-by-line replacement with callback
      await ctx.replaceInFile(
        `${ctx.currentDir}/settings.ini`,
        /version=(\d+)/,
        (match) => `version=${Number(match.captures[0]) + 1}`,
        { mode: 'line' },
      );

      // Async replacer function
      await ctx.replaceInFile(`${ctx.currentDir}/config.yaml`, /api_key: .*/, async () => {
        const key = await fetchApiKey();
        return `api_key: ${key}`;
      });

      // With error message for debugging missing patterns
      await ctx.replaceInFile(`${ctx.currentDir}/config.toml`, /theme = ".*"/, 'theme = "dark"', {
        errorMessage: 'Could not find theme setting in config.toml',
      });
    })
);
```

**Parameters:**

- `filePath` - Path to the file (supports `~` expansion)
- `from` - Pattern to match (string or RegExp, always global)
- `to` - Replacement string or callback receiving `IReplaceInFileMatch`
- `options` - Optional settings:
  - `mode` - `'file'` (default) or `'line'` (process each line separately)
  - `errorMessage` - If provided and no matches found, logs error: `Could not find '<pattern>' in <filePath>`

**Returns:** `Promise<boolean>` - `true` if replacements were made, `false` if no matches found

**Callback argument (`IReplaceInFileMatch`):**

- `substring` - The matched substring
- `captures` - Array of capture groups (may contain `undefined`)
- `offset` - Match offset in the input
- `input` - Original input string
- `groups` - Named capture groups (if present)

### Using log for User Output

The `ctx.log` provides a simple logging interface for user-facing messages:

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .hook('after-install', async () => {
      ctx.log.info('Configuring tool settings...');

      // Perform configuration
      const result = await configureSettings();

      if (result.warnings.length > 0) {
        ctx.log.warn('Some settings could not be applied');
      }

      ctx.log.debug('Configuration complete');
    })
);
```

**Log Levels:**

- `ctx.log.trace(message)` - Detailed debugging (hidden by default)
- `ctx.log.debug(message)` - Debug information (hidden by default)
- `ctx.log.info(message)` - Informational messages
- `ctx.log.warn(message)` - Warning messages
- `ctx.log.error(message, error?)` - Error messages (optionally with error object)

**Output:** Log messages are automatically prefixed with the tool name:

```
[my-tool] Configuring tool settings...
```

### Using resolve for Glob Pattern Matching

The `ctx.resolve` method resolves a glob pattern to a single file or directory path. Use this when you need to reference files or directories with flexible naming (e.g., versioned directories, platform-specific binaries).

**Key behaviors:**

- Returns the absolute path if exactly one match is found
- Throws `ResolveError` and logs ERROR if no matches are found
- Throws `ResolveError` and logs ERROR if multiple matches are found
- Patterns are resolved relative to `toolDir` unless absolute

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'BurntSushi/ripgrep' })
    .bin('rg')
    .zsh((shell) =>
      shell.always(/* zsh */ `
        source "${ctx.resolve('completions/_rg.zsh')}"
      `)
    )
);
```

**Common use cases:**

```typescript
// Versioned directory with wildcard
const versionDir = ctx.resolve('ripgrep-*-x86_64-*');
// -> "/path/to/tools/rg/ripgrep-14.1.0-x86_64-linux"

// Single completion file
const completion = ctx.resolve('completions/*.zsh');
// -> "/path/to/tools/rg/completions/_rg.zsh"

// Absolute path pattern
const binary = ctx.resolve('/opt/myapp/bin/myapp-*');
// -> "/opt/myapp/bin/myapp-1.2.3"
```

**Error handling:**

Since `resolve` throws on no matches or multiple matches, failed resolutions stop tool processing. This is intentional - a missing or ambiguous path usually indicates a configuration problem.

```typescript
// No matches - throws ResolveError, logs:
// ERROR  No matches found for pattern: non-existent-*

// Multiple matches - throws ResolveError, logs:
// ERROR  Pattern 'config-*.yaml' matched 2 paths (expected exactly 1): /path/config-a.yaml, /path/config-b.yaml
```

## Directory Structure

```
${ctx.projectConfig.paths.binariesDir}/${ctx.toolName}/
├── 1.2.3/              # Versioned install directory
│   ├── tool            # Binary
│   └── share/          # Assets
└── current -> 1.2.3    # Stable symlink (ctx.currentDir)
```

- Archives extracted to `binaries/tool-name/version/`
- `current` symlink updated after install
- Shims in `targetDir` execute `${ctx.currentDir}/binary`

## Path Resolution by Method

| Method                | Path            | Resolution                        |
| --------------------- | --------------- | --------------------------------- |
| `.symlink(src, dest)` | `src` with `./` | Relative to tool config directory |
| `.symlink(src, dest)` | `dest`          | Absolute path (`~` expanded)      |
| `.completions(path)`  | `path`          | Relative to extracted archive     |
| `binaryPath`          | github/cargo    | Relative to extracted archive     |
| `binaryPath`          | manual          | Absolute path                     |

## Common Mistakes

```typescript
// ❌ Hardcoded paths
.symlink('./config', '/home/user/.config/tool')

// ✅ Use tilde expansion
.symlink('./config', '~/.config/tool')

// ❌ Shell variable references
.always(`source $DOTFILES/init.zsh`)

// ✅ Use context
.always(`source "${ctx.currentDir}/init.zsh"`)
```

## Cross-Platform

Always use forward slashes - context variables handle platform differences:

```typescript
// Works on all platforms
.symlink('./config.toml', '~/.config/tool/config.toml')
```
