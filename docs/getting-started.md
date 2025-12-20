# Getting Started

This guide covers the basic structure and anatomy of `.tool.ts` configuration files.

## Prerequisites

Before creating tool configurations, you need to set up your project configuration. See [Project Configuration](./config.md) for setup instructions for your main `config.ts` or `config.yaml` file.

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
    .symlink('./config.toml', `${ctx.projectConfig.paths.homeDir}/.config/tool/config.toml`)
    .zsh((shell) =>
      shell
        .completions('completions/_tool.zsh')
        .environment({
          TOOL_CONFIG_DIR: `${ctx.projectConfig.paths.homeDir}/.tool`,
        })
        .aliases({
          t: 'tool-name',
        })
        .always(/* zsh */`
          # Functions
          function tool-helper() {
            tool-name --config "$TOOL_CONFIG_DIR/config.toml" "$@"
          }
        `)
    )
    .bash((shell) => shell.completions('completions/tool.bash'))
);
```

### Declaring Dependencies

Use `.dependsOn('binary-name')` to ensure prerequisite binaries are available before your tool runs. Each dependency should reference the shim name exposed by another tool configuration (or an existing system binary). The generator enforces that:

- Every dependency is provided by exactly one tool
- Dependencies do not form cycles
- Providers are available for the current platform/architecture

If any of these checks fail, the CLI stops with actionable error messages.

**Type-safe autocomplete:** After running `generate`, a `tool-types.d.ts` file is created in your `generatedDir` with all available binary names. Add this file to your `tsconfig.json` to get autocomplete for dependency names. See [TypeScript Requirements](./typescript.md#auto-generated-type-definitions) for setup instructions.

## TypeScript Requirements

### Import Statement

Import the `defineTool` function from `@gitea/dotfiles`:

```typescript
import { defineTool } from '@gitea/dotfiles';
```

### Function Signature

The default export must use the `defineTool` helper:

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
- ToolConfigContext provides typed access to all configured paths
- Builder methods return the builder instance for proper chaining

## Next Steps

- [Core Methods](./core-methods.md) - Learn about the essential configuration methods
- [Context API](./context-api.md) - Understand the ToolConfigContext for dynamic paths
- [Installation Methods](./installation/README.md) - Explore different installation options