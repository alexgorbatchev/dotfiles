# Migration Guide

This guide helps you convert existing shell-based tool configurations to the new `.tool.ts` format.

## Overview

The migration process involves converting shell-based configurations (like those using zinit) to TypeScript-based configurations that provide better type safety, cross-platform support, and maintainability.

## Converting from Zinit

### Common Zinit Patterns

| Zinit Pattern | ToolConfigBuilder Equivalent |
|---------------|------------------------------|
| `zinit ice from"gh-r"` | `.install('github-release', { repo: 'owner/repo' })` |
| `zinit load owner/repo` | `repo: 'owner/repo'` in install params |
| `mv="*/binary -> binary"` | Not needed - binary stays in extracted location |
| `pick"path/to/binary"` | `binaryPath: 'path/to/binary'` |
| `completions="path.zsh"` | `.zsh((shell) => shell.completions('path.zsh'))` |
| `atclone"make install"` | Use `hooks.afterExtract` or `hooks.afterInstall` |

### Example Zinit to ToolConfig Migration

**Before (Zinit):**
```bash
zinit ice from"gh-r" as"program" mv"ripgrep*/rg -> rg" pick"rg"
zinit load BurntSushi/ripgrep

zinit ice from"gh-r" as"program" mv"fzf*/fzf -> fzf" pick"fzf"
zinit load junegunn/fzf
```

**After (ToolConfig):**
```typescript
// ripgrep.tool.ts
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('rg')
    .version('latest')
    .install('github-release', {
      repo: 'BurntSushi/ripgrep',
    });
};

// fzf.tool.ts
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('fzf')
    .version('latest')
    .install('github-release', {
      repo: 'junegunn/fzf',
    });
};
```

## Migration Process

### Step 1: Create Tool Directory

```bash
mkdir configs/tool-name/
```

### Step 2: Copy Configuration Files

Copy non-script files from your old configuration:

```bash
# Copy configuration files
cp ~/.config/tool/config.toml configs/tool-name/
cp -r ~/.config/tool/themes/ configs/tool-name/themes/
```

### Step 3: Create .tool.ts File

Create the main configuration file:

```typescript
// configs/tool-name/tool-name.tool.ts
import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  // Configuration will go here
};
```

### Step 4: Map Installation Method

Convert your installation method:

**Zinit GitHub Release:**
```bash
zinit ice from"gh-r" as"program"
zinit load owner/repo
```

**ToolConfig Equivalent:**
```typescript
c.install('github-release', {
  repo: 'owner/repo'
})
```

**Homebrew:**
```bash
brew install tool-name
```

**ToolConfig Equivalent:**
```typescript
c.install('brew', {
  formula: 'tool-name'
})
```

### Step 5: Convert Shell Initialization

Move shell initialization from separate files to the `.zsh()` method:

**Before (init.zsh):**
```bash
export TOOL_CONFIG_DIR="$HOME/.config/tool"
export TOOL_DEBUG="true"

alias t="tool"
alias tl="tool list"

function tool-helper() {
  tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
}
```

**After (in .tool.ts):**
```typescript
c.zsh((shell) =>
  shell
    .environment({
      TOOL_CONFIG_DIR: `${ctx.homeDir}/.config/tool`,
      TOOL_DEBUG: 'true'
    })
    .aliases({
      t: 'tool',
      tl: 'tool list'
    })
    .always(/* zsh */`
      function tool-helper() {
        tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
      }
    `)
)
```

### Step 6: Replace Hardcoded Paths

Replace hardcoded paths with context variables:

| Old Path | New Path |
|----------|----------|
| `$HOME` or `~/` | `${ctx.homeDir}` |
| `$DOTFILES` | `${ctx.dotfilesDir}` |
| Tool-specific dirs | `${ctx.toolDir}` |
| Generated content | `${ctx.generatedDir}` |

**Before:**
```bash
export TOOL_HOME="$HOME/.local/share/tool"
source "$DOTFILES/.config/tool/init.zsh"
```

**After:**
```typescript
c.zsh((shell) =>
  shell
    .environment({
      TOOL_HOME: `${ctx.homeDir}/.local/share/tool`
    })
    .always(/* zsh */`
      if [[ -f "${ctx.toolDir}/init.zsh" ]]; then
        source "${ctx.toolDir}/init.zsh"
      fi
    `)
)
```

### Step 7: Add Symbolic Links

Convert file copying to symbolic links:

**Before:**
```bash
ln -sf ${ctx.dotfilesDir}/configs/tool/config.toml ~/.config/tool/config.toml
```

**After:**
```typescript
c.symlink('./config.toml', `${ctx.homeDir}/.config/tool/config.toml`)
```

### Step 8: Add Completions

Convert completion setup:

**Before:**
```bash
# In init.zsh
fpath=(${ctx.dotfilesDir}/completions $fpath)
autoload -U compinit && compinit
```

**After:**
```typescript
c.zsh((shell) => shell.completions('completions/_tool'))
```

### Step 9: Test Migration

Test the migrated configuration:

```bash
# Install the migrated tool
dotfiles install tool-name

# Generate configurations
dotfiles generate

# Test functionality
tool-name --version
```

## Converting Shell Scripts to Declarative Configuration

### Identify Declarative vs Script Content

**Extract to Declarative Configuration:**
- Simple environment variable exports
- Basic command aliases
- Static configuration values

**Keep in Shell Scripts:**
- Complex functions
- Conditional logic
- Dynamic path construction
- Integration with other tools

### Example Migration

**Before (Shell-based):**
```bash
# In old init.zsh file
export TOOL_CONFIG_DIR="$HOME/.config/tool"
export TOOL_DEBUG="true"
export TOOL_MODE="production"

alias t="tool"
alias tl="tool list"
alias ts="tool status --verbose"
alias tc="tool config edit"

# Complex function
function tool-helper() {
  tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
}

# Conditional setup
if [[ -f "$HOME/.tool-extra" ]]; then
  source "$HOME/.tool-extra"
fi
```

**After (Declarative + Script hybrid):**
```typescript
c.zsh((shell) =>
  shell
    // Extract simple environment variables to declarative config
    .environment({
      TOOL_CONFIG_DIR: `${ctx.homeDir}/.config/tool`,
      TOOL_DEBUG: 'true',
      TOOL_MODE: 'production'
    })
    
    // Extract simple aliases to declarative config  
    .aliases({
      t: 'tool',
      tl: 'tool list', 
      ts: 'tool status --verbose',
      tc: 'tool config edit'
    })
    
    .always(/* zsh */`
      # Keep complex functions in scripts
      function tool-helper() {
        tool --config "$TOOL_CONFIG_DIR/config.toml" "$@"
      }
      
      # Keep conditional logic in scripts
      if [[ -f "${ctx.homeDir}/.tool-extra" ]]; then
        source "${ctx.homeDir}/.tool-extra"
      fi
    `)
)
```

## Benefits of Migration

### Cleaner Code
- Environment variables and aliases are clearly separated from complex logic
- Structured configuration is easier to read and maintain
- Type safety prevents configuration errors

### Cross-Shell Support
- Same declarations work for zsh, bash, and powershell
- No need to maintain separate configurations for different shells
- Automatic shell-specific syntax generation

### Performance
- Declarative configs generate optimal shell syntax
- No runtime evaluation of simple configurations
- Faster shell startup times

### Maintainability
- Easy to see all environment variables and aliases at a glance
- Type safety and validation prevent errors
- Consistent structure across all tools

## Migration Checklist

### Pre-Migration
- [ ] Identify all shell-based configurations
- [ ] Document current functionality
- [ ] Test current setup to establish baseline

### During Migration
- [ ] Create tool directory structure
- [ ] Copy configuration files
- [ ] Create `.tool.ts` file with correct signature
- [ ] Map installation method
- [ ] Convert shell initialization
- [ ] Extract declarative configurations
- [ ] Replace hardcoded paths with context variables
- [ ] Add symbolic links for config files
- [ ] Add completions if available

### Post-Migration
- [ ] Test installation process
- [ ] Verify binary access
- [ ] Test shell integration (aliases, functions, environment)
- [ ] Test on target platforms
- [ ] Update documentation
- [ ] Remove old configuration files

## Common Migration Patterns

### Environment Variables

**Before:**
```bash
export EDITOR="nvim"
export PAGER="less -R"
```

**After:**
```typescript
c.zsh((shell) =>
  shell.environment({
    EDITOR: 'nvim',
    PAGER: 'less -R'
  })
)
```

### Aliases

**Before:**
```bash
alias ll="ls -la"
alias la="ls -A"
alias l="ls -CF"
```

**After:**
```typescript
c.zsh((shell) =>
  shell.aliases({
    ll: 'ls -la',
    la: 'ls -A',
    l: 'ls -CF'
  })
)
```

### Complex Functions

**Before:**
```bash
function git-branch-clean() {
  git branch --merged | grep -v "\*\|main\|master" | xargs -n 1 git branch -d
}
```

**After:**
```typescript
c.zsh((shell) =>
  shell.always(/* zsh */`
    function git-branch-clean() {
      git branch --merged | grep -v "\\*\\|main\\|master" | xargs -n 1 git branch -d
    }
  `)
)
```

### Conditional Logic

**Before:**
```bash
if command -v fzf >/dev/null 2>&1; then
  export FZF_DEFAULT_COMMAND='rg --files'
fi
```

**After:**
```typescript
c.zsh((shell) =>
  shell.always(/* zsh */`
    if command -v fzf >/dev/null 2>&1; then
      export FZF_DEFAULT_COMMAND='rg --files'
    fi
  `)
)
```

## Troubleshooting Migration Issues

### Type Errors
- Check import statements
- Verify function signature
- Ensure all required parameters are provided

### Installation Failures
- Verify repository names and URLs
- Check asset patterns for GitHub releases
- Test installation methods individually

### Shell Integration Problems
- Check path resolution
- Verify context variable usage
- Test shell script syntax

### Path Resolution Issues
- Use context variables instead of hardcoded paths
- Check relative vs absolute path requirements
- Verify file existence

## Next Steps

After successful migration:

1. **Test thoroughly** on all target platforms
2. **Update documentation** to reflect new structure
3. **Remove old configurations** to avoid conflicts
4. **Share learnings** with team members
5. **Consider automating** similar migrations

## Resources

- [Getting Started](./getting-started.md) - Basic configuration structure
- [Shell Integration](./shell-integration.md) - Detailed shell configuration
- [Path Resolution](./path-resolution.md) - Understanding path handling
- [Testing](./testing.md) - Validation and testing approaches