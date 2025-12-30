# Testing Configurations

## Validating Tool Configurations

### Type Checking

Check for TypeScript errors in your `.tool.ts` files:

```bash
bun typecheck
```

### Testing Installation

```bash
# Install a specific tool
dotfiles install tool-name

# Force reinstall
dotfiles install tool-name --force

# Verbose logging for debugging
dotfiles install tool-name --log=trace
```

### Verifying Generated Files

```bash
# List all files for a tool
dotfiles files tool-name
```

### Checking for Updates

```bash
# Check specific tool
dotfiles check-updates tool-name

# Check all tools
dotfiles check-updates
```

## Verification Steps

1. **Binary works**: `tool-name --version`
2. **Shim created**: `ls -la ~/.generated/usr-local-bin/tool-name`
3. **Shell integration**: Source shell scripts and test aliases/environment

## Next Steps

- [Troubleshooting](./troubleshooting.md) - Debug common issues
- [Common Patterns](./common-patterns.md) - Working examples