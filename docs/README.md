# @gitea/dotfiles Documentation

Declarative, versioned, and automated dotfiles management for developers.

## What is @gitea/dotfiles?

A modern command-line tool for automated management of developer dotfiles, tool installations, and shell configurations across different systems. Define your tools in TypeScript, and the system handles installation, shell integration, and cross-platform support automatically.

## Quick Example

```typescript
// tools/ripgrep.tool.ts
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'BurntSushi/ripgrep',
  })
    .bin('rg')
    .symlink('./ripgreprc', '~/.ripgreprc')
    .zsh((shell) =>
      shell
        .path((ctx) => `${ctx.installDir}/bin`)
        .env({ RIPGREP_CONFIG_PATH: '~/.ripgreprc' })
        .aliases({ rgi: 'rg -i' })
    )
);
```

## Documentation

### Getting Started

- [Getting Started](./getting-started.md) - Basic configuration anatomy
- [Project Configuration](./config.md) - Setting up your main config file

### Installation Methods

- [Installation Overview](./installation/README.md) - Available installation methods
- [GitHub Releases](./installation/github-release.md) - Installing from GitHub releases
- [Homebrew](./installation/homebrew.md) - Installing via Homebrew
- [Cargo](./installation/cargo.md) - Installing Rust tools from crates.io
- [Curl Scripts](./installation/curl-script.md) - Installing via download scripts
- [Curl Tar](./installation/curl-tar.md) - Installing from tarball URLs
- [Manual Installation](./installation/manual.md) - Configuring pre-installed tools

### Configuration Features

- [Shell Integration](./shell-integration.md) - Aliases, functions, environment variables, and symlinks
- [Completions](./completions.md) - Setting up command completions
- [Platform Support](./platform-support.md) - Cross-platform configuration

### Advanced Topics

- [Virtual Environments](./virtual-environments.md) - Project-specific isolated configurations
- [Context API](./context-api.md) - Dynamic paths with ToolConfigContext
- [Hooks](./hooks.md) - Advanced customization with installation hooks
- [Common Patterns](./common-patterns.md) - Examples and best practices

### Reference

- [API Reference](./api-reference.md) - Complete method reference
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
