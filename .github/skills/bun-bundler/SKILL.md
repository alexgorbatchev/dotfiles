---
name: bun-bundler
description: Bun's native bundler API and CLI reference. Use when bundling JavaScript, TypeScript, or JSX files, configuring build outputs, code splitting, minification, sourcemaps, external packages, or creating standalone executables with Bun.build() or `bun build` CLI.
---

# Bun Bundler

## Quick Reference

```typescript
// JavaScript API
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './build',
});

// CLI equivalent
// bun build ./index.tsx --outdir ./build
```

## Basic Build

```typescript
const result = await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
});

if (!result.success) {
  console.error('Build failed:', result.logs);
}

for (const output of result.outputs) {
  console.log(output.path, output.kind);
}
```

## Build Options

### Target Environments

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  target: 'browser', // 'browser' | 'bun' | 'node'
});
```

- `browser` (default): Prioritizes `"browser"` export condition
- `bun`: Adds `// @bun` pragma, uses `"bun"` exports
- `node`: Prioritizes `"node"` exports, outputs `.mjs`

### Output Format

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  format: 'esm', // 'esm' | 'cjs' | 'iife'
});
```

### Code Splitting

```typescript
await Bun.build({
  entrypoints: ['./entry-a.ts', './entry-b.ts'],
  outdir: './out',
  splitting: true,
});
```

Creates shared chunks for code imported by multiple entrypoints.

### External Packages

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  external: ['lodash', 'react'], // Exclude from bundle
  // or
  packages: 'external', // Exclude all packages
});
```

Wildcard: `external: ['*']` marks all imports as external.

### Minification

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  minify: true, // Enable all minification
  // or granular:
  minify: {
    whitespace: true,
    identifiers: true,
    syntax: true,
  },
});
```

### Sourcemaps

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  sourcemap: 'linked', // 'none' | 'linked' | 'external' | 'inline'
});
```

- `none`: No sourcemap (default)
- `linked`: Separate `.map` file with `//# sourceMappingURL` comment
- `external`: Separate `.map` file without comment
- `inline`: Base64-encoded in bundle

### Environment Variables

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  env: 'inline', // Inline all env vars
  // or
  env: 'PUBLIC_*', // Only vars matching prefix
});
```

### Define Constants

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  define: {
    'process.env.API_URL': JSON.stringify('https://api.example.com'),
    DEBUG: 'false',
  },
});
```

### Custom Loaders

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  loader: {
    '.png': 'dataurl',
    '.txt': 'file',
  },
});
```

Available loaders: `js`, `jsx`, `ts`, `tsx`, `css`, `json`, `jsonc`, `toml`, `yaml`, `text`, `file`, `napi`, `wasm`, `html`.

### Naming Patterns

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  naming: {
    entry: '[dir]/[name].[ext]',
    chunk: '[name]-[hash].[ext]',
    asset: '[name]-[hash].[ext]',
  },
});
```

Tokens: `[name]`, `[ext]`, `[hash]`, `[dir]`.

### Banner and Footer

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  banner: '"use client";',
  footer: '// Built with Bun',
});
```

### Drop Code

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  drop: ['console', 'debugger'],
});
```

### Public Path

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  publicPath: 'https://cdn.example.com/',
});
```

Prefixes asset and chunk paths in output.

### JSX Configuration

```typescript
await Bun.build({
  entrypoints: ['./app.tsx'],
  outdir: './out',
  jsx: {
    runtime: 'automatic', // 'automatic' | 'classic'
    importSource: 'preact',
    // For classic runtime:
    factory: 'h',
    fragment: 'Fragment',
  },
});
```

## In-Memory Bundling

### Virtual Files

```typescript
const result = await Bun.build({
  entrypoints: ['/app/index.ts'],
  files: {
    '/app/index.ts': `
      import { greet } from "./greet.ts";
      console.log(greet("World"));
    `,
    '/app/greet.ts': `
      export function greet(name: string) {
        return "Hello, " + name + "!";
      }
    `,
  },
});

const output = await result.outputs[0].text();
```

### Override Files on Disk

```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  files: {
    './src/config.ts': `
      export const API_URL = "https://api.production.com";
    `,
  },
  outdir: './dist',
});
```

## Build Artifacts

```typescript
const result = await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
});

for (const output of result.outputs) {
  output.path; // Absolute path
  output.kind; // 'entry-point' | 'chunk' | 'asset' | 'sourcemap' | 'bytecode'
  output.loader; // Loader used
  output.hash; // Content hash
  output.sourcemap; // Associated sourcemap artifact

  // Blob methods
  await output.text();
  await output.arrayBuffer();
  await output.bytes();

  // Use in Response
  new Response(output);
}
```

## Feature Flags

```typescript
// In source code
import { feature } from 'bun:bundle';

if (feature('PREMIUM')) {
  initPremiumFeatures();
}
```

```typescript
// Build configuration
await Bun.build({
  entrypoints: ['./app.ts'],
  outdir: './out',
  features: ['PREMIUM'], // Enable flags
});
```

Type safety via declaration:

```typescript
// env.d.ts
declare module 'bun:bundle' {
  interface Registry {
    features: 'DEBUG' | 'PREMIUM' | 'BETA';
  }
}
```

## Metafile

```typescript
const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  metafile: true,
});

if (result.metafile) {
  // Input analysis
  for (const [path, meta] of Object.entries(result.metafile.inputs)) {
    console.log(`${path}: ${meta.bytes} bytes`);
  }

  // Save for bundle analysis
  await Bun.write('./dist/meta.json', JSON.stringify(result.metafile));
}
```

## Bytecode

```typescript
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  target: 'bun',
  format: 'cjs',
  bytecode: true, // Generates .jsc files
});
```

Improves startup times. Requires `target: "bun"` and `format: "cjs"`.

## Watch Mode

CLI only:

```bash
bun build ./index.tsx --outdir ./out --watch
```

## Standalone Executables

```bash
bun build ./cli.tsx --outfile mycli --compile
./mycli
```

Creates self-contained executable with embedded Bun runtime.

## Error Handling

```typescript
try {
  const result = await Bun.build({
    entrypoints: ['./index.tsx'],
    outdir: './out',
  });
} catch (e) {
  const error = e as AggregateError;
  for (const msg of error.errors) {
    console.error(msg.message, msg.position);
  }
}

// Or use throw: false
const result = await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
  throw: false,
});

if (!result.success) {
  console.error(result.logs);
}
```

## CLI Reference

```bash
bun build <entrypoints> [options]
```

### Common Options

| Option                | Description                            |
| --------------------- | -------------------------------------- |
| `--outdir <dir>`      | Output directory                       |
| `--outfile <file>`    | Output to specific file                |
| `--target <target>`   | `browser`, `bun`, or `node`            |
| `--format <format>`   | `esm`, `cjs`, or `iife`                |
| `--splitting`         | Enable code splitting                  |
| `--minify`            | Enable all minification                |
| `--sourcemap <type>`  | `linked`, `inline`, `external`, `none` |
| `--external <pkg>`    | Exclude package from bundle            |
| `--packages external` | Exclude all packages                   |
| `--watch`             | Rebuild on changes                     |
| `--compile`           | Create standalone executable           |
| `--production`        | Set NODE_ENV=production, enable minify |

### Naming Options

| Option                     | Description            |
| -------------------------- | ---------------------- |
| `--entry-naming <pattern>` | Entry filename pattern |
| `--chunk-naming <pattern>` | Chunk filename pattern |
| `--asset-naming <pattern>` | Asset filename pattern |

### Minification Options

| Option                 | Description        |
| ---------------------- | ------------------ |
| `--minify-syntax`      | Minify syntax      |
| `--minify-whitespace`  | Minify whitespace  |
| `--minify-identifiers` | Minify identifiers |

## Supported File Types

| Extensions                                                   | Handling                                 |
| ------------------------------------------------------------ | ---------------------------------------- |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.mts`, `.cjs`, `.cts` | Transpiled to JavaScript                 |
| `.json`, `.jsonc`                                            | Inlined as object                        |
| `.toml`, `.yaml`, `.yml`                                     | Parsed and inlined as object             |
| `.txt`                                                       | Inlined as string                        |
| `.html`                                                      | Processed, referenced assets bundled     |
| `.css`                                                       | Bundled into single CSS file             |
| Other                                                        | Copied as asset, import resolves to path |
