# @dotfiles/unwrap-value

A utility for handling values that may be static, synchronous functions, or asynchronous functions.

## Installation

This package is part of the `@dotfiles` workspace and is automatically available to other packages.

## Usage

### Basic Example

```typescript
import { resolveValue, Resolvable } from '@dotfiles/unwrap-value';

interface Context {
  version: string;
  platform: string;
}

// Static value - just use it directly
const staticUrl: Resolvable<Context, string> = 'https://example.com/download';

// Sync function - computed based on context
const dynamicUrl: Resolvable<Context, string> = (ctx) =>
  `https://example.com/download/${ctx.version}/${ctx.platform}`;

// Async function - fetched from external source
const asyncUrl: Resolvable<Context, string> = async (ctx) => {
  const response = await fetch(`https://api.example.com/tools/${ctx.version}`);
  const data = await response.json();
  return data.downloadUrl;
};

// All three resolve the same way:
const context: Context = { version: '1.0.0', platform: 'darwin' };

const url1 = await resolveValue(context, staticUrl);   // 'https://example.com/download'
const url2 = await resolveValue(context, dynamicUrl);  // 'https://example.com/download/1.0.0/darwin'
const url3 = await resolveValue(context, asyncUrl);    // fetched from API
```

### Configuration Pattern

This pattern is particularly useful for configuration objects where some fields need to be computed:

```typescript
import { resolveValue, Resolvable } from '@dotfiles/unwrap-value';

interface ToolContext {
  version: string;
  arch: 'x64' | 'arm64';
  platform: 'darwin' | 'linux';
}

interface ToolConfig {
  name: string;
  downloadUrl: Resolvable<ToolContext, string>;
  binaryPaths: Resolvable<ToolContext, string[]>;
  enabled: Resolvable<ToolContext, boolean>;
}

const ripgrepConfig: ToolConfig = {
  name: 'ripgrep',
  // Dynamic URL based on context
  downloadUrl: (ctx) =>
    `https://github.com/BurntSushi/ripgrep/releases/download/${ctx.version}/ripgrep-${ctx.version}-${ctx.arch}-apple-${ctx.platform}.tar.gz`,
  // Static binary paths
  binaryPaths: ['rg'],
  // Conditional enablement
  enabled: (ctx) => ctx.platform === 'darwin' || ctx.platform === 'linux',
};

async function installTool(config: ToolConfig, context: ToolContext): Promise<void> {
  const isEnabled = await resolveValue(context, config.enabled);
  if (!isEnabled) return;

  const url = await resolveValue(context, config.downloadUrl);
  const binaries = await resolveValue(context, config.binaryPaths);
  
  // ... installation logic
}
```

## API

### `Resolvable<TParams, TReturn>`

A type that represents a value which can be:
- A static value of type `TReturn`
- A synchronous function `(params: TParams) => TReturn`
- An asynchronous function `(params: TParams) => Promise<TReturn>`

```typescript
type Resolvable<TParams, TReturn> =
  | TReturn
  | ((params: TParams) => TReturn)
  | ((params: TParams) => Promise<TReturn>);
```

### `resolveValue<TParams, TReturn>(params, resolvable): Promise<TReturn>`

Resolves a `Resolvable` value to its actual value.

**Parameters:**
- `params` - Parameters to pass to the resolver function if it's a function
- `resolvable` - The value to resolve (static, sync function, or async function)

**Returns:** A promise that resolves to the unwrapped value

**Note:** Even static values return a Promise for consistent async handling.

## Error Handling

Errors thrown by resolver functions propagate normally:

```typescript
const failing: Resolvable<Context, string> = () => {
  throw new Error('Something went wrong');
};

try {
  await resolveValue(context, failing);
} catch (error) {
  // Handle error
}
```
