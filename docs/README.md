# Tool Configuration Guide

This guide covers everything you need to know about creating `.tool.ts` configuration files. These files define how CLI tools are installed, configured, and integrated into your development environment.

## Overview

The `.tool.ts` configuration files replace traditional shell-based tool management (like those using zinit) with a strongly-typed, programmatic approach using TypeScript. Each tool gets its own configuration file that defines:

- How to install the tool (from GitHub releases, Homebrew, scripts, etc.)
- Which binaries to make available system-wide
- Shell integration (aliases, functions, environment variables)
- Configuration files to symlink
- Command completions to install
- Platform-specific overrides

### Benefits Over Shell-Based Approaches

- **Type Safety**: TypeScript ensures configuration correctness at build time
- **Consistency**: Standardized API across all tools
- **Platform Support**: Built-in support for different OS/architecture combinations
- **Performance**: Faster tool access without shell startup overhead
- **Maintainability**: Clear structure and validation
- **Robust Error Handling**: Structured error reporting with Zod schema validation for configuration files
- **Reliable Parsing**: Uses proper parsers (e.g., smol-toml for Cargo.toml) instead of fragile regex patterns

### File Structure and Location

#### Directory Organization

```
configs/
└── tool-name/              # Multi-file configuration
    ├── tool-name.tool.ts   # Main configuration
    └── config.toml         # Tool specific files just as config, themes, etc
```

#### File Naming Convention

- **File name**: `{tool-name}.tool.ts` (kebab-case)
- **Export**: Must use `export default` with an async function

## Quick Start

- [Getting Started](./getting-started.md) - Basic configuration anatomy and file structure
- [Core Methods](./core-methods.md) - Essential methods for tool configuration

## Installation Methods

- [Installation Overview](./installation/README.md) - Available installation methods
- [GitHub Releases](./installation/github-release.md) - Installing from GitHub releases
- [Homebrew](./installation/homebrew.md) - Installing via Homebrew
- [Cargo](./installation/cargo.md) - Installing Rust tools from crates.io
- [Curl Scripts](./installation/curl-script.md) - Installing via download scripts
- [Manual Installation](./installation/manual.md) - Configuring existing tools

## Configuration Features

- [Shell Integration](./shell-integration.md) - Configuring shell environments, aliases, and functions
- [Completions](./completions.md) - Setting up command completions
- [Symbolic Links](./symlinks.md) - Managing configuration file symlinks
- [Platform Support](./platform-support.md) - Cross-platform configuration
- [Hooks](./hooks.md) - Advanced customization with installation hooks

## Advanced Topics

- [Path Resolution](./path-resolution.md) - Understanding how paths work in configurations
- [Context API](./context-api.md) - Using ToolConfigContext for dynamic paths
- [TypeScript Requirements](./typescript.md) - Type safety and requirements
- [Advanced Topics](./advanced-topics.md) - Complex patterns and techniques
- [Common Patterns](./common-patterns.md) - Examples and best practices

## Migration and Troubleshooting

- [Migration Guide](./migration.md) - Converting from shell-based configurations
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Testing](./testing.md) - Validation and testing approaches

## Reference

- [API Reference](./api-reference.md) - Complete method reference
- [Examples](./examples.md) - Real-world configuration examples