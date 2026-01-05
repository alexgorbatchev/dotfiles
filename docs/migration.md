# Migration Guide

Convert shell-based tool configurations (like Zinit) to TypeScript `.tool.ts` format.

## Zinit Pattern Mapping

| Zinit Pattern | ToolConfig Equivalent |
|---------------|----------------------|
| `zinit ice from"gh-r"` | `install('github-release', { repo: '...' })` |
| `pick"path/to/binary"` | `binaryPath: 'path/to/binary'` |
| `mv="*/binary -> binary"` | Not needed - binary stays in extracted location |
| `atclone"make install"` | `.hook('after-extract', ...)` |

### Example

**Before (Zinit):**
```bash
zinit ice from"gh-r" as"program" mv"ripgrep*/rg -> rg" pick"rg"
zinit load BurntSushi/ripgrep
```

**After:**
```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'BurntSushi/ripgrep' })
    .bin('rg')
);
```

## Shell Script Conversion

### Environment Variables

```typescript
.zsh((shell) =>
  shell.environment({
    TOOL_HOME: '~/.local/share/tool'
  })
)
```

### Aliases

```typescript
.zsh((shell) =>
  shell.aliases({
    t: 'tool',
    tl: 'tool list'
  })
)
```

### Complex Functions

```typescript
.zsh((shell) =>
  shell.always(`
    function tool-helper() {
      tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
    }
  `)
)
```

## Path Variables

| Old Path | Recommended |
|----------|-------------|
| `$HOME` | `~/` (tilde expansion) |
| `$DOTFILES` | `ctx.projectConfig.paths.dotfilesDir` |
| Tool directory | `ctx.projectConfig.paths.binariesDir` |

## Migration Checklist

1. Create tool directory and `.tool.ts` file
2. Map installation method (github-release, brew, etc.)
3. Extract environment variables to `.environment()`
4. Extract aliases to `.aliases()`
5. Keep complex functions in `.always()` or `.once()`
6. Replace hardcoded paths with context variables
7. Add `.symlink()` for config files
8. Add `.completions()` if available
9. Test: `dotfiles install tool-name`

## Next Steps

- [Getting Started](./getting-started.md) - Basic configuration structure
- [Shell Integration](./shell-integration.md) - Shell configuration details