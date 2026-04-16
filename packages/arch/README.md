# @dotfiles/arch

This package provides utilities for detecting and matching system architectures, which is crucial for selecting the correct binaries or installers for a given platform. It translates system properties (like those from Node.js's `os` module) into a set of flexible patterns, enabling robust matching against various naming conventions found in release assets.

The logic is heavily inspired by the architecture detection mechanism in [Zinit](https://github.com/zdharma-continuum/zinit), ensuring a battle-tested approach to handling the diverse and often inconsistent naming of release artifacts.

## Core Functionality

The primary goal of this package is to answer the question: "Which of these files is the right one for my computer?" It achieves this through a multi-step process:

1. **Pattern Generation**: It takes system information (e.g., `platform: 'darwin'`, `arch: 'arm64'`) and generates a list of common string patterns used to describe that architecture (e.g., `system: ['apple', 'darwin', 'macos']`, `cpu: ['arm64', 'aarch64']`).
2. **Regex Creation**: These string patterns are compiled into regular expressions for efficient matching.
3. **Asset Matching**: It provides functions to filter a list of asset names to find those that match the current system's architecture.
4. **Disambiguation**: If multiple assets match (e.g., `...-linux-gnu.tar.gz` vs. `...-linux-musl.tar.gz`), it uses libc-aware Linux tie-breaking plus ordered variants for other platforms.

## API

### `getArchitecturePatterns(systemInfo: SystemInfo): ArchitecturePatterns`

Generates a set of string patterns for the given system information. This is the foundation of the architecture matching logic.

```typescript
import { getArchitecturePatterns } from "@dotfiles/arch";

const patterns = getArchitecturePatterns({ platform: "linux", arch: "x64", homeDir: "~" });
// patterns.system -> ['linux']
// patterns.cpu -> ['amd64', 'x86_64', 'x64', 'x86-64']
// patterns.variants -> ['gnu', 'musl', 'unknown-linux'] on glibc Linux
```

### `createArchitectureRegex(patterns: ArchitecturePatterns): ArchitectureRegex`

Compiles the string patterns into a set of regular expressions.

```typescript
import { createArchitectureRegex, getArchitecturePatterns } from "@dotfiles/arch";

const patterns = getArchitecturePatterns({ platform: "darwin", arch: "arm64", homeDir: "~" });
const regex = createArchitectureRegex(patterns);
// regex.systemPattern -> '(apple|darwin|...|osx)'
// regex.cpuPattern -> '(arm64|aarch64|aarch)'
```

### `getArchitectureRegex(systemInfo: SystemInfo): ArchitectureRegex`

A convenience function that combines `getArchitecturePatterns` and `createArchitectureRegex` into a single call.

### `matchesArchitecture(assetName: string, architectureRegex: ArchitectureRegex): boolean`

Checks if a single asset name matches the primary system and CPU architecture patterns. This is useful for an initial, broad filtering of assets.

```typescript
import { getArchitectureRegex, matchesArchitecture } from "@dotfiles/arch";

const regex = getArchitectureRegex({ platform: "linux", arch: "x64", homeDir: "~" });
matchesArchitecture("my-tool-linux-amd64.zip", regex); // true
matchesArchitecture("my-tool-darwin-arm64.zip", regex); // false
```

### `selectBestMatch(assetNames: string[], systemInfo: SystemInfo): string | undefined`

This is the highest-level function, designed to select the single best asset from a list. It performs the initial filtering and then applies platform-specific tie-breaking if multiple matches remain. On Linux, it uses the detected libc to rank explicit `gnu`/`musl` assets against generic Linux assets.

```typescript
import { Libc } from "@dotfiles/core";
import { selectBestMatch } from "@dotfiles/arch";

const assets = ["bun-linux-x64-musl-baseline.zip", "bun-linux-x64-baseline.zip"];

const systemInfo = { platform: "linux", arch: "x64", homeDir: "~", libc: Libc.Gnu };

// On glibc Linux, the generic asset wins over an incompatible musl-specific asset
const best = selectBestMatch(assets, systemInfo);
// best -> 'bun-linux-x64-baseline.zip'
```

## Dependencies

- **`@dotfiles/schemas`**: Provides the `SystemInfo` type definition, ensuring consistency with the rest of the application.

This package has no external runtime dependencies, making it a lightweight and pure utility module.
