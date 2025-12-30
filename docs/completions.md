# Command Completions

Tab completions are configured per-shell using `.completions()`:

```typescript
.zsh((shell) => shell.completions('completions/_tool.zsh'))
.bash((shell) => shell.completions('completions/tool.bash'))
```

## Configuration Options

| Property | Description |
|----------|-------------|
| `source` | Path to completion file relative to extracted archive (supports globs) |
| `cmd` | Command to generate completions dynamically |
| `bin` | Binary name for completion filename (when different from tool name) |
| `name` | Custom filename (overrides `bin` and defaults) |
| `targetDir` | Custom installation directory (absolute path with context) |

**Note**: Either `source` OR `cmd` must be provided, but not both.

## Static Completions (source)

For completion files bundled in tool archives:

```typescript
// Simple path relative to extracted archive
.zsh((shell) => shell.completions('completions/_tool.zsh'))

// Glob pattern for versioned directories
.zsh((shell) => shell.completions('*/complete/_rg'))
```

**Supported glob patterns**: `*`, `**`, `?`, `[abc]`

## Dynamic Completions (cmd)

For tools that generate completions at runtime:

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
.zsh((shell) => shell.completions({
  source: 'completions/_tool.zsh',  // Relative to extracted archive
  targetDir: `${ctx.projectConfig.paths.homeDir}/.zsh/completions`
}))
```

## CLI Completions

The CLI generates its own completions to `<generatedDir>/shell-scripts/zsh/completions/_dotfiles`. Commands that accept tool names include all configured tools in their completions.

Reload completions after running `dotfiles generate`:

```bash
autoload -U compinit && compinit
```

## Next Steps

- [Shell Integration](./shell-integration.md) - Configure shell environments
- [Symbolic Links](./symlinks.md) - Link configuration files