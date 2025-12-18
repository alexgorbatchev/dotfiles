# @dotfiles/utils

Common utility functions used across the dotfiles tool installer system. Provides path manipulation, permission formatting, string utilities, version normalization, and platform configuration resolution.

## Features

- **Path Utilities**: Contract/expand home directory paths and resolve tool config paths
- **Permission Formatting**: Convert numeric permissions to readable strings
- **String Utilities**: Template string dedenting and formatting
- **File Editing**: Regex-based file replacements (including async replacement callbacks)
- **Version Normalization**: Standardize version strings
- **Version Detection**: Detect tool versions via CLI execution
- **Platform Configuration**: Resolve platform-specific tool configurations
- **CLI Utilities**: Get CLI binary path and exit with proper codes
- **Timestamp Generation**: Generate ISO timestamps for file operations

## Installation

This package is part of the `@dotfiles` monorepo and is typically not installed directly. It's used as a dependency by other packages in the system.

## API Reference

### Path Utilities

#### `contractHomePath(homeDir: string, absolutePath: string): string`

Contracts an absolute path by replacing the home directory with `~`.

```typescript
import { contractHomePath } from '@dotfiles/utils';

const shortPath = contractHomePath('/Users/john', '/Users/john/projects/dotfiles');
// Returns: '~/projects/dotfiles'
```

#### `expandHomePath(homeDir: string, path: string): string`

Expands a path containing `~` with the actual home directory.

```typescript
import { expandHomePath } from '@dotfiles/utils';

const fullPath = expandHomePath('/Users/john', '~/projects/dotfiles');
// Returns: '/Users/john/projects/dotfiles'
```

#### `expandToolConfigPath(homeDir: string, dotfilesDir: string, path: string): string`

Expands a tool config path, supporting both `~` and `${dotfilesDir}` placeholders.

```typescript
import { expandToolConfigPath } from '@dotfiles/utils';

const configPath = expandToolConfigPath(
  '/Users/john',
  '/Users/john/dotfiles',
  '${dotfilesDir}/tools/ripgrep.tool.ts'
);
// Returns: '/Users/john/dotfiles/tools/ripgrep.tool.ts'
```

### Permission Utilities

#### `formatPermissions(mode: number): string`

Converts numeric file permissions to a readable string format (e.g., `rwxr-xr-x`).

```typescript
import { formatPermissions } from '@dotfiles/utils';

const perms = formatPermissions(0o755);
// Returns: 'rwxr-xr-x'

const readOnly = formatPermissions(0o644);
// Returns: 'rw-r--r--'
```

### String Utilities

#### `dedentString(str: string): string`

Removes leading indentation from a multi-line string while preserving relative indentation.

```typescript
import { dedentString } from '@dotfiles/utils';

const indented = `
  Line 1
    Line 2
  Line 3
`;

const result = dedentString(indented);
// Returns:
// Line 1
//   Line 2
// Line 3
```

#### `dedentTemplate(strings: TemplateStringsArray, ...values: unknown[]): string`

Template tag function for dedenting template literals.

```typescript
import { dedentTemplate } from '@dotfiles/utils';

const script = dedentTemplate`
  #!/bin/bash
  echo "Hello"
  echo "World"
`;
// Returns properly dedented script
```

### File Editing

#### `replaceInFile(options: IReplaceInFileOptions): Promise<void>`

Performs a regex-based replacement within a file.

- Supports processing the whole file (`mode: 'file'`) or line-by-line (`mode: 'line'`) while preserving original EOLs.
- Always replaces all matches (global replacement), even if `from` does not include the `g` flag.
- Supports `to` as either a string or a (a)sync callback.
- Does not write the file when the resulting content is unchanged.

```typescript
import type { IFileSystem } from '@dotfiles/file-system';
import { replaceInFile } from '@dotfiles/utils';

declare const fileSystem: IFileSystem;

await replaceInFile({
  // Optional. Pass a memfs/Node fs implementation explicitly if needed.
  fileSystem,
  filePath: '/tmp/input.txt',
  mode: 'line',
  from: /foo/,
  to: async (match: string): Promise<string> => {
    return match.toUpperCase();
  },
});
```

### Version Utilities

#### `normalizeVersion(version: string): string`

Normalizes version strings by making them safe for file paths (replaces unsafe characters).

```typescript
import { normalizeVersion } from '@dotfiles/utils';

normalizeVersion('v1.2.3'); // Returns: 'v1.2.3'
normalizeVersion('1.2.3');   // Returns: '1.2.3'
normalizeVersion('1.2.3/beta'); // Returns: '1.2.3-beta'
```

#### `stripVersionPrefix(version: string): string`

Strips the `v` or `V` prefix from version strings.

```typescript
import { stripVersionPrefix } from '@dotfiles/utils';

stripVersionPrefix('v1.2.3'); // Returns: '1.2.3'
stripVersionPrefix('V1.2.3'); // Returns: '1.2.3'
stripVersionPrefix('1.2.3');  // Returns: '1.2.3'
```

#### `detectVersionViaCli(options: DetectVersionOptions): Promise<string | undefined>`

Detects the version of a tool by running it with `--version` (or custom args) and parsing the output.

```typescript
import { detectVersionViaCli } from '@dotfiles/utils';

// Using default --version args and semver regex
const version = await detectVersionViaCli({
  binaryPath: '/usr/local/bin/rg',
});
// Returns: '14.1.0' (parsed from output)

// Using custom args and regex
const customVersion = await detectVersionViaCli({
  binaryPath: '/usr/local/bin/mytool',
  args: ['-v'],
  regex: /version[:\s]+(\d+\.\d+\.\d+)/i,
});
```

**Options:**
- `binaryPath` (required): Path to the binary to run
- `args` (optional): Arguments to pass to the binary (default: `['--version']`)
- `regex` (optional): Custom regex to extract version from output (first capture group is used)
- `env` (optional): Environment variables to set when running the binary
- `shellExecutor` (optional): Shell executor for testing

### Platform Configuration

#### `resolvePlatformConfig<T>(toolConfig: ToolConfigWithPlatform, platformInfo: PlatformInfo): T`

Resolves platform-specific configuration by merging base config with platform overrides.

```typescript
import { resolvePlatformConfig } from '@dotfiles/utils';
import type { ToolConfig } from '@dotfiles/core';

const config: ToolConfig = {
  method: 'github-release',
  version: '1.0.0',
  binaries: [{ name: 'rg' }],
  darwin: {
    version: '2.0.0', // Override for macOS
  },
};

const resolved = resolvePlatformConfig(config, {
  system: 'darwin',
  arch: 'arm64',
  cpu: 'arm',
});
// Returns config with darwin overrides applied
```

### CLI Utilities

#### `getCliBinPath(): string`

Gets the path to the current CLI binary executable.

```typescript
import { getCliBinPath } from '@dotfiles/utils';

const binPath = getCliBinPath();
// Returns: '/path/to/cli/binary'
```

#### `exitCli(code: number): never`

Exits the CLI process with the specified exit code.

```typescript
import { exitCli } from '@dotfiles/utils';

if (error) {
  logger.error('Fatal error occurred');
  exitCli(1);
}
```

### Timestamp Utilities

#### `generateTimestamp(): string`

Generates an ISO 8601 timestamp string for the current date/time.

```typescript
import { generateTimestamp } from '@dotfiles/utils';

const timestamp = generateTimestamp();
// Returns: '2024-01-15T10:30:45.123Z'
```

## Usage Examples

### Contract and Expand Paths

```typescript
import { contractHomePath, expandHomePath } from '@dotfiles/utils';

const homeDir = '/Users/john';
const projectPath = '/Users/john/projects/dotfiles';

// Contract path to use tilde
const shortPath = contractHomePath(homeDir, projectPath);
console.log(shortPath); // ~/projects/dotfiles

// Expand it back
const fullPath = expandHomePath(homeDir, shortPath);
console.log(fullPath); // /Users/john/projects/dotfiles
```

### Format File Permissions

```typescript
import { formatPermissions } from '@dotfiles/utils';

const permissions = [
  { mode: 0o755, expected: 'rwxr-xr-x' },
  { mode: 0o644, expected: 'rw-r--r--' },
  { mode: 0o600, expected: 'rw-------' },
];

permissions.forEach(({ mode, expected }) => {
  console.log(`${mode.toString(8)}: ${formatPermissions(mode)}`);
});
```

### Dedent Multi-line Strings

```typescript
import { dedentString, dedentTemplate } from '@dotfiles/utils';

// Using dedentString function
const script1 = dedentString(`
  #!/bin/bash
  echo "Starting..."
  ./run-command
`);

// Using template tag
const script2 = dedentTemplate`
  #!/bin/bash
  echo "Starting..."
  ./run-command
`;
```

### Resolve Platform-Specific Config

```typescript
import { resolvePlatformConfig } from '@dotfiles/utils';
import type { ToolConfig, PlatformInfo } from '@dotfiles/core';

const toolConfig: ToolConfig = {
  method: 'github-release',
  repo: 'BurntSushi/ripgrep',
  binaries: [{ name: 'rg' }],
  darwin: {
    binaries: [{ name: 'rg', pattern: 'rg-*-apple-darwin/rg' }],
  },
  linux: {
    binaries: [{ name: 'rg', pattern: 'rg-*-unknown-linux-musl/rg' }],
  },
};

const darwinInfo: PlatformInfo = {
  system: 'darwin',
  arch: 'arm64',
  cpu: 'arm',
};

const resolved = resolvePlatformConfig(toolConfig, darwinInfo);
// Returns config with darwin-specific binaries pattern
```

## Dependencies

### Internal Dependencies
- `@dotfiles/core` - Core types and interfaces
- `@dotfiles/config` - Configuration types
- `@dotfiles/logger` - Logging infrastructure (for some utilities)

### External Dependencies
- None - This is a pure utility package with minimal dependencies

## Design Decisions

### Why Separate Utility Functions?

Each utility function is in its own file for several reasons:
- **Tree-shaking**: Allows bundlers to only include used utilities
- **Testability**: Each function can be tested in isolation
- **Clarity**: Clear single-responsibility principle
- **Maintainability**: Easy to find and modify specific utilities

### Path Manipulation Strategy

The path utilities use simple string replacement rather than path parsing libraries because:
- The use case is specific and well-defined
- Avoid platform-specific path handling complexities
- Keep dependencies minimal
- Ensure predictable behavior across platforms

### Platform Config Resolution

The `resolvePlatformConfig` function uses deep merging to ensure platform-specific overrides completely replace base values, not partially merge them. This prevents unexpected behavior when platform configs should completely override base settings.

## Testing

All utilities are comprehensively tested with unit tests covering edge cases, error conditions, and typical usage patterns.

## Best Practices

### Using Path Utilities

Always use `contractHomePath` when displaying paths to users to keep output concise and portable:

```typescript
const displayPath = contractHomePath(homeDir, absolutePath);
logger.info(`Installing to ${displayPath}`);
```

### Using Permission Formatting

Format permissions for log messages and user output:

```typescript
const mode = (await fs.stat(filePath)).mode;
logger.debug(`File permissions: ${formatPermissions(mode)}`);
```

### Using Dedent for Scripts

Always use dedent utilities when generating shell scripts or multi-line content:

```typescript
const shellScript = dedentTemplate`
  #!/bin/bash
  export PATH="${binDir}:$PATH"
  exec ${command} "$@"
`;
```

### Version Normalization

Always normalize versions before comparison or storage:

```typescript
const normalizedVersion = normalizeVersion(rawVersion);
await registry.saveToolVersion(toolName, normalizedVersion);
```
