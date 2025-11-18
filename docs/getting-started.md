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
    .dependsOn('pcre2')
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
    .dependsOn('shared-runtime')
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

### Declaring Dependencies

Use `.dependsOn('binary-name')` to ensure prerequisite binaries are available before your tool runs. Each dependency should reference the shim name exposed by another tool configuration (or an existing system binary). The generator enforces that:

- Every dependency is provided by exactly one tool
- Dependencies do not form cycles
- Providers are available for the current platform/architecture

If any of these checks fail, the CLI stops with actionable error messages.

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
    .dependsOn('shared-helper')
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