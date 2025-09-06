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
  binarySource?: 'cargo-quickinstall' | 'github-releases', // Optional
  githubRepo?: 'owner/repository',          // Optional
  assetPattern?: 'pattern-with-placeholders', // Optional
  versionSource?: 'cargo-toml' | 'crates-io' | 'github-releases', // Optional
  cargoTomlUrl?: 'https://raw.githubusercontent.com/...', // Optional
  customBinaries?: ['binary1', 'binary2'],  // Optional
  allowSourceFallback?: boolean,            // Optional
})
```

### Parameters

- **`crateName`** (required): Name of the Rust crate to install
- **`binarySource`**: Source for downloading pre-compiled binaries
  - `'cargo-quickinstall'`: Downloads from cargo-quickinstall for faster installation (default)
  - `'github-releases'`: Downloads from GitHub releases
- **`githubRepo`**: GitHub repository in "owner/repo" format (required for some version sources)
- **`assetPattern`**: Pattern for selecting GitHub release assets with placeholders:
  - `{version}`: Replaced with the determined version
  - `{platform}`: Replaced with the current platform
  - `{arch}`: Replaced with the current architecture
  - `{crateName}`: Replaced with the crate name
- **`versionSource`**: How to determine the latest version
  - `'cargo-toml'`: Parse version from the project's Cargo.toml file (default)
  - `'crates-io'`: Query crates.io API for the latest version
  - `'github-releases'`: Use GitHub releases API
- **`cargoTomlUrl`**: Custom URL to the Cargo.toml file (optional, auto-generated if not provided)
- **`customBinaries`**: Array of custom binary names if different from crate name
- **`allowSourceFallback`**: Whether to fallback to source compilation if binary not available

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

### Using GitHub Releases as Binary Source

```typescript
c.install('cargo', {
  crateName: 'bat',
  binarySource: 'github-releases',
  githubRepo: 'sharkdp/bat',
  assetPattern: 'bat-v{version}-{arch}-{platform}.tar.gz',
})
```

### Custom Binary Names

```typescript
c.install('cargo', {
  crateName: 'fd-find',
  customBinaries: ['fd'],  // Binary is named 'fd' but crate is 'fd-find'
})
```

### With Source Fallback

```typescript
c.install('cargo', {
  crateName: 'custom-tool',
  allowSourceFallback: true,  // Compile from source if binary not available
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

The cargo installer uses a dedicated `CargoClient` with robust TOML parsing and Zod schema validation to extract version information from multiple sources. This ensures reliable version detection and provides clear error messages if the TOML structure is invalid.

### Version Sources

- **`cargo-toml`**: Parses version from the project's Cargo.toml file (most reliable)
- **`crates-io`**: Queries crates.io API for the latest published version
- **`github-releases`**: Uses GitHub releases API for version information

## Binary Sources

The installer supports multiple binary sources:

- **`cargo-quickinstall`**: Pre-compiled binaries for faster installation (default)
- **`github-releases`**: Downloads from GitHub release assets with custom patterns

## Platform Support

The cargo installer automatically maps system architectures to Rust target triples:
- `darwin` + `arm64` → `aarch64-apple-darwin`
- `darwin` + `x64` → `x86_64-apple-darwin`  
- `linux` + `x64` → `x86_64-unknown-linux-gnu`
- `linux` + `arm64` → `aarch64-unknown-linux-gnu`

## Advantages

- **Fast Installation**: Uses pre-compiled binaries from cargo-quickinstall or GitHub releases
- **Reliable Parsing**: Dedicated CargoClient with proper TOML parsing instead of regex
- **Version Flexibility**: Multiple sources for version detection (Cargo.toml, crates.io, GitHub)
- **Cross-Platform**: Automatic target triple mapping for Rust platforms
- **Flexible Binary Sources**: Support for both cargo-quickinstall and GitHub releases
- **Custom Binary Handling**: Support for crates with non-standard binary names
- **Asset Pattern Matching**: Flexible pattern matching for GitHub release assets

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