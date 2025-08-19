# Manual Installation

The `manual` method configures tools that are already installed or managed externally.

## Basic Usage

```typescript
c.install('manual', {
  binaryPath: '/usr/local/bin/tool',
})
```

## Parameters

```typescript
c.install('manual', {
  binaryPath: '/path/to/binary',  // Required: absolute path to existing binary
})
```

### Parameters

- **`binaryPath`**: **Absolute path** to the existing binary on the system
  - Must be absolute path (e.g., `/usr/local/bin/tool`, `${ctx.homeDir}/bin/custom-tool`)
  - The binary must already exist at this location

## Examples

### System-Installed Tool

```typescript
c.install('manual', {
  binaryPath: '/usr/bin/git',
})
```

### User-Installed Binary

```typescript
c.install('manual', {
  binaryPath: `${ctx.homeDir}/bin/custom-tool`,
})
```

### Tool in Custom Location

```typescript
c.install('manual', {
  binaryPath: '/opt/custom-software/bin/tool',
})
```

## When to Use Manual Installation

**Best for:**
- System-provided tools (git, curl, etc.)
- Tools installed by other package managers
- Custom-compiled binaries
- Tools with complex installation requirements
- Development versions or local builds

**Use cases:**
- Wrapping system tools with additional shell configuration
- Adding completions to existing tools
- Creating aliases for tools installed elsewhere
- Managing tools installed via other methods (apt, yum, etc.)

## Important Notes

- The binary must already exist at the specified path
- No installation or downloading occurs
- The tool only configures shell integration and generates shims
- Updates must be managed externally

## Complete Example

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('git')
    .install('manual', {
      binaryPath: '/usr/bin/git',
    })
    .zsh({
      aliases: {
        'g': 'git',
        'gs': 'git status',
        'ga': 'git add',
        'gc': 'git commit',
      },
      environment: {
        'GIT_EDITOR': 'nvim'
      }
    })
    .zsh({
      completions: { source: 'contrib/completion/git-completion.zsh' }
    });
};
```

## Next Steps

- [Shell Integration](../shell-integration.md) - Configure aliases and environment
- [Completions](../completions.md) - Add command completions
- [Symbolic Links](../symlinks.md) - Link configuration files