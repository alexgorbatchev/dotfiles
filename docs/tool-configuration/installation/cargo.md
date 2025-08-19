# Cargo Installation

The `cargo` method installs Rust tools from crates.io or GitHub repositories using cargo-quickinstall for faster binary downloads.

## Basic Usage

```typescript
c.install('cargo', {
  crateName: 'ripgrep',
})
```

## Parameters

```typescript
c.install('cargo', {
  crateName: 'tool-name',                    // Required
  binarySource?: 'cargo-quickinstall',      // Optional
  versionSource?: 'cargo-toml' | 'crates-io' | 'github-releases', // Optional
  githubRepo?: 'owner/repository',          // Optional
  cargoTomlUrl?: 'https://raw.githubusercontent.com/...', // Optional
})
```

### Parameters

- **`crateName`** (required): Name of the Rust crate to install
- **`binarySource`**: Source for downloading pre-compiled binaries
  - `'cargo-quickinstall'`: Downloads from cargo-quickinstall for faster installation (default)
- **`versionSource`**: How to determine the latest version
  - `'cargo-toml'`: Parse version from the project's Cargo.toml file (default)
  - `'crates-io'`: Query crates.io API for the latest version
  - `'github-releases'`: Use GitHub releases API
- **`githubRepo`**: GitHub repository in "owner/repo" format (required for some version sources)
- **`cargoTomlUrl`**: Custom URL to the Cargo.toml file (optional, auto-generated if not provided)

## Examples

### Simple Cargo Installation

```typescript
c.install('cargo', {
  crateName: 'ripgrep',
})
```

### With Custom GitHub Repository

```typescript
c.install('cargo', {
  crateName: 'eza',
  githubRepo: 'eza-community/eza',
})
```

### Using crates.io for Version Detection

```typescript
c.install('cargo', {
  crateName: 'fd-find',
  versionSource: 'crates-io',
})
```

### Custom Cargo.toml URL

```typescript
c.install('cargo', {
  crateName: 'custom-tool',
  githubRepo: 'user/custom-tool',
  cargoTomlUrl: 'https://raw.githubusercontent.com/user/custom-tool/main/Cargo.toml',
})
```

## Version Resolution

The cargo installer uses robust TOML parsing with Zod schema validation to extract version information from Cargo.toml files. This ensures reliable version detection and provides clear error messages if the TOML structure is invalid.

## Platform Support

The cargo installer automatically maps system architectures to Rust target triples:
- `darwin` + `arm64` → `aarch64-apple-darwin`
- `darwin` + `x64` → `x86_64-apple-darwin`  
- `linux` + `x64` → `x86_64-unknown-linux-gnu`
- `linux` + `arm64` → `aarch64-unknown-linux-gnu`

## Advantages

- **Fast Installation**: Uses pre-compiled binaries from cargo-quickinstall
- **Reliable Parsing**: Proper TOML parsing instead of regex
- **Version Flexibility**: Multiple sources for version detection
- **Cross-Platform**: Automatic target triple mapping

## When to Use Cargo

**Best for:**
- Rust command-line tools
- Tools available on crates.io
- When you want fast installation without compilation

**Consider alternatives when:**
- Tool is not written in Rust
- Pre-compiled binaries are not available
- You need the absolute latest version immediately

## Next Steps

- [GitHub Release Installation](./github-release.md) - Alternative for non-Rust tools
- [Manual Installation](./manual.md) - For tools you compile yourself
- [Shell Integration](../shell-integration.md) - Configure shell environment