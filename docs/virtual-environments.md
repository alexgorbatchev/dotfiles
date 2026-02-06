# Virtual Environments

Virtual environments allow you to create isolated dotfiles configurations for different projects, similar to Python's `venv`, `pyenv`, or Hermit.

## Overview

Instead of a single global dotfiles configuration, you can create project-specific environments with their own:

- Tool configurations
- Generated shell scripts
- Installed binaries
- XDG configuration files

## Creating an Environment

```bash
# Create with default name 'env' in current directory
dotfiles env create

# Create with custom name
dotfiles env create my-env

# Create at absolute path
dotfiles env create /path/to/project/.devenv
```

This creates:

```
env/
├── source       # POSIX shell activation script
├── source.ps1   # PowerShell activation script
├── config.ts    # Dotfiles configuration
├── .config/     # XDG_CONFIG_HOME for tool configs
└── tools/       # Tool configuration directory
```

## Activating an Environment

**Bash/Zsh:**

```bash
source env/source
```

**PowerShell:**

```powershell
. .\env\source.ps1
```

When activated, the following environment variables are set:

| Variable            | Value                                |
| ------------------- | ------------------------------------ |
| `DOTFILES_ENV_DIR`  | Absolute path to environment         |
| `DOTFILES_ENV_NAME` | Environment directory name           |
| `XDG_CONFIG_HOME`   | `$DOTFILES_ENV_DIR/.config`          |
| `PATH`              | Prepended with environment's bin dir |

## Using an Activated Environment

Once activated, all dotfiles commands use the environment's configuration automatically:

```bash
source env/source

# These all use env/config.ts automatically
dotfiles generate
dotfiles install
dotfiles update fd
```

No need to pass `--config` - the CLI detects `DOTFILES_ENV_DIR` and uses its `config.ts`.

## Adding Tools

Create tool configuration files in the `tools/` directory:

```bash
source env/source

cat > env/tools/fd.tool.ts << 'EOF'
import { defineTool } from '@gitea/dotfiles';

export default defineTool((install) =>
  install('github-release', { repo: 'sharkdp/fd' })
    .bin('fd')
);
EOF

dotfiles generate
dotfiles install fd
```

## Deactivating

```bash
dotfiles-deactivate
```

This restores the previous `PATH` and `XDG_CONFIG_HOME` values.

## Deleting an Environment

```bash
# Delete default 'env' directory
dotfiles env delete

# Delete specific environment
dotfiles env delete my-env

# Force delete without confirmation
dotfiles env delete --force
```

## Use Cases

### Project-Specific Tools

Keep project tools isolated from your global configuration:

```bash
cd ~/projects/data-science
dotfiles env create
source env/source

# Add project-specific tools
cat > env/tools/jupyter.tool.ts << 'EOF'
import { defineTool } from '@gitea/dotfiles';
export default defineTool((install) =>
  install('manual').bin('jupyter')
    .zsh((shell) => shell.aliases({
      jn: 'jupyter notebook',
      jl: 'jupyter lab'
    }))
);
EOF

dotfiles generate
```

### Team Environments

Share tool configurations with your team:

```bash
cd ~/work/team-project
dotfiles env create .devenv

# Configure shared tools
# ...

# Add to version control
echo ".devenv/.generated" >> .gitignore
git add .devenv/config.ts .devenv/tools/ .devenv/source .devenv/source.ps1
git commit -m "Add development environment"
```

Team members then run:

```bash
git clone <repo>
cd team-project
source .devenv/source
dotfiles install
```

### Multiple Environments

Different projects can have different tool versions:

```bash
# Project A uses older tools
cd ~/projects/legacy
dotfiles env create
source env/source
# Configure tools...

# Project B uses latest
cd ~/projects/modern
dotfiles env create
source env/source
# Configure different versions...
```

## XDG Configuration Isolation

The environment sets `XDG_CONFIG_HOME` to isolate tool configuration files:

```bash
source env/source
echo $XDG_CONFIG_HOME
# /path/to/env/.config

# Tools that respect XDG will store config here
# e.g., ~/.config/nvim becomes env/.config/nvim
```

This prevents activated environments from affecting global tool configurations.

## Generated Files

After running `dotfiles generate`, the environment contains:

```
env/
├── .generated/
│   ├── shell-scripts/
│   │   ├── main.zsh
│   │   ├── main.bash
│   │   └── main.ps1
│   ├── user-bin/
│   │   └── <tool shims>
│   └── binaries/
│       └── <installed tools>
├── source
├── source.ps1
├── config.ts
├── .config/
└── tools/
```

The activation script sources the generated shell scripts and adds `user-bin` to PATH.
