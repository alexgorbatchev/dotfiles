# Utilities

### ctx.replaceInFile

Performs a regex-based replacement within a file. Pre-bound with the context's file system.

**Key behaviors:**

- Always replaces _all_ matches (global replacement), even if `from` does not include the `g` flag
- Patterns follow JavaScript semantics, including lookarounds, backreferences and named capture groups
- A plain string `from` is matched literally, so characters such as `.` match themselves
- Supports `to` as either a string or a callback; a string is used literally, so a `$1` in
  it stays `$1`. Read capture groups with a callback instead
- Supports `mode: 'file'` (default) and `mode: 'line'` (process each line separately)
- No-op write: if output equals input, the file is not written
- Returns `true` if replacements were made, `false` otherwise

```typescript builder
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
- `to` - Replacement string, or a callback receiving `IReplaceInFileMatch`. The callback
  produces its value while the match is being built, so it must return without awaiting
  anything still pending; fetch first and close over the result
- `options` - Optional settings:
  - `mode` - `'file'` (default) or `'line'` (process each line separately)
  - `errorMessage` - If provided and no matches found, logs at ERROR level (the call still returns `false` rather
    than throwing): `Could not find '<pattern>' in <filePath>: <errorMessage>`

**Returns:** `Promise<boolean>` - `true` if replacements were made, `false` if no matches found

**Callback argument (`IReplaceInFileMatch`):**

- `substring` - The matched substring
- `captures` - Array of capture groups (may contain `undefined`)
- `offset` - Match offset in the input, counted in characters
- `input` - Original input string
- `groups` - Named capture groups (an empty object when the pattern declares none)

### ctx.resolve

Resolves a glob pattern to a single file or directory path. Useful for referencing files with variable names (versioned directories, platform-specific assets).

A relative pattern is resolved against `ctx.toolDir`, the directory containing the `.tool.ts` file, so it reaches files shipped next to the configuration. To look inside the installed tree, build an absolute pattern from a context path such as `installedDir`.

```typescript builder
.zsh((shell) =>
  shell.always(/* zsh */ `
    source "${ctx.resolve('completions/*.zsh')}"
  `)
)

// In hooks
.hook('after-install', async ({ installedDir, $ }) => {
  const versionDir = ctx.resolve(`${installedDir}/tool-*-x86_64-linux`);
  await $`${versionDir}/bin/tool init`;
})
```

**Parameters:**

- `pattern` - Glob pattern to match (relative to `toolDir`, or absolute; a leading `~` expands to the project's `homeDir`)

**Returns:** `string` - The matched path

**Throws** when the pattern does not identify exactly one path. The thrown value is the message itself, not an error class:

- No matches are found: `No matches found for pattern: <pattern>`
- Multiple matches are found: `Pattern "<pattern>" matched N paths (expected exactly 1): <path>, <path>`
- The pattern is malformed: `invalid pattern "<pattern>": <reason>`

### ctx.log

User-facing logger for tool operations. Messages are automatically prefixed with the tool name.

```typescript builder
.hook('after-install', async ({ $ }) => {
  ctx.log.info('Configuring tool settings...');

  const result = await $`tool configure --defaults`.noThrow();

  if (result.exitCode !== 0) {
    ctx.log.warn('Some settings could not be applied');
  }

  ctx.log.debug('Configuration complete');
})
```

**Methods:** each takes a single `message` string.

- `ctx.log.debug(message)` - Debug information (shown with `--log=verbose`)
- `ctx.log.info(message)` - Informational messages
- `ctx.log.warn(message)` - Warning messages
- `ctx.log.error(message)` - Error messages

**Output:** the level, a tab, then the tool name in brackets before the message:

```
INFO	[my-tool] Configuring tool settings...
```

### dedentString / dedentTemplate

Utility function and tagged template for removing common leading indentation from multi-line strings. `dedentTemplate` is provided as an alias of `dedentString`.

```typescript
import { dedentString, dedentTemplate } from "@alexgorbatchev/dotfiles";

// As a tagged template (dedentString or dedentTemplate)
const script = dedentString`
  if [[ -n "$VAR" ]]; then
    echo "Hello"
  fi
`;

// As a function
const clean = dedentString("  line 1\n  line 2");
```

Leading and trailing blank lines are dropped, then the smallest indentation shared by the remaining non-blank lines (spaces or tabs) is removed from every line.

## Installation Method Parameters

Every installation method and its parameters are documented in [Installation Methods](../installation-methods/overview.md).
