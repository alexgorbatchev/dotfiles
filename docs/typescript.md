# TypeScript Configuration

Tool configurations use TypeScript for type safety. This page covers setup and common patterns.

## Imports

```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';
```

| Export | Description |
|--------|-------------|
| `defineTool` | Factory function to create tool configurations |
| `Platform` | Enum: `Darwin`, `Linux`, `Windows`, `MacOS` |
| `Architecture` | Enum: `X86_64`, `Arm64` |

## Basic Structure

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
);
```

## Configuration-Only Tools

Tools that only contribute shell configuration (no binary installation):

```typescript
export default defineTool((install) =>
  install().zsh((shell) =>
    shell.environment({ FOO: 'bar' })
  )
);
```

## Auto-Generated Types

Running `dotfiles generate` creates `.generated/tool-types.d.ts` with type-safe `dependsOn()` autocomplete for all your tool binaries.

Add to your `tsconfig.json`:

```json
{
  "include": [
    "tools/**/*.tool.ts",
    ".generated/tool-types.d.ts"
  ]
}
```

## Type Safety Examples

### Correct Usage

```typescript
// ✅ Valid - required parameters provided
install('github-release', { repo: 'owner/tool' })

// ✅ Valid - using Platform enum
.platform(Platform.MacOS, (p) => p.install('brew', { formula: 'tool' }))

// ✅ Valid - context properties are values
const homeDir = ctx.projectConfig.paths.homeDir;
```

### Common Errors

```typescript
// ❌ Missing required parameter
install('github-release', {})  // Error: 'repo' is required

// ❌ Invalid parameter for method
install('brew', { repo: 'owner/tool' })  // Error: 'repo' not valid for brew

// ❌ String instead of enum
.platform('macos', ...)  // Error: use Platform.MacOS
```

## Next Steps

- [Getting Started](./getting-started.md) - Basic configuration structure
- [API Reference](./api-reference.md) - Method signatures and parameters
- [Common Patterns](./common-patterns.md) - Real-world examples