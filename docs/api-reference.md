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

| Method                | Description                                |
| --------------------- | ------------------------------------------ |
| `.bin(name)`          | Define binary name(s) to expose            |
| `.version(v)`         | Set version (`'latest'` or specific)       |
| `.dependsOn(...bins)` | Declare binary dependencies                |
| `.symlink(src, dest)` | Create config file symlink                 |
| `.hook(event, fn)`    | Lifecycle hooks ([details](./hooks.md))    |
| `.zsh(fn)`            | Zsh shell configuration                    |
| `.bash(fn)`           | Bash shell configuration                   |
| `.powershell(fn)`     | PowerShell configuration                   |
| `.platform(p, fn)`    | Platform-specific overrides                |
| `.disable()`          | Skip tool during generation (logs warning) |

### Base Install Parameters

All installation methods support these parameters:

| Parameter | Type                                                        | Description                            |
| --------- | ----------------------------------------------------------- | -------------------------------------- |
| `env`     | `Record<string, string> \| (ctx) => Record<string, string>` | Environment variables for installation |
| `hooks`   | `object`                                                    | Lifecycle hooks configuration          |

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
    .environment({ VAR: 'value' })
    .aliases({ t: 'tool' })
    .always(/* zsh */`
      function my-func() { tool "$@"; }
    `)
)
```

| Shell Method                               | Description                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `.completions(path \| config \| callback)` | Completion file, config object, or callback with `ctx.version` (generated after install only) |
| `.environment(obj)`                        | Environment variables                                                                         |
| `.aliases(obj)`                            | Shell aliases                                                                                 |
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

Creates project configuration. See [Project Configuration](./config.md).

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

See [Installation Methods](./installation/README.md) for detailed parameters for each method:

- `github-release` - [GitHub Releases](./installation/github-release.md)
- `brew` - [Homebrew](./installation/homebrew.md)
- `cargo` - [Cargo](./installation/cargo.md)
- `curl-script` - [Curl Scripts](./installation/curl-script.md)
- `curl-tar` - [Curl Tar](./installation/curl-tar.md)
- `manual` - [Manual](./installation/manual.md)
