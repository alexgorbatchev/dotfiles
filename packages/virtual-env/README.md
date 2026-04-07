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

# Create at an absolute path
dotfiles env create /path/to/project/env
```

This creates a directory structure:

```
env/
├── source       # POSIX shell script to activate the environment
├── source.ps1   # PowerShell script to activate the environment
├── config.ts    # Dotfiles configuration file
├── .config/     # XDG_CONFIG_HOME directory for tool configs
└── tools/       # Tool configuration directory
```

### Activating an Environment

**POSIX shells (bash, zsh, sh):**

```bash
source env/source
# or
. ./env/source
```

**PowerShell:**

```powershell
. .\env\source.ps1
```

When activated:

- `DOTFILES_ENV_DIR` is set to the absolute path of the environment directory
- `DOTFILES_ENV_NAME` is set to the environment name
- `XDG_CONFIG_HOME` is set to `$DOTFILES_ENV_DIR/.config` for tool configuration isolation
- All dotfiles commands automatically use `env/config.ts` as the configuration
- The environment's `user-bin` directory is added to `PATH`

### Deactivating

**POSIX shells:**

```bash
dotfiles-deactivate
```

**PowerShell:**

```powershell
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

| Variable            | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `DOTFILES_ENV_DIR`  | Absolute path to the active environment directory            |
| `DOTFILES_ENV_NAME` | Name of the active environment                               |
| `XDG_CONFIG_HOME`   | Set to `$DOTFILES_ENV_DIR/.config` for config file isolation |

## CLI Integration

When an environment is sourced (i.e., `DOTFILES_ENV_DIR` is set), all dotfiles commands that accept `--config` will automatically default to `$DOTFILES_ENV_DIR/config.ts` if no explicit `--config` is provided.

## Use Cases

### Project-Specific Tools

Create isolated tool configurations for different projects:

```bash
cd ~/projects/rust-project
dotfiles env create
source env/source

# Add rust-specific tools
cat > env/tools/rust-analyzer.tool.ts << 'EOF'
import { defineTool } from '@alexgorbatchev/dotfiles';
export default defineTool((install) =>
  install('github-release', { repo: 'rust-lang/rust-analyzer' })
    .bin('rust-analyzer')
);
EOF

dotfiles generate
dotfiles install rust-analyzer
```

### Team Environments

Share tool configurations with your team via version control:

```bash
# In your repo
dotfiles env create .devenv
echo ".devenv/.generated" >> .gitignore
git add .devenv/config.ts .devenv/tools/ .devenv/source .devenv/source.ps1
git commit -m "Add development environment"
```

Team members can then:

```bash
source .devenv/source
dotfiles install
```
