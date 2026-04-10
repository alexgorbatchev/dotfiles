# Utilities

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
import { dedentTemplate } from "@alexgorbatchev/dotfiles";

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
