# Tool Configuration Guide

> **👉 Please visit the new [Tool Configuration Guide](./tool-configuration/README.md) for the complete documentation.**

## Quick Links

- **[Getting Started](./tool-configuration/getting-started.md)** - Basic configuration structure
- **[Installation Methods](./tool-configuration/installation/README.md)** - GitHub, Homebrew, Cargo, and more
- **[Shell Integration](./tool-configuration/shell-integration.md)** - Aliases, environment, and functions
- **[Common Patterns](./tool-configuration/common-patterns.md)** - Real-world examples
- **[Troubleshooting](./tool-configuration/troubleshooting.md)** - Common issues and solutions

### Core Concepts
- [Overview](./tool-configuration/overview.md) - Introduction and benefits
- [Getting Started](./tool-configuration/getting-started.md) - Basic configuration anatomy
- [Core Methods](./tool-configuration/core-methods.md) - Essential methods reference
- [Context API](./tool-configuration/context-api.md) - Using ToolConfigContext

### Installation Methods
- [GitHub Releases](./tool-configuration/installation/github-release.md) - Most common method
- [Homebrew](./tool-configuration/installation/homebrew.md) - Package manager installation
- [Cargo](./tool-configuration/installation/cargo.md) - Rust tools from crates.io
- [Manual](./tool-configuration/installation/manual.md) - Existing tools
- [Curl Scripts](./tool-configuration/installation/curl-script.md) - Installation scripts

### Configuration Features
- [Shell Integration](./tool-configuration/shell-integration.md) - Environment and aliases
- [Common Patterns](./tool-configuration/common-patterns.md) - Real-world examples
- [Troubleshooting](./tool-configuration/troubleshooting.md) - Solutions to common issues

### Network Host Configuration (New)

Service hosts (GitHub API, Cargo registry/raw/release sources) now use a unified schema:

```yaml
github:
	host: https://api.github.com
	token: ""
	userAgent: dotfiles-generator
	cache: { enabled: true, ttl: 86400000 }
cargo:
	cratesIo: { host: https://crates.io, cache: { enabled: true, ttl: 86400000 } }
	githubRaw: { host: https://raw.githubusercontent.com, cache: { enabled: true, ttl: 86400000 } }
	githubRelease: { host: https://github.com, cache: { enabled: true, ttl: 86400000 } }
	userAgent: dotfiles-generator
```

Each host has independent cache controls. See Migration Guide for conversion details.
