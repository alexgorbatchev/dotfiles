# Utilities

The bindings the runtime puts on a context. They are reachable as `ctx.fs`,
`ctx.replaceInFile`, `ctx.resolve` and `ctx.log` inside a `defineTool` factory, and under
the same names on every [hook context](lifecycle-hooks.md#context-properties).
`dedentString` is imported from the package instead.

### ctx.fs

File operations, carried out by the Go runtime. The same object is exposed twice: as
`ctx.fs`, and as `fileSystem`, which is the name hooks use. Files are read and written as
UTF-8, a path may start with `~` (expanded against the project's `paths.homeDir`), and
every method returns a `Promise` so `await` reads naturally at the call site. The type is
`IFileSystem`, exported from `@alexgorbatchev/dotfiles`.

| Method                          | Returns               | Description                                                                                                                                                                                                                                |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readFile(path)`                | `Promise<string>`     | Reads the whole file.                                                                                                                                                                                                                      |
| `writeFile(path, content)`      | `Promise<void>`       | Writes the file, replacing it if it exists.                                                                                                                                                                                                |
| `exists(path)`                  | `Promise<boolean>`    | Whether the path is there.                                                                                                                                                                                                                 |
| `readdir(path)`                 | `Promise<string[]>`   | Entry names of a directory.                                                                                                                                                                                                                |
| `mkdir(path)`                   | `Promise<void>`       | Creates a directory and any missing parents. Succeeds when it already exists.                                                                                                                                                              |
| `ensureDir(path)`               | `Promise<void>`       | Alias of `mkdir`.                                                                                                                                                                                                                          |
| `rm(path)`                      | `Promise<void>`       | Removes a file, or a directory together with everything under it.                                                                                                                                                                          |
| `rmdir(path)`                   | `Promise<void>`       | Removes an empty directory, and refuses a path that is not a directory.                                                                                                                                                                    |
| `rename(from, to)`              | `Promise<void>`       | Moves a file or directory.                                                                                                                                                                                                                 |
| `copyFile(source, destination)` | `Promise<void>`       | Copies a file, creating the destination's parent directories and replacing an existing destination; a symbolic link there is replaced, not written through. The copy keeps the source's permission bits. Copying a file onto itself fails. |
| `symlink(target, linkPath)`     | `Promise<void>`       | Creates a symbolic link at `linkPath` pointing at `target`.                                                                                                                                                                                |
| `readlink(path)`                | `Promise<string>`     | Reads where a symbolic link points.                                                                                                                                                                                                        |
| `chmod(path, mode)`             | `Promise<void>`       | Changes the permission bits, e.g. `0o755` to make a file executable.                                                                                                                                                                       |
| `stat(path)`                    | `Promise<IFileStats>` | Describes a path, following a symbolic link to what it points at.                                                                                                                                                                          |
| `lstat(path)`                   | `Promise<IFileStats>` | Describes a path without following a symbolic link, so a link is reported as the link itself.                                                                                                                                              |

`rmdir` takes no recursive option, because removing a tree is what `rm` is for. It checks
the kind of the path before removing it, so a `rmdir` aimed at a file fails with
`"<path>" is not a directory` instead of quietly deleting the file.

Every method rejects when the operation fails, naming the operation and the path, so an
unguarded `await` fails the installation instead of continuing against a file that is not
there. `exists` is the one method for which an absent path is an answer rather than a
failure: it resolves to `false`. It still rejects when it cannot tell, for instance when
the parent directory cannot be read. Use it to guard a `readFile` or `readdir` whose path
is genuinely optional.

#### IFileStats

`stat` and `lstat` both resolve to an `IFileStats`:

| Field            | Type      | Description                                                 |
| ---------------- | --------- | ----------------------------------------------------------- |
| `isFile`         | `boolean` | True for a regular file.                                    |
| `isDirectory`    | `boolean` | True for a directory.                                       |
| `isSymbolicLink` | `boolean` | True for a symbolic link. Only `lstat` ever reports it.     |
| `mode`           | `number`  | Permission bits alone, in the form `chmod` takes (`0o755`). |
| `size`           | `number`  | Size in bytes.                                              |

`mode` carries no file-type bits. Go encodes the kind of a path in the high bits of its
file mode using values of its own, which are not the POSIX `S_IF*` constants a
configuration author would compare against, so masking `mode` for a type would give a
wrong answer. The kind is reported through the three booleans instead, and `mode` stays
the number you can hand straight back to `chmod`.

```typescript builder
.hook('after-extract', async ({ fileSystem, extractDir, stagingDir, log }) => {
  if (!extractDir) return;
  for (const name of await fileSystem.readdir(extractDir)) {
    const entry = `${extractDir}/${name}`;
    const info = await fileSystem.lstat(entry);
    if (info.isSymbolicLink) {
      log.info(`${name} -> ${await fileSystem.readlink(entry)}`);
      continue;
    }
    if (info.isFile && info.size > 0) {
      await fileSystem.copyFile(entry, `${stagingDir}/${name}`);
      await fileSystem.chmod(`${stagingDir}/${name}`, 0o755);
    }
  }
  await fileSystem.rmdir(`${extractDir}/empty-placeholder`);
})
```

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
