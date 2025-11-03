---
mode: agent
---
# Tool Configuration Migration Guide

## Overview

This guide provides comprehensive instructions for migrating existing shell-based dotfiles configurations to the new `.tool.ts` system. It covers both the technical migration process and references to detailed documentation for each aspect of the new system.

> **📚 Complete Documentation**: For detailed information about any topic mentioned here, see the [Tool Configuration Guide](../../docs/README.md).

## Migration Process Overview

1. **[Getting Started](../../docs/getting-started.md)** - Understand the basic `.tool.ts` file structure
2. **File Organization** - Set up proper directory structure and naming
3. **[Installation Methods](../../docs/installation/README.md)** - Choose the right installation approach
4. **[Shell Integration](../../docs/shell-integration.md)** - Migrate aliases, functions, and environment variables
5. **[Configuration Files](../../docs/symlinks.md)** - Set up symlinks for dotfiles
6. **[Platform Support](../../docs/platform-support.md)** - Handle cross-platform differences
7. **[Testing](../../docs/testing.md)** - Validate your migration

## File Organization and Naming

### Directory Structure

All tool configurations must be organized in the `configs/` directory with the following structure:

```
configs/
└── tool-name/              # Multi-file configuration directory
    ├── tool-name.tool.ts   # Main configuration file
    ├── config.toml         # Tool-specific configuration files
    ├── themes/             # Tool themes or assets
    └── completions/        # Shell completion files
```

### File Naming Convention

- **Configuration file**: `{tool-name}.tool.ts` (kebab-case)
- **Export requirement**: Must use `export default` with the `defineTool` helper
- **Directory name**: Must match the tool name in kebab-case

### Examples

```
configs/
├── ripgrep/
│   ├── ripgrep.tool.ts     # Main config for ripgrep
│   └── .ripgreprc          # ripgrep configuration file
├── neovim/
│   ├── neovim.tool.ts      # Main config for neovim
│   ├── init.lua            # Neovim configuration
│   └── themes/             # Neovim themes
└── git/
    ├── git.tool.ts         # Main config for git
    ├── .gitconfig          # Global git configuration
    └── .gitignore_global   # Global gitignore
```

## Pattern Syntax

> **📚 Complete Reference**: See [Path Resolution Guide](../../docs/path-resolution.md) for comprehensive pattern documentation.

### Basic Patterns

- **`binary-name`**: Binary directly in archive root
- **`*/binary-name`**: Binary in any subdirectory (default for `c.bin('name')`)
- **`specific-dir/binary-name`**: Binary in specific subdirectory
- **`*/bin/binary-name`**: Binary in bin subdirectory of any parent directory

### Wildcard Support

- **`*`**: Matches any sequence of characters except path separators
- **`tool-*/binary`**: Matches directories like `tool-v1.0.0`, `tool-latest`, etc.
- **`*/bin/*`**: Matches any binary in any bin directory

### Real-World Examples

```typescript
// fzf releases: fzf-0.54.0-darwin_arm64.tar.gz contains fzf-0.54.0/fzf
c.bin('fzf')  // Default pattern handles this automatically

// ripgrep releases: ripgrep-14.1.1-aarch64-apple-darwin.tar.gz contains ripgrep-14.1.1-aarch64-apple-darwin/rg  
c.bin('rg')  // Default pattern handles this automatically

// GitHub CLI: gh_2.40.1_darwin_arm64.tar.gz contains gh_2.40.1_darwin_arm64/bin/gh
c.bin('gh', '*/bin/gh')  // Custom pattern needed for nested bin directory

// Neovim: nvim-macos-arm64.tar.gz contains nvim-macos-arm64/bin/nvim
c.bin('nvim', '*/bin/nvim')  // Custom pattern needed for nested bin directory
```

> **💡 More Examples**: See [Common Patterns](../../docs/common-patterns.md) for additional real-world configuration examples.

## Default Pattern Behavior

When no pattern is specified, `c.bin('name')` automatically uses the flexible pattern `'{,*/}name'`:

```typescript
// These are equivalent:
c.bin('tool')
c.bin('tool', '{,*/}tool')
```

**Pattern Explanation:**
- `{,*/}tool` uses minimatch brace expansion
- Matches `tool` (flat archive extraction)
- Matches `*/tool` (archive with single subdirectory)
- Does NOT match deeply nested paths like `dir/subdir/tool`

This flexible default handles both flat and single-level nested archives, covering ~95% of real-world GitHub releases. For deeper nesting (e.g., `*/bin/tool`), specify a custom pattern.

## Shell-to-TypeScript Migration Patterns

> **📚 Complete Guide**: See [Migration from Shell Scripts](../../docs/migration.md) for detailed shell-to-TypeScript conversion examples.

The new system centralizes all tool-related assets. Instead of copying files with shell commands, you move all related assets (e.g., `config.toml`, fonts, themes) into the same directory as your `.tool.ts` file and then use the `.symlink()` method to link them to their expected locations in your home directory.

**Before (Shell):**
```bash
# In install script
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
cp config.toml ~/.config/tool/
```

**After (TypeScript):**
```typescript
// File: configs/my-tool/my-tool.tool.ts
// Place all assets (e.g., 'config.toml') in configs/my-tool/ directory
import { defineTool } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  c
    .bin('tool')
    .install('github-release', { repo: 'owner/tool' })
    .env('PATH', '$PATH:$HOME/.local/bin')
    .symlink('./config.toml', '~/.config/tool/config.toml')
);
```

### Converting Aliases and Functions

**Before (Shell):**
```bash
alias ll='ls -la'
function mkcd() { mkdir -p "$1" && cd "$1"; }
```

**After (TypeScript):**
```typescript
// File: configs/shell-utils/shell-utils.tool.ts
import { defineTool } from '@dotfiles/schemas';

export default defineTool((c, ctx) =>
  c.zsh({
    aliases: {
      ll: 'ls -la',
    },
    shellInit: [
      always/* zsh */`
        function mkcd() { mkdir -p "$1" && cd "$1"; }
      `,
    ],
  })
);
```

## Troubleshooting Migration Issues

> **📚 Complete Troubleshooting**: See [Troubleshooting Guide](../../docs/troubleshooting.md) for comprehensive problem-solving information.

### Binary Not Found After Installation

If you see "Installation completed but binary not found", check:

1. **Pattern Accuracy**: Verify the pattern matches the actual archive structure
2. **Archive Structure**: Download and inspect the actual GitHub release archive
3. **Case Sensitivity**: Ensure binary names match exactly (including case)

### Pattern Debugging

To debug pattern matching:
1. Download the actual release archive
2. Extract it manually to see the directory structure
3. Adjust the pattern to match the actual structure

### Example Debugging Process

```bash
# Download actual release
curl -L https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz -o rg.tar.gz

# Extract and inspect
tar -tzf rg.tar.gz | head -10

# Output shows: ripgrep-14.1.1-x86_64-unknown-linux-musl/rg
# So pattern should be: 'ripgrep-*/rg'
```

## Complete Migration Checklist

### Pre-Migration Planning
- [ ] Read [Getting Started Guide](../../docs/getting-started.md)
- [ ] Review [Installation Methods](../../docs/installation/README.md) to choose appropriate installation type
- [ ] Understand [Platform Support](../../docs/platform-support.md) requirements
- [ ] Set up proper directory structure in `configs/` directory

### For Each Tool Configuration

#### File Structure Setup
- [ ] Create tool directory in `configs/{tool-name}/`
- [ ] Create main configuration file `configs/{tool-name}/{tool-name}.tool.ts`
- [ ] Move all related tool assets to the tool directory

#### Shell Integration Migration
See [Shell Integration Guide](../../docs/shell-integration.md)

- [ ] Convert aliases 
- [ ] Convert functions 
- [ ] Convert environment variables 
- [ ] Set up completions

#### Configuration Files
- [ ] Move all related tool assets (configs, fonts, themes, binaries, etc.) to the tool directory (`configs/{tool-name}/`) preserving their original file layout
- [ ] Set up symlinks using [Symlinks Guide](../../docs/symlinks.md)
- [ ] Configure platform-specific paths using [Platform Support](../../docs/platform-support.md)

#### Advanced Features (if needed)
- [ ] Add installation hooks using [Hooks Guide](../../docs/hooks.md)
- [ ] Implement custom logic using [Advanced Topics](../../docs/advanced-topics.md)

#### Testing and Validation
- [ ] Test the migrated configuration using [Testing Guide](../../docs/testing.md)
- [ ] Verify symlinks are created correctly
- [ ] Confirm tool functionality is preserved
- [ ] Test on all target platforms
- [ ] Validate shell integration works correctly

### Post-Migration
- [ ] Remove old shell scripts and configuration files
- [ ] Update documentation
- [ ] Test complete system integration

## Additional Resources

- **[API Reference](../../docs/api-reference.md)** - Complete method documentation
- **[Configuration Examples](../../docs/examples.md)** - Real-world configuration examples
- **[Common Patterns](../../docs/common-patterns.md)** - Frequently used patterns
- **[Advanced Topics](../../docs/advanced-topics.md)** - Complex configuration scenarios
- **[Troubleshooting](../../docs/troubleshooting.md)** - Problem-solving guide

> **💡 Pro Tip**: Start with simple tools first to get familiar with the system, then migrate more complex configurations. Use the [Testing Guide](../../docs/testing.md) to validate each migration step.