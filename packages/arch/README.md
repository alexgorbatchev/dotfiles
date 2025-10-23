# @dotfiles/arch

Architecture detection and matching utilities for multi-platform tool installation. Provides regex-based pattern matching for CPU architectures with support for common architecture naming conventions.

## Overview

The architecture package solves the problem of matching binary assets across different architecture naming conventions (e.g., `x86_64`, `amd64`, `x64` all referring to the same architecture). It provides a unified way to detect and match architectures for tool installation.

## Features

- **Architecture Detection**: Identify the current system architecture
- **Pattern Matching**: Match architecture strings using flexible regex patterns
- **Multiple Naming Conventions**: Handle various architecture naming schemes
- **Type-Safe**: Full TypeScript support with exported types

## Architecture Support

The package supports the following architectures:
- `x86_64` / `amd64` / `x64` (64-bit Intel/AMD)
- `aarch64` / `arm64` (64-bit ARM)
- `i686` / `x86` / `i386` (32-bit Intel)
- `armv7` / `armhf` (32-bit ARM)

## API

### `createArchitectureRegex(architecture: Architecture): RegExp`

Creates a regex pattern that matches various naming conventions for a given architecture.

```typescript
import { createArchitectureRegex } from '@dotfiles/arch';

const regex = createArchitectureRegex('x86_64');
// Matches: x86_64, amd64, x64, x86-64, etc.

console.log(regex.test('amd64')); // true
console.log(regex.test('x86_64')); // true
```

### `getArchitectureRegex(architecture: Architecture): RegExp`

Returns a cached regex for the given architecture (singleton pattern).

```typescript
import { getArchitectureRegex } from '@dotfiles/arch';

const regex = getArchitectureRegex('aarch64');
// Returns cached regex instance
```

### `matchesArchitecture(input: string, architecture: Architecture): boolean`

Checks if a string matches the given architecture using flexible pattern matching.

```typescript
import { matchesArchitecture } from '@dotfiles/arch';

// Matches asset filenames
matchesArchitecture('myapp-linux-amd64.tar.gz', 'x86_64'); // true
matchesArchitecture('myapp-darwin-arm64.zip', 'aarch64'); // true
matchesArchitecture('myapp-x86.zip', 'i686'); // true
```

### `getArchitecturePatterns(architecture: Architecture): string[]`

Returns all known naming patterns for an architecture.

```typescript
import { getArchitecturePatterns } from '@dotfiles/arch';

const patterns = getArchitecturePatterns('x86_64');
// Returns: ['x86_64', 'amd64', 'x64']
```

## Usage Examples

### Basic Architecture Matching

```typescript
import { matchesArchitecture } from '@dotfiles/arch';
import { Architecture } from '@dotfiles/schemas';

// Check if a filename matches the system architecture
const filename = 'tool-v1.0.0-linux-amd64.tar.gz';
const isCompatible = matchesArchitecture(filename, Architecture.X86_64);

if (isCompatible) {
  console.log('This binary is compatible with the system');
}
```

### Asset Selection

```typescript
import { matchesArchitecture, getArchitectureRegex } from '@dotfiles/arch';
import type { Architecture } from '@dotfiles/schemas';

function selectAsset(assets: string[], arch: Architecture): string | null {
  const regex = getArchitectureRegex(arch);
  
  for (const asset of assets) {
    if (regex.test(asset)) {
      return asset;
    }
  }
  
  return null;
}

const assets = [
  'tool-linux-amd64.tar.gz',
  'tool-darwin-arm64.tar.gz',
  'tool-windows-x86.zip'
];

const selected = selectAsset(assets, 'x86_64');
console.log(selected); // 'tool-linux-amd64.tar.gz'
```

### Custom Pattern Matching

```typescript
import { createArchitectureRegex, getArchitecturePatterns } from '@dotfiles/arch';

// Get all patterns for debugging
const patterns = getArchitecturePatterns('aarch64');
console.log('Supported patterns:', patterns);
// ['aarch64', 'arm64']

// Create custom regex
const regex = createArchitectureRegex('aarch64');
console.log(regex.source);
// Shows the regex pattern used for matching
```

## Integration with Installer

The architecture package is used by the installer to select appropriate binary assets:

```typescript
import { matchesArchitecture } from '@dotfiles/arch';
import type { SystemInfo } from '@dotfiles/schemas';

function filterAssetsByArchitecture(
  assets: Array<{ name: string }>,
  systemInfo: SystemInfo
): Array<{ name: string }> {
  return assets.filter(asset =>
    matchesArchitecture(asset.name, systemInfo.arch)
  );
}
```

## Architecture Enum

The package uses the `Architecture` enum from `@dotfiles/schemas`:

```typescript
enum Architecture {
  X86_64 = 'x86_64',
  AARCH64 = 'aarch64',
  I686 = 'i686',
  ARMV7 = 'armv7'
}
```

## Pattern Matching Rules

### Case Insensitive
All matching is case-insensitive to handle variations like `AMD64` vs `amd64`.

### Delimiter Flexibility
Patterns match with common delimiters:
- Hyphens: `x86-64`
- Underscores: `x86_64`
- No delimiter: `x8664`

### Position Independent
Patterns can appear anywhere in the string, making them suitable for filename matching.

## Dependencies

### Internal Dependencies
- `@dotfiles/schemas` - Type definitions for Architecture enum

### External Dependencies
None - this is a pure utility package with no external dependencies.

## Testing

Run tests with:
```bash
bun test packages/arch
```

The package includes comprehensive tests for:
- Pattern matching accuracy
- All supported architectures
- Edge cases and variations
- Regex caching behavior

## Design Decisions

### Why Regex-Based?
Regex provides flexible, performant pattern matching that can handle the wide variety of architecture naming conventions found in binary releases.

### Why Singleton Cache?
Architecture regexes are reused frequently during asset selection. Caching prevents repeated regex compilation and improves performance.

### Why Support Multiple Patterns?
Different projects use different naming conventions. Supporting multiple patterns ensures compatibility with the widest range of tools.

## Performance Considerations

- **Regex Caching**: Compiled regexes are cached to avoid recompilation
- **Simple Patterns**: Patterns are kept simple for fast matching
- **No Runtime Dependencies**: Pure TypeScript with no runtime overhead

## Future Enhancements

Potential improvements:
- Support for additional architectures (RISC-V, PowerPC)
- Custom pattern registration
- Architecture aliasing support
- Platform-specific pattern preferences
