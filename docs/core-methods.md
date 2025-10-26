# Core Methods Reference

This section covers the essential methods available on the `ToolConfigBuilder` for configuring tools.

## `.bin(names: string | string[])`

Defines the executable binaries this tool provides. Shims are generated for each binary name.

**Parameters:**
- `names`: Single binary name or array of binary names

**Examples:**
```typescript
// Single binary
c.bin('fzf')

// Multiple binaries
c.bin(['git', 'git-lfs', 'git-credential-manager'])

// Tool that provides many binaries
c.bin(['kubectl', 'kubeadm', 'kubelet'])
```

**Important Notes:**
- Each binary name gets a shim in the generated bin directory
- Shims point to the actual installed binary location
- Binary names should match the actual executable names

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
export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('tool')
    .version('latest')
    .install('github-release', { repo: 'owner/tool' })
    .symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
    .zsh({
      completions: { source: 'completions/_tool' },
      aliases: { 't': 'tool' },
      environment: { 'TOOL_HOME': `${ctx.toolDir}` }
    });
};
```

## Next Steps

- [Installation Methods](./installation/README.md) - Learn about different installation options
- [Shell Integration](./shell-integration.md) - Configure shell environments and aliases
- [Context API](./context-api.md) - Use ToolConfigContext for dynamic paths