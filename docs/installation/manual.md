# Manual Installation

The `manual` method is a unified approach for installing files from your tool configuration directory or creating configuration-only tools. It can install custom scripts, pre-built binaries, or provide pure shell configuration without any binary management.

## Basic Usage

```typescript
// Install a custom script
c.install('manual', {
  binaryPath: './scripts/my-tool.sh',
})

// Configuration-only tool (no binary)
c.install('manual', {})
```

## Parameters

```typescript
c.install('manual', {
  binaryPath?: './relative/path/to/binary',  // Optional: path relative to .tool.ts file
})
```

### Parameters

- **`binaryPath`**: **Optional.** Path to a binary file relative to the tool configuration file location
  - Must be relative path (e.g., `./bin/tool`, `../scripts/helper.sh`)
  - The file will be copied to the managed installation directory
  - If omitted, only shell configurations and symlinks will be processed

## Examples

### Custom Shell Script

```typescript
c.install('manual', {
  binaryPath: './bin/my-tool.sh',
})
```

### Pre-built Binary

```typescript
c.install('manual', {
  binaryPath: './binaries/linux/x64/custom-tool',
})
```

### Configuration-Only Tool

```typescript
c.install('manual', {
  // No binaryPath - only shell configuration and symlinks
})
```
```

## When to Use Manual Installation

**Best for:**
- Custom shell scripts included with your dotfiles
- Pre-built binaries for specific platforms
- Tools that need to be "installed" from your dotfiles repository
- Configuration-only tools (shell aliases, environment setup)
- Composite tools that combine multiple resources

**Use cases:**
- Including custom helper scripts in your dotfiles
- Distributing pre-compiled binaries with your configuration
- Creating tools that only provide shell configuration
- Managing platform-specific implementations

## Important Notes

- Binary paths are relative to the tool configuration file location
- Files are copied to the managed installation directory with executable permissions
- If `binaryPath` is omitted, the tool will only provide shell configuration and symlinks
- All files are managed within the dotfiles system's versioned storage

## Complete Example

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('my-tool')
    .install('manual', {
      binaryPath: './bin/my-tool.sh',
    })
    .zsh({
      aliases: {
        'mt': 'my-tool',
        'mt-status': 'my-tool status',
      },
      environment: {
        'MY_TOOL_CONFIG': `${ctx.homeDir}/.config/my-tool`
      }
    })
    .symlink('./config/my-tool.conf', `${ctx.homeDir}/.config/my-tool/config`)
    .zsh({
      completions: { source: './completions/_my-tool' }
    });
};
```

## Next Steps

- [Shell Integration](../shell-integration.md) - Configure aliases and environment
- [Completions](../completions.md) - Add command completions
- [Symbolic Links](../symlinks.md) - Link configuration files