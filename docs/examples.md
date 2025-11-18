# Configuration Examples

This directory contains real-world examples of `.tool.ts` configurations for various tools.

## Available Examples

### Simple Tools
- **ripgrep** - Basic GitHub release installation
- **fzf** - Tool with shell integration and key bindings
- **bat** - Tool with themes and configuration files

### Complex Tools
- **git** - Manual installation with extensive aliases
- **nvim** - Tool with plugins and complex configuration
- **docker** - Multi-platform installation with different methods
- **Dependency graphs** - Sample configs that showcase `.dependsOn()` relationships

### Cross-Platform Tools
- **node** - Different installation methods per platform
- **python** - Version management and virtual environments

## Example Categories

### By Installation Method
- **GitHub Release**: ripgrep, fzf, bat, eza
- **Homebrew**: git, node (macOS)
- **Cargo**: ripgrep, eza, fd
- **Manual**: custom scripts, pre-built binaries, configuration-only tools

### By Complexity
- **Basic**: Single binary, minimal configuration
- **Intermediate**: Shell integration, completions
- **Advanced**: Hooks, platform-specific, complex shell functions

### By Use Case
- **Development Tools**: git, docker, node
- **System Utilities**: ripgrep, fzf, bat
- **Text Editors**: nvim, emacs
- **Shell Enhancements**: zsh plugins, prompt themes
- **Shared Binaries**: configurations demonstrating providers/consumers with `.dependsOn()`

## Usage

Each example includes:
- Complete `.tool.ts` configuration
- Explanation of key features
- Platform-specific considerations
- Common customizations

## Contributing Examples

When adding new examples:
1. Use real-world tools that others might want to configure
2. Include comprehensive comments explaining the configuration
3. Show both basic and advanced usage patterns
4. Test on multiple platforms when applicable
5. Follow the established naming conventions

## Next Steps

- [Common Patterns](../common-patterns.md) - Learn configuration patterns
- [Getting Started](../getting-started.md) - Understand the basics
- [API Reference](../api-reference.md) - Complete method reference