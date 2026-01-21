# Troubleshooting

## Enable Debug Logging

```bash
dotfiles install tool-name --trace --log=verbose
```

## Common Issues

### Tool Not Found After Installation

1. Verify `.bin()` is called with correct binary names
2. Check shim exists: `ls -la ~/.generated/usr-local-bin/tool-name`
3. Ensure PATH includes generated bin directory

### Installation Fails

1. Check asset patterns match actual GitHub release assets
2. Verify repository name is correct
3. Use `--trace --log=verbose` to see detailed error messages

### Infinite Recursion Error

**Message**: "Recursive installation detected for [TOOL]. Aborting..."

The installer has built-in recursion guards. If you see this, check that your installation scripts don't call the tool being installed via its shim.

### Dependency Errors

**Messages**: "Missing dependency", "Ambiguous dependency", "Circular dependency"

- Ensure every `.dependsOn()` references a binary from `.bin()` in exactly one tool
- Verify providers include active platform/architecture for platform-specific configs

### Shell Integration Not Working

1. Source shell scripts: `source ~/.generated/shell-scripts/main.zsh`
2. Check for syntax errors: `zsh -n ~/.generated/shell-scripts/main.zsh`
3. Use declarative `.environment()` instead of inline exports

### Completions Not Loading

1. Check completion file exists in extracted archive
2. Reload completions: `autoload -U compinit && compinit`
3. Verify shell completion path is correct

### Hook Not Executing

```typescript
.hook('after-install', async ({ log, $ }) => {
  try {
    await $`./setup.sh`;
  } catch (error) {
    log.error('Setup failed');
    throw error;
  }
})
```

- `$` uses tool directory as cwd
- Always await `$` commands
- Handle errors with try/catch

## Testing & Verification

### Type Checking

```bash
bun typecheck
```

### Installation Commands

```bash
dotfiles install tool-name           # Install by tool name
dotfiles install binary-name         # Install by binary name
dotfiles install tool-name --force   # Force reinstall
dotfiles install tool-name --trace --log=verbose  # Debug logging
dotfiles files tool-name             # List generated files
dotfiles check-updates               # Check all for updates
```

### Verification Steps

1. **Binary works**: `tool-name --version`
2. **Shim created**: `ls -la ~/.generated/usr-local-bin/tool-name`
3. **Shell integration**: Source shell scripts and test aliases/environment

## Next Steps

- [Common Patterns](./common-patterns.md) - Working examples
