# Core Methods Reference

This section covers the essential methods available on the `ToolConfigBuilder` for configuring tools.

## `.bin(name: string, pattern?: string)`

Defines an executable binary this tool provides. A shim is generated for the binary name.

**Parameters:**
- `name`: Binary name (required)
- `pattern`: Glob pattern to locate the binary in extracted archives (optional)

**Examples:**
```typescript
// Single binary with default pattern
c.bin('fzf')  // Uses pattern: {,*/}fzf

// Custom pattern for nested binaries
c.bin('gh', '*/bin/gh')

// Multiple binaries - chain .bin() calls
c.bin('git').bin('git-lfs').bin('git-credential-manager')
```

### Binary Pattern Matching

When using archive-based installation methods (`github-release`, `curl-tar`), the pattern determines how to locate the binary within the extracted archive.

**Default Pattern**: `{,*/}name`
- Matches `name` (binary at archive root)
- Matches `*/name` (binary one level deep)
- Handles ~95% of real-world archive structures

**Custom Patterns**:
```typescript
// Binary in a bin subdirectory
c.bin('tool', '*/bin/tool')

// Versioned directory structure
c.bin('tool', 'tool-*/tool')

// Binary at exact root (no subdirectory)
c.bin('tool', 'tool')
```

**Pattern Syntax**: Uses [minimatch](https://github.com/isaacs/minimatch) glob patterns with brace expansion support.

**Important Notes:**
- Each binary name gets a shim in the generated bin directory
- Shims point to the actual installed binary location
- Only executables matching the pattern basename are selected
- Binary names should match the actual executable names

## `.dependsOn(...binaryNames: string[])`

Declares executable dependencies that must be available before this tool can be generated. Each dependency should match the shim name provided by another tool configuration (or an existing system binary already on the machine).

**Parameters:**
- `binaryNames`: One or more binary names that this tool requires

**Examples:**
```typescript
// Single dependency
c.dependsOn('openssl');

// Multiple dependencies declared together
c.dependsOn('node', 'pnpm', 'corepack');

// You can chain additional calls to append more requirements
c.dependsOn('node').dependsOn('eslint');
```

**Validation Rules:**
- Every dependency must be provided by exactly one tool
- Dependencies cannot form cycles (A → B → A)
- Providers must support the target platform/architecture
- Empty or whitespace-only names are ignored with a warning

The CLI stops with descriptive errors if any rule is violated, helping you identify missing, ambiguous, or invalid dependency declarations.

## `.version(version: string)`

Specifies the desired tool version.

**Parameters:**
- `version`: Version string, SemVer constraint, or 'latest'

**Examples:**
```typescript
// Always get the latest release
c.version('latest')

// Specific version
c.version('2.5.1')
c.version('v1.4.0')

// SemVer constraints
c.version('^3.0.0')    // Compatible with 3.x.x
c.version('~2.3.x')    // Compatible with 2.3.x
c.version('>=1.5.0')   // At least 1.5.0
```

**Default:** `'latest'` if not specified

## `.install(method, params)`

Configures how the tool should be installed. The method determines available parameters.

See the [Installation Methods](./installation/README.md) section for detailed information about each installation method:

- [`github-release`](./installation/github-release.md) - Install from GitHub releases
- [`brew`](./installation/homebrew.md) - Install via Homebrew
- [`cargo`](./installation/cargo.md) - Install Rust tools from crates.io
- [`curl-script`](./installation/curl-script.md) - Install via download scripts
- [`curl-tar`](./installation/curl-tar.md) - Download and extract tarballs
- [`manual`](./installation/manual.md) - Install from dotfiles directory or configuration-only

## Method Chaining

All methods return the builder instance, allowing for fluent method chaining:

```typescript
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', { repo: 'owner/tool' })
    .bin('tool')
    .version('latest')
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    .zsh((shell) =>
      shell
        .completions('completions/_tool')
        .aliases({ t: 'tool' })
        .environment({ TOOL_HOME: `${ctx.toolDir}` })
    )
);
```

## Next Steps

- [Installation Methods](./installation/README.md) - Learn about different installation options
- [Shell Integration](./shell-integration.md) - Configure shell environments and aliases
- [Context API](./context-api.md) - Use ToolConfigContext for dynamic paths