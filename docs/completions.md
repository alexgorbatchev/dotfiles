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

| Property | Description                                                                                  |
| -------- | -------------------------------------------------------------------------------------------- |
| `source` | Path to completion file (relative to toolDir, or absolute path within extracted archive)     |
| `url`    | URL to download completion file or archive from                                              |
| `cmd`    | Command to generate completions dynamically                                                  |
| `bin`    | Binary name for completion filename (when different from tool name)                          |

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

## Next Steps

- [Shell Integration](./shell-integration.md) - Configure shell environments and symlinks
