# Command Completions

Tab completions are configured per-shell using `.completions()`:

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions('completions/tool.bash'))
```

## Configuration Options

| Property | Description |
|----------|-------------|
| `source` | Path to completion file relative to extracted archive or downloaded content (supports globs) |
| `url` | URL to download completion file or archive from |
| `cmd` | Command to generate completions dynamically |
| `bin` | Binary name for completion filename (when different from tool name) |
| `name` | Custom filename (overrides `bin` and defaults) |
| `targetDir` | Custom installation directory (absolute path with context) |

**Note**: Use one of these combinations:
- `source` alone - Local file from tool archive
- `cmd` alone - Generate via command
- `url` alone - Direct file download (source auto-derived from URL filename)
- `url` + `source` - Archive download with path within archive

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

## URL-Based Completions (url)

For downloading completions from external sources:

```typescript
// Direct file download (source auto-derived from URL)
.zsh((shell) => shell.completions({
  url: 'https://raw.githubusercontent.com/user/repo/main/_tool.zsh'
}))

// Archive download with source path
.zsh((shell) => shell.completions({
  url: 'https://github.com/user/repo/releases/download/v1.0/completions.tar.gz',
  source: 'completions/_tool.zsh'
}))
```

### Version-Dependent URLs (Callback)

For completions that need the installed version in the URL, use a callback:

```typescript
// Callback receives context with version
.zsh((shell) => shell.completions((ctx) => ({
  url: `https://raw.githubusercontent.com/sharkdp/fd/${ctx.version}/contrib/completion/_fd`,
})))

// Also works for archives
.zsh((shell) => shell.completions((ctx) => ({
  url: `https://github.com/user/repo/releases/download/${ctx.version}/completions.tar.gz`,
  source: 'completions/_tool.zsh'
})))
```

The callback receives `ctx` with:
- `version` - The installed version of the tool (e.g., `'v10.3.0'`, `'15.1.0'`)

URL-based completions are downloaded to the tool's binary directory and symlinked to the shell completions directory. The download is cached - subsequent `generate` runs will use the cached file.

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

## Custom Target Directory

```typescript
export default defineTool((install) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .zsh((shell) => shell.completions({
      source: 'completions/_tool.zsh',
      targetDir: '~/.zsh/completions'
    }))
);
```

## CLI Completions

The CLI generates its own completions to `<generatedDir>/shell-scripts/zsh/completions/_dotfiles`. Commands that accept tool names include all configured tools in their completions.

Reload completions after running `dotfiles generate`:

```bash
autoload -U compinit && compinit
```

## Next Steps

- [Shell Integration](./shell-integration.md) - Configure shell environments and symlinks