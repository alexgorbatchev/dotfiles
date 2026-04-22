# CLI Reference

The `dotfiles` CLI provides several commands to manage your tools:

```bash
# Initialize configuration for the first time
dotfiles init

# Install a tool by name
dotfiles install fzf

# Install a tool by binary name (finds tool that provides 'bat')
dotfiles install bat

# Generate shims and shell configuration files
dotfiles generate

# Update all tools to their latest versions
dotfiles update

# Check available updates using installed-state data when available
dotfiles check-updates

# View logs of file operations
dotfiles log

# Display tree of installed tool files
dotfiles files <toolName>

# Print the real path to a binary (resolves symlinks)
dotfiles bin <name>

# Create docs symlink in a directory
dotfiles docs <path>
```

## Completions

- `dotfiles generate` writes a zsh completion script to `${generatedDir}/shell-scripts/zsh/completions/_dotfiles`.
- Reload completions with `autoload -U compinit && compinit` (or restart your shell) after generating.
- Commands that accept a tool argument (e.g., `install`, `update`, `check-updates`, `files`, `log`, `bin`) now suggest every configured tool name directly in completion menus, so you can pick a target without memorizing identifiers.
- See [Shell & Hooks Reference](.agents/skills/dotfiles/references/shell-and-hooks.md) for shell-specific integration details.
