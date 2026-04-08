# Virtual Environment Package

## Purpose

Provides virtual environment management for dotfiles, allowing isolated configurations within project directories.

## Key Components

- `VirtualEnvManager` - Core class for creating, deleting, and managing environments
- `generateSourceScript()` - Generates shell activation script
- `generateDefaultConfig()` - Generates default dotfiles.config.ts template
- `ENV_DIR_VAR`, `ENV_NAME_VAR` - Environment variable names

## Environment Structure

```
[env-name]/
├── source       # Shell activation script (source this to activate)
├── dotfiles.config.ts    # Dotfiles configuration
└── tools/       # Tool configurations directory
```

## Integration Points

- CLI config resolution checks `DOTFILES_ENV_DIR` and defaults `--config` to `$DOTFILES_ENV_DIR/dotfiles.config.ts`
- When sourced, sets `DOTFILES_ENV_DIR` and `DOTFILES_ENV_NAME` env vars
- Provides `dotfiles-deactivate` function to clean up environment

## Testing

Tests are located in `src/__tests__/` and cover:

- Environment creation with default and custom names
- Source script generation
- Config template generation
- Environment deletion
- Environment detection by name in a directory
