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

Always import required types at the top of your configuration file:

```typescript
import type { ToolConfigBuilder, ToolConfigContext } from '@types';
import { Platform, Architecture } from '@types';
```

### Available Imports

- **`ToolConfigBuilder`**: The main configuration builder interface
- **`ToolConfigContext`**: Context object with paths and configuration
- **`Platform`**: Platform enumeration for cross-platform configuration
- **`Architecture`**: Architecture enumeration for architecture-specific configuration
- **`always`, `once`**: Script timing markers for shell integration

## Function Signature

The default export must be an async function with this exact signature:

```typescript
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Configuration goes here
};
```

### Parameters

- **`c`**: The ToolConfigBuilder instance for configuring the tool
- **`ctx`**: The ToolConfigContext with paths and configuration information

### Return Type

- Must return `Promise<void>`
- The function should not return any value
- All configuration is done through method calls on the builder

## Type Safety Features

### Method Call Validation

All method calls are type-checked at compile time:

```typescript
// ✅ Correct - all required parameters provided
c.install('github-release', {
  repo: 'owner/repository'
})

// ❌ Type error - missing required 'repo' parameter
c.install('github-release', {})
```

### Parameter Validation

Installation parameters are validated based on the method:

```typescript
// ✅ Correct - valid brew parameters
c.install('brew', {
  formula: 'tool-name'
})

// ❌ Type error - 'repo' is not valid for brew
c.install('brew', {
  repo: 'owner/tool'  // This will cause a type error
})
```

### Platform and Architecture Validation

Platform and Architecture values must use the provided enums:

```typescript
import { Platform, Architecture } from '@types';

// ✅ Correct - using enum values
c.platform(Platform.MacOS, (c) => {
  // macOS-specific configuration
})

// ❌ Type error - string literals not allowed
c.platform('macos', (c) => {})  // Type error
```

## Common Type Errors and Solutions

### Missing Required Parameters

**Error:**
```typescript
// ❌ Wrong - 'formula' is required for brew
c.install('brew', {})
```

**Solution:**
```typescript
// ✅ Correct
c.install('brew', { formula: 'tool-name' })
```

### Invalid Installation Method Parameters

**Error:**
```typescript
// ❌ Wrong - 'assetPattern' is not valid for manual install
c.install('manual', {
  binaryPath: '/usr/bin/tool',
  assetPattern: '*.tar.gz'  // Type error
})
```

**Solution:**
```typescript
// ✅ Correct - only valid parameters for manual install
c.install('manual', {
  binaryPath: '/usr/bin/tool'
})
```

### Invalid Platform Values

**Error:**
```typescript
// ❌ Wrong - Platform is an enum, not a string
c.platform('macos', (c) => {})
```

**Solution:**
```typescript
// ✅ Correct - use Platform enum
import { Platform } from '@types';
c.platform(Platform.MacOS, (c) => {})
```

### Incorrect Context Usage

**Error:**
```typescript
// ❌ Wrong - ctx properties are not functions
const homeDir = ctx.homeDir();
```

**Solution:**
```typescript
// ✅ Correct - ctx properties are values
const homeDir = ctx.homeDir;
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
  source: string;
  name?: string;
  targetDir?: string;
}
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
# Check types without emitting files
npm run typecheck

# Or use tsc directly
npx tsc --noEmit
```

## Best Practices

### 1. Import Types Correctly

```typescript
// ✅ Correct - use type-only imports for interfaces
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

// ✅ Correct - use regular imports for enums and values
import { Platform, Architecture, always, once } from '@types';
```

### 2. Use Proper Function Signature

```typescript
// ✅ Correct - async function with proper types
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Configuration
};

// ❌ Wrong - missing async or wrong return type
export default (c: ToolConfigBuilder, ctx: ToolConfigContext) => {
  // Configuration
};
```

### 3. Leverage Type Inference

```typescript
// ✅ Good - let TypeScript infer the type
c.install('github-release', {
  repo: 'owner/tool',
  assetPattern: '*.tar.gz'
});

// ❌ Unnecessary - explicit typing not needed
c.install('github-release' as const, {
  repo: 'owner/tool' as string,
  assetPattern: '*.tar.gz' as string
});
```

### 4. Use Enum Values

```typescript
// ✅ Correct - use provided enums
import { Platform, Architecture } from '@types';

c.platform(Platform.MacOS, Architecture.Arm64, (c) => {
  // Configuration
});

// ❌ Wrong - magic numbers or strings
c.platform(2, 2, (c) => {});  // Type error
```

### 5. Handle Optional Parameters

```typescript
// ✅ Good - only provide parameters you need
c.install('github-release', {
  repo: 'owner/tool'
  // assetPattern is optional
});

// ✅ Also good - provide optional parameters when needed
c.install('github-release', {
  repo: 'owner/tool',
  assetPattern: '*linux*.tar.gz',
  binaryPath: 'bin/tool'
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
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

// ❌ Wrong - incorrect import path
import type { ToolConfigBuilder, ToolConfigContext } from './types';
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