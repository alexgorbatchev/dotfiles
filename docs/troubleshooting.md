# Troubleshooting

## Enable Debug Logging

```bash
dotfiles install tool-name --log=trace
```

## Common Issues

### Tool Not Found After Installation

1. Verify `.bin()` is called with correct binary names
2. Check shim exists: `ls -la ~/.generated/usr-local-bin/tool-name`
3. Ensure PATH includes generated bin directory

### Installation Fails

1. Check asset patterns match actual GitHub release assets
2. Verify repository name is correct
3. Use `--log=trace` to see detailed error messages

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
.hook('after-install', async ({ logger, $ }) => {
  try {
    await $`./setup.sh`;
  } catch (error) {
    logger.error('Setup failed');
    throw error;
  }
})
```

- `$` uses tool directory as cwd
- Always await `$` commands
- Handle errors with try/catch

## Verification Commands

```bash
# Check generated files for a tool
dotfiles files tool-name

# View shim contents
cat ~/.generated/usr-local-bin/tool-name

# Test binary
tool-name --version
```

## Next Steps

- [Testing](./testing.md) - Validation approaches
- [Common Patterns](./common-patterns.md) - Working examples