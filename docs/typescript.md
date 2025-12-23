# TypeScript Requirements

The `.tool.ts` configuration files use TypeScript for type safety and validation. This section covers the TypeScript requirements and best practices.

## Auto-Generated Type Definitions

### tool-types.d.ts

When you run the `generate` command, the system automatically creates a `tool-types.d.ts` file in your `generatedDir` (defaults to `.generated/`). This file provides type-safe autocomplete for the `dependsOn()` method by extracting all binary names from your loaded tool configurations.

**Location:** `${generatedDir}/tool-types.d.ts`

**What it contains:**
- `KnownBinName` type: A union of all binary names from your tool configurations
- Module augmentation for `@gitea/dotfiles` to provide autocomplete in `.tool.ts` files

**Example generated content:**
```typescript
export type KnownBinName = 'rg' | 'eza' | 'borders' | 'fd';

declare module '@gitea/dotfiles' {
  interface IToolConfigBuilder {
    dependsOn(...binaryNames: KnownBinName[]): this;
  }
  
  interface IPlatformConfigBuilder {
    dependsOn(...binaryNames: KnownBinName[]): this;
  }
}
```

### TypeScript Configuration

To enable autocomplete for `dependsOn()` in your tool configuration files, add the generated types to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@gitea/dotfiles"]
  },
  "include": [
    "tools/**/*.tool.ts",
    ".generated/tool-types.d.ts"
  ]
}
```

**Important:** The `tool-types.d.ts` file is regenerated every time you run `generate`, so you should:
- Add `.generated/` to your `.gitignore`
- Run `generate` after cloning or adding new tools
- Include the path in your `tsconfig.json` so TypeScript can discover it

## Import Statements

Always import required types and utilities at the top of your configuration file:

```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';
```

### Available Imports

- **`defineTool`**: Factory function to create tool configurations
- **`Platform`**: Platform enumeration for cross-platform configuration
- **`Architecture`**: Architecture enumeration for architecture-specific configuration

## Function Signature

The default export must use `defineTool` with this signature:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) => {
  // Configuration goes here
});
```

### Parameters

- **`install`**: Function to create installation configuration
- **`ctx`**: The ToolConfigContext with paths and configuration information

### Return Type

- Must return the configured tool from the `defineTool` callback
- Use fluent builder methods to configure the tool
- All configuration is done through method calls on the returned builder

## Type Safety Features

### Method Call Validation

All method calls are type-checked at compile time:

```typescript
import { defineTool } from '@gitea/dotfiles';

// ✅ Correct - all required parameters provided
export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'owner/repository'
  })
    .bin('tool')
);

// ❌ Type error - missing required 'repo' parameter
export default defineTool((install, ctx) =>
  install('github-release', {})
    .bin('tool')
);
```

### Parameter Validation

Installation parameters are validated based on the method:

```typescript
import { defineTool } from '@gitea/dotfiles';

// ✅ Correct - valid brew parameters
export default defineTool((install, ctx) =>
  install('brew', {
    formula: 'tool-name'
  })
    .bin('tool')
);

// ❌ Type error - 'repo' is not valid for brew
export default defineTool((install, ctx) =>
  install('brew', {
    repo: 'owner/tool'  // This will cause a type error
  })
    .bin('tool')
);
```

### Platform and Architecture Validation

Platform and Architecture values must use the provided enums:

```typescript
import { defineTool, Platform, Architecture } from '@gitea/dotfiles';

// ✅ Correct - using enum values
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
    )
);

// ❌ Type error - string literals not allowed
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform('macos', (install) =>
      install('brew', { formula: 'tool' })
    )
);
```

## Common Type Errors and Solutions

### Missing Required Parameters

**Error:**
```typescript
// ❌ Wrong - 'formula' is required for brew
export default defineTool((install, ctx) =>
  install('brew', {})
    .bin('tool')
);
```

**Solution:**
```typescript
// ✅ Correct
export default defineTool((install, ctx) =>
  install('brew', { formula: 'tool-name' })
    .bin('tool')
);
```

### Invalid Installation Method Parameters

**Error:**
```typescript
// ❌ Wrong - 'assetPattern' is not valid for manual install
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: '/usr/bin/tool',
    assetPattern: '*.tar.gz'  // Type error
  })
    .bin('tool')
);
```

**Solution:**
```typescript
// ✅ Correct - only valid parameters for manual install
export default defineTool((install, ctx) =>
  install('manual', {
    binaryPath: '/usr/bin/tool'
  })
    .bin('tool')
);
```

### Invalid Platform Values

**Error:**
```typescript
// ❌ Wrong - Platform is an enum, not a string
export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform('macos', (install) =>
      install('github-release', { repo: 'owner/tool' })
    )
);
```

**Solution:**
```typescript
// ✅ Correct - use Platform enum
import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .platform(Platform.MacOS, (install) =>
      install('brew', { formula: 'tool' })
    )
);
```

### Incorrect Context Usage

**Error:**
```typescript
// ❌ Wrong - ctx properties are not functions
export default defineTool((install, ctx) => {
  const homeDir = ctx.projectConfig.paths.homeDir();
  return install('github-release', { repo: 'owner/tool' })
    .bin('tool');
});
```

**Solution:**
```typescript
// ✅ Correct - ctx properties are values
export default defineTool((install, ctx) => {
  const homeDir = ctx.projectConfig.paths.homeDir;
  return install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .environment({ HOME: homeDir });
});
```

## Type Definitions

### ToolConfigBuilder Methods

The builder provides these typed methods:

```typescript
interface IToolConfigBuilder {
  bin(names: string | string[]): ToolConfigBuilder;
  version(version: string): ToolConfigBuilder;
  install(method: InstallMethod, params: InstallParams): ToolConfigBuilder;
  completions(config: CompletionConfig): ToolConfigBuilder;
  symlink(source: string, target: string): ToolConfigBuilder;
  zsh(config: ShellConfig): ToolConfigBuilder;
  bash(config: ShellConfig): ToolConfigBuilder;
  powershell(config: ShellConfig): ToolConfigBuilder;
  platform(platform: Platform, configure: (builder: ToolConfigBuilder) => void): ToolConfigBuilder;
  platform(platform: Platform, arch: Architecture, configure: (builder: ToolConfigBuilder) => void): ToolConfigBuilder;
  hooks(hooks: HookConfig): ToolConfigBuilder;
}
```

### Shell Configuration Types

```typescript
interface IShellConfig {
  completions?: ShellCompletionConfig;
  shellInit?: ShellScript[];
  aliases?: Record<string, string>;
  environment?: Record<string, string>;
}

interface IShellCompletionConfig {
  /** Path to completion file relative to extracted archive root */
  source?: string;
  /** Command to execute to generate completion content */
  cmd?: string;
  /** Binary name used for completion filename (when different from tool name) */
  bin?: string;
  /** Optional custom completion filename (overrides bin and defaults) */
  name?: string;
  /** Optional custom installation directory (absolute path) */
  targetDir?: string;
}

// Note: Either `source` OR `cmd` must be provided, but not both.
```

### Installation Method Types

```typescript
type InstallMethod = 
  | 'github-release'
  | 'brew'
  | 'cargo'
  | 'curl-script'
  | 'curl-tar'
  | 'manual';

// Each method has its own parameter type
interface IGitHubReleaseParams {
  repo: string;
  assetPattern?: string;
  binaryPath?: string;
  version?: string;
  includePrerelease?: boolean;
  stripComponents?: number;
  assetSelector?: (assets: Asset[], sysInfo: SystemInfo) => Asset | undefined;
}

interface IBrewParams {
  formula?: string;
  cask?: boolean;
  tap?: string | string[];
}

// ... other parameter types
```

## IDE Support

### VS Code

For optimal TypeScript support in VS Code:

1. **Install TypeScript extension**: Provides syntax highlighting and error checking
2. **Configure workspace**: Ensure TypeScript is configured for the project
3. **Use IntelliSense**: Get autocomplete for method names and parameters

### Type Checking

Run TypeScript compiler to check for errors:

```bash
# Check types
bun typecheck
```

## Best Practices

### 1. Import Types Correctly

```typescript
// ✅ Correct - import defineTool and types from @gitea/dotfiles
import { defineTool } from '@gitea/dotfiles';

// ✅ Correct - import utility types if needed
import type { ToolConfig } from '@gitea/dotfiles';
```

### 2. Use Proper Function Signature

```typescript
// ✅ Correct - use defineTool pattern
export default defineTool((install, ctx) => {
  return install('github-release', {
    repo: 'owner/tool'
  });
});

// ❌ Wrong - old async function pattern
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // This pattern is no longer supported
};
```

### 3. Leverage Type Inference

```typescript
// ✅ Good - let TypeScript infer the types
export default defineTool((install, ctx) => {
  return install('github-release', {
    repo: 'owner/tool',
    assetPattern: '*.tar.gz'
    // Regex string is also supported: '/^tool-.*\\.tar\\.gz$/'
  });
});

// ❌ Unnecessary - explicit typing not needed
c.install('github-release' as const, {
  repo: 'owner/tool' as string,
  assetPattern: '*.tar.gz' as string
});
```

### 4. Use Proper API Patterns

```typescript
// ✅ Correct - method chaining with defineTool
export default defineTool((install, ctx) => {
  return install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version('latest');
});

// ❌ Wrong - old builder pattern
import { Platform, Architecture } from '@types';

c.platform(Platform.MacOS, Architecture.Arm64, (c) => {
  // Configuration
});

// ❌ Wrong - magic numbers or strings
c.platform(2, 2, (c) => {});
```

### 5. Handle Optional Parameters

```typescript
// ✅ Good - only provide parameters you need
export default defineTool((install, ctx) => {
  return install('github-release', {
    repo: 'owner/tool'
    // assetPattern is optional
  });
});

// ✅ Also good - provide optional parameters when needed
export default defineTool((install, ctx) => {
  return install('github-release', {
    repo: 'owner/tool',
    assetPattern: '*linux*.tar.gz',
    // TypeScript-only: you can also pass a RegExp value
    // assetPattern: /^tool-.*\.tar\.gz$/,
    binaryPath: 'bin/tool'
  });
});
```

## Compilation and Validation

### Build-Time Validation

TypeScript provides compile-time validation:

```bash
# Check for type errors
npm run typecheck

# Build with type checking
npm run build
```

### Runtime Validation

The system also provides runtime validation using Zod schemas:

- Configuration parameters are validated at runtime
- Invalid configurations will fail with descriptive error messages
- Schema validation ensures data integrity

## Troubleshooting Type Issues

### Check Import Paths

Ensure you're importing from the correct module:

```typescript
// ✅ Correct
import { defineTool } from '@gitea/dotfiles';

// ❌ Wrong - incorrect import path
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
```

### Verify Method Signatures

Check that you're calling methods with the correct parameters:

```typescript
// Check the method signature in your IDE
c.install(/* hover here to see expected parameters */);
```

### Use TypeScript Error Messages

TypeScript provides helpful error messages:

```
Type '{ repo: string; invalidParam: string; }' is not assignable to parameter of type 'GitHubReleaseParams'.
Object literal may only specify known properties, and 'invalidParam' does not exist in type 'GitHubReleaseParams'.
```

## Next Steps

- [Getting Started](./getting-started.md) - Learn the basic configuration structure
- [Core Methods](./core-methods.md) - Understand the available methods
- [Common Patterns](./common-patterns.md) - See typed examples in practice