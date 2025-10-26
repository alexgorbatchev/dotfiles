# No-Install Configuration

The `no-install` method is used for configuration-only tools that don't require any binary installation. This method completely skips the binary installation phase and focuses purely on shell configuration, symlinks, and environment setup.

## When to Use `no-install`

Use the `no-install` method when you want to:

- Create configuration-only tools (shell aliases, environment variables, symlinks)
- Set up shell initialization scripts without binary management
- Manage dotfiles that only provide shell enhancements
- Create tools that rely entirely on external binaries already available in PATH

**Important:** This method does NOT create shims or manage binaries. It's purely for configuration management.

## Configuration

The `no-install` method does not take any parameters and skips binary installation entirely.

```typescript
export default defineTool((c, ctx) =>
  c
    .install('no-install')  // No parameters needed
    .zsh({
      aliases: {
        'ls': 'ls --color=auto',
        'll': 'ls -alF',
      },
      environment: {
        'EDITOR': 'nvim'
      }
    })
    .symlink('./gitconfig', `${ctx.homeDir}/.gitconfig`)
);
```

## Examples

### Shell Enhancement Tool
```typescript
export default defineTool((c, ctx) =>
  c
    .install('no-install')
    .zsh({
      shellInit: [
        always`# Custom shell functions`,
        always`function mkcd() { mkdir -p "$1" && cd "$1"; }`,
      ],
      aliases: {
        'mkcd': 'mkcd',
      }
    })
);
```

### Environment Configuration
```typescript
export default defineTool((c, ctx) =>
  c
    .install('no-install')
    .zsh({
      environment: {
        'HOMEBREW_NO_ANALYTICS': '1',
        'HOMEBREW_NO_AUTO_UPDATE': '1',
      }
    })
);
```

## Important Notes

- **No Binary Management**: This method does not install, manage, or create shims for binaries
- **Configuration Only**: Focuses purely on shell scripts, aliases, environment variables, and symlinks
- **External Dependencies**: Any binary dependencies must be managed outside the dotfiles system
- **No Shims Created**: Tools using this method won't have executable shims generated

## Comparison with Manual Installation

Use `no-install` when you want **configuration only** without any binary management.

Use `manual` when you want to **install files from your dotfiles directory** (scripts, binaries, etc.) and have them managed by the system.

| Feature | No-Install | Manual |
|---------|------------|--------|
| Binary Installation | ❌ None | ✅ From dotfiles directory |
| Shim Generation | ❌ No | ✅ Yes |
| Shell Configuration | ✅ Yes | ✅ Yes |
| Symlinks | ✅ Yes | ✅ Yes |
| File Management | ❌ No | ✅ Versioned storage |
| Use Case | Pure configuration | Custom scripts/binaries |
