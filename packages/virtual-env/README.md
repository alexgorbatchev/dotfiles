# @dotfiles/virtual-env

Virtual environment management for dotfiles, similar to pyenv, uv, or hermit.

## Overview

This package provides the ability to create isolated dotfiles environments within project directories. When an environment is activated by sourcing its activation script, all dotfiles commands automatically use the environment's configuration.

## Usage

### Creating an Environment

```bash
# Create environment with default name 'env'
dotfiles env create

# Create environment with custom name
dotfiles env create my-env
```

This creates a directory structure:

```
env/
├── source       # Shell script to activate the environment
├── config.ts    # Dotfiles configuration file
└── tools/       # Tool configuration directory
```

### Activating an Environment

```bash
# Source the activation script
source env/source

# Or from within a shell
. ./env/source
```

When activated:

- `DOTFILES_ENV_DIR` is set to the absolute path of the environment directory
- `DOTFILES_ENV_NAME` is set to the environment name
- All dotfiles commands automatically use `env/config.ts` as the configuration

### Deactivating

```bash
dotfiles-deactivate
```

### Deleting an Environment

```bash
# Delete with confirmation prompt
dotfiles env delete

# Delete specific environment
dotfiles env delete my-env

# Force delete without confirmation
dotfiles env delete --force
```

## Environment Variables

| Variable            | Description                                       |
| ------------------- | ------------------------------------------------- |
| `DOTFILES_ENV_DIR`  | Absolute path to the active environment directory |
| `DOTFILES_ENV_NAME` | Name of the active environment                    |

## CLI Integration

When an environment is sourced (i.e., `DOTFILES_ENV_DIR` is set), all dotfiles commands that accept `--config` will automatically default to `$DOTFILES_ENV_DIR/config.ts` if no explicit `--config` is provided.
