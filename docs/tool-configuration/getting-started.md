# Getting Started

This guide covers the basic structure and anatomy of `.tool.ts` configuration files.

## Basic Configuration Anatomy

### Minimal Configuration

```typescript
import { defineTool } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  c
    .bin('tool-name')
    .version('latest')
    .install('github-release', {
      repo: 'owner/repository',
    })
);
```

### Complete Configuration Template

```typescript
import { defineTool } from '@dotfiles/schemas';
import { always } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  c
    // Define the binary names this tool provides
    .bin(['primary-binary', 'secondary-binary'])
    // Specify version (latest, specific version, or SemVer constraint)
    .version('latest')
    // Configure installation method
    .install('github-release', {
      repo: 'owner/repository',
      assetPattern: '*linux_amd64.tar.gz',
      binaryPath: 'bin/tool',
      stripComponents: 1,
    })
    // Configure symbolic links
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    // Add shell configuration
    .zsh({
      completions: { source: 'completions/_tool.zsh' },
      environment: {
        'TOOL_CONFIG_DIR': `${ctx.homeDir}/.tool`
      },
      aliases: {
        't': 'tool'
      },
      shellInit: [
        always/* zsh */`
          # Functions
          function tool-helper() {
            tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
          }
        `
      ]
    })
    // Add bash configuration
    .bash({
      completions: { source: 'completions/tool.bash' }
    })
);
```

## TypeScript Requirements

### Import Statements

Always import required types at the top:

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { Platform, Architecture } from '@types';
```

### Function Signature

The default export must use the `defineTool` helper:

```typescript
export default defineTool((c: ToolConfigBuilder, ctx: ToolConfigContext) => {
  // Configuration goes here
});
```

### Type Safety

- All method calls are type-checked
- Invalid installation parameters will cause compilation errors
- Platform and Architecture values are validated
- Completion configurations are validated

## Next Steps

- [Core Methods](./core-methods.md) - Learn about the essential configuration methods
- [Context API](./context-api.md) - Understand the ToolConfigContext for dynamic paths
- [Installation Methods](./installation/README.md) - Explore different installation options