# Manual Installation

The `manual` method installs files from your tool configuration directory (custom scripts, pre-built binaries).

For a configuration-only tool that only contributes shell configuration (and does not install binaries or generate shims), use `install()` with no arguments and do not call `.bin()`.

## Basic Usage

```typescript
import { defineTool } from '@gitea/dotfiles';

// Install a custom script
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './scripts/my-tool.sh',
  })
    .bin('my-tool')
);

// Configuration-only tool (no binary)
export default defineTool((install, ctx) =>
  install()
    .zsh((shell) => shell.aliases({ ll: 'ls -la' }))
);
```

## Parameters

The `install('manual', params)` function accepts:

```typescript
{
  binaryPath?: './relative/path/to/binary',  // Optional: path relative to .tool.ts file
  env?: { KEY: 'value' },                    // Optional
  hooks?: {                                  // Optional
    beforeInstall?: async (ctx) => void,
    afterInstall?: async (ctx) => void,
  }
}
```

### Parameters

- **`binaryPath`**: **Optional.** Path to a binary file relative to the tool configuration file location
  - Must be relative path (e.g., `./bin/tool`, `../scripts/helper.sh`)
  - The file will be copied to the managed installation directory
  - If you are not installing a binary, prefer `install()` with no arguments (configuration-only)

## Examples

### Custom Shell Script

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './bin/my-tool.sh',
  })
    .bin('my-tool')
);
```

### Pre-built Binary

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './binaries/linux/x64/custom-tool',
  })
    .bin('custom-tool')
);
```

### Configuration-Only Tool

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install()
    .zsh((shell) => shell.aliases({ ll: 'ls -la', la: 'ls -A' }))
);
```

## When to Use Manual Installation

**Best for:**
- Custom shell scripts included with your dotfiles
- Pre-built binaries for specific platforms
- Tools that need to be "installed" from your dotfiles repository
- Composite tools that combine multiple resources

**Use cases:**
- Including custom helper scripts in your dotfiles
- Distributing pre-compiled binaries with your configuration
- Managing platform-specific implementations

## Important Notes

- Binary paths are relative to the tool configuration file location
- Files are copied to the managed installation directory with executable permissions
- Configuration-only tools use `install()` with no arguments and must not define `.bin()`
- All files are managed within the dotfiles system's versioned storage

## Complete Example

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: './bin/my-tool.sh',
  })
    .bin('my-tool')
    .zsh((shell) =>
      shell
        .aliases({
          mt: 'my-tool',
          'mt-status': 'my-tool status',
        })
        .environment({
          MY_TOOL_CONFIG: `${ctx.projectConfig.paths.homeDir}/.config/my-tool`,
        })
        .completions('./completions/_my-tool')
    )
    .symlink('./config/my-tool.conf', `${ctx.projectConfig.paths.homeDir}/.config/my-tool/config`)
);
```

## Next Steps

- [Shell Integration](../shell-integration.md) - Configure aliases and environment
- [Completions](../completions.md) - Add command completions
- [Symbolic Links](../symlinks.md) - Link configuration files