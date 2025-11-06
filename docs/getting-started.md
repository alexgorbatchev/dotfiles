# Getting Started

This guide covers the basic structure and anatomy of `.tool.ts` configuration files.

## Basic Configuration Anatomy

### Minimal Configuration

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/repository',
  })
    .bin('tool-name')
);
```

### Complete Configuration Template

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/repository',
  })
    .bin('tool-name')
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    .zsh({
      completions: {
        source: 'completions/_tool.zsh',
      },
      environment: {
        TOOL_CONFIG_DIR: `${ctx.homeDir}/.tool`,
      },
      aliases: {
        t: 'tool-name',
      },
      shellInit: `
        # Functions
        function tool-helper() {
          tool-name --config "$TOOL_CONFIG_DIR/config.toml" "$@"
        }
      `,
    })
    .bash({
      completions: {
        source: 'completions/tool.bash',
      },
    })
);
```

## TypeScript Requirements

### Import Statement

Import the `defineTool` function from `@gitea/dotfiles`:

```typescript
import { defineTool } from '@gitea/dotfiles';
```

### Function Signature

The default export must use the `defineTool` helper with the install function:

```typescript
export default defineTool((install, ctx) =>
  install('method', { /* params */ })
    .bin('tool-name')
    // ... additional configuration
);
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