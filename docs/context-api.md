# Context API

The `ctx` parameter in `defineTool` provides access to tool and project information.

## Properties

| Property | Description |
|----------|-------------|
| `ctx.toolName` | Name of the tool being configured |
| `ctx.toolDir` | Directory containing the `.tool.ts` file |
| `ctx.currentDir` | Tool's stable `current` directory (after install) |
| `ctx.projectConfig` | Full project configuration |
| `ctx.systemInfo` | Platform, architecture, and home directory |
| `ctx.replaceInFile` | Replace text in files using regex patterns |

### Path Properties via projectConfig

| Path | Description |
|------|-------------|
| `ctx.projectConfig.paths.homeDir` | User's home directory |
| `ctx.projectConfig.paths.dotfilesDir` | Root dotfiles directory |
| `ctx.projectConfig.paths.binariesDir` | Tool binaries directory |
| `ctx.projectConfig.paths.generatedDir` | Generated files directory |
| `ctx.projectConfig.paths.targetDir` | Shim directory |
| `ctx.projectConfig.paths.shellScriptsDir` | Shell scripts directory |

## Examples

### Referencing Files Next to Tool Config

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) =>
      shell.always(/* zsh */`
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
      shell.environment({
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
      shell.always(/* zsh */`
        export TOOL_THEME="${ctx.currentDir}/share/themes/default.toml"
      `)
    )
);
```

### Using replaceInFile for File Modifications

The `ctx.replaceInFile` method performs regex-based replacements within files.

**Key behaviors:**
- Always replaces *all* matches (global replacement), even if `from` does not include the `g` flag
- Supports `to` as either a string or a (a)sync callback
- Supports `mode: 'file'` (default) and `mode: 'line'` (process each line separately)
- No-op write: if output equals input, the file is not written
- Returns `true` if replacements were made, `false` otherwise

```typescript
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .afterInstall(async () => {
      // Simple replacement (replaces all matches)
      const wasReplaced = await ctx.replaceInFile(
        `${ctx.currentDir}/config.toml`,
        /placeholder_value/,
        'actual_value'
      );

      // Line-by-line replacement with callback
      await ctx.replaceInFile(
        `${ctx.currentDir}/settings.ini`,
        /version=(\d+)/,
        (match) => `version=${Number(match.captures[0]) + 1}`,
        { mode: 'line' }
      );

      // Async replacer function
      await ctx.replaceInFile(
        `${ctx.currentDir}/config.yaml`,
        /api_key: .*/,
        async () => {
          const key = await fetchApiKey();
          return `api_key: ${key}`;
        }
      );

      // With error message for debugging missing patterns
      await ctx.replaceInFile(
        `${ctx.currentDir}/config.toml`,
        /theme = ".*"/,
        'theme = "dark"',
        { errorMessage: 'Could not find theme setting in config.toml' }
      );
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

| Method | Path | Resolution |
|--------|------|------------|
| `.symlink(src, dest)` | `src` with `./` | Relative to tool config directory |
| `.symlink(src, dest)` | `dest` | Absolute path (`~` expanded) |
| `.completions(path)` | `path` | Relative to extracted archive |
| `binaryPath` | github/cargo | Relative to extracted archive |
| `binaryPath` | manual | Absolute path |

## Common Mistakes

```typescript
// ❌ Hardcoded paths
.symlink('./config', '/home/user/.config/tool')

// ✅ Use context
.symlink('./config', `${ctx.projectConfig.paths.homeDir}/.config/tool`)

// ❌ Shell variable references
.always(`source $DOTFILES/init.zsh`)

// ✅ Use context
.always(`source "${ctx.currentDir}/init.zsh"`)
```

## Cross-Platform

Always use forward slashes - context variables handle platform differences:

```typescript
// Works on all platforms
.symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
```