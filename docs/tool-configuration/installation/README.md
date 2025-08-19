# Installation Methods

The system supports multiple installation methods to accommodate different tool distribution patterns. Each method has its own parameters and use cases.

## Available Methods

### [GitHub Release](./github-release.md)
Install tools from GitHub releases with automatic asset selection and extraction.

```typescript
c.install('github-release', {
  repo: 'owner/repository',
  assetPattern: '*linux_amd64.tar.gz',
})
```

### [Homebrew](./homebrew.md)
Install tools using Homebrew package manager (macOS and Linux).

```typescript
c.install('brew', {
  formula: 'ripgrep',
})
```

### [Cargo](./cargo.md)
Install Rust tools from crates.io with cargo-quickinstall for faster downloads.

```typescript
c.install('cargo', {
  crateName: 'ripgrep',
})
```

### [Curl Script](./curl-script.md)
Download and execute installation scripts.

```typescript
c.install('curl-script', {
  url: 'https://bun.sh/install',
  shell: 'bash',
})
```

### [Curl Tar](./curl-tar.md)
Download and extract tarballs directly from URLs.

```typescript
c.install('curl-tar', {
  url: 'https://releases.example.com/tool-v1.0.0.tar.gz',
})
```

### [Manual](./manual.md)
Configure tools that are already installed or managed externally.

```typescript
c.install('manual', {
  binaryPath: '/usr/local/bin/tool',
})
```

## Choosing the Right Method

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **GitHub Release** | Most open source tools | Automatic updates, cross-platform | Requires GitHub hosting |
| **Homebrew** | macOS/Linux tools | Simple, well-maintained | Platform-specific, requires Homebrew |
| **Cargo** | Rust tools | Fast pre-compiled binaries | Rust tools only |
| **Curl Script** | Custom installers | Flexible, handles complex setups | Less predictable, security concerns |
| **Curl Tar** | Direct downloads | Simple, no dependencies | Manual URL management |
| **Manual** | System tools, custom builds | Works with any tool | No automatic updates |

## Common Parameters

Most installation methods support these common concepts:

- **Version Selection**: Specify exact versions or use constraints
- **Platform Detection**: Automatic selection of appropriate binaries
- **Binary Path**: Specify which file is the main executable
- **Asset Selection**: Choose the right download for your platform

## Next Steps

Choose an installation method to learn more:

- [GitHub Release](./github-release.md) - Most common method for open source tools
- [Homebrew](./homebrew.md) - Simple package manager installation
- [Cargo](./cargo.md) - Fast Rust tool installation